import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as automations from '@/app/api/v1/automations/route';
import * as automationByKey from '@/app/api/v1/automations/[key]/route';
import * as runs from '@/app/api/v1/automation-runs/route';
import * as quickAdd from '@/app/api/v1/leads/quick-add/route';
import * as rules from '@/app/api/v1/assignment-rules/route';
import { closeDb, withService } from '@/server/db';
import { enqueue } from '@/server/queue';
import { setWhatsAppSender, type TemplateMessage } from '@/server/core/whatsapp';
import { runStaleDealAlerts } from '@/server/automations/engine';
import { processJobs } from '@/worker/jobs';
import { admin, call, team } from './helpers';

let t: Awaited<ReturnType<typeof team>>;
const sent: TemplateMessage[] = [];
let waFails = false;
let stages: { open: string; visit: string; won: string; lost: string };
let pipeline: string;

async function drain() {
  for (let i = 0; i < 10; i++) if ((await processJobs('auto-test', 50)).processed === 0) return;
}
const patch = (key: string, body: unknown, as = t.manager) =>
  call(automationByKey.PATCH, { method: 'PATCH', as, ws: t.ws, params: { key }, body });

async function deal(title: string, stage: string, opts: { owner?: string; contact?: string | null; value?: number; enteredDaysAgo?: number } = {}) {
  const [d] = await admin<{ id: string }[]>`
    insert into public.deals (workspace_id, pipeline_id, stage_id, contact_id, title, value_pkr, owner_id, stage_entered_at)
    values (${t.ws}, ${pipeline}, ${stage}, ${opts.contact ?? null}, ${title}, ${opts.value ?? null}, ${opts.owner ?? t.ali},
            now() - make_interval(days => ${opts.enteredDaysAgo ?? 0}))
    returning id`;
  return d.id;
}

beforeAll(async () => {
  setWhatsAppSender({
    async sendTemplate(msg) {
      if (waFails) throw new Error('template not approved');
      sent.push(msg);
      return { messageId: `wamid.auto.${sent.length}` };
    },
  });
  t = await team('Auto Estates');
  await call(rules.PUT, { method: 'PUT', as: t.manager, ws: t.ws, body: { mode: 'round_robin', agent_ids: [t.ali] } });
  const [p] = await admin<{ id: string }[]>`insert into public.pipelines (workspace_id, name) values (${t.ws}, 'Sales') returning id`;
  pipeline = p.id;
  const ins = (name: string, pos: number, kind: string) =>
    admin<{ id: string }[]>`insert into public.stages (pipeline_id, name, position, kind) values (${pipeline}, ${name}, ${pos}, ${kind}) returning id`;
  stages = {
    open: (await ins('New', 0, 'open'))[0].id,
    visit: (await ins('Site visit', 1, 'open'))[0].id,
    won: (await ins('Won', 2, 'won'))[0].id,
    lost: (await ins('Lost', 3, 'lost'))[0].id,
  };
});

beforeEach(async () => {
  await admin`delete from public.jobs`;
  sent.length = 0;
  waFails = false;
});

afterAll(async () => {
  await closeDb();
});

describe('GET/PATCH /automations', () => {
  it('lists the six presets, all off, with defaults and a settings schema', async () => {
    const res = await call(automations.GET, { as: t.ali, ws: t.ws });
    expect(res.status).toBe(200);
    expect(res.body.data.map((a: { key: string }) => a.key)).toEqual([
      'welcome_message', 'auto_follow_up', 'no_answer_retry', 'stage_follow_up', 'stale_deal_alert', 'won_notice',
    ]);
    expect(res.body.data.every((a: { enabled: boolean }) => !a.enabled)).toBe(true);
    const follow = res.body.data.find((a: { key: string }) => a.key === 'auto_follow_up');
    expect(follow.settings).toEqual({ due_in_minutes: 15, type: 'call' });
    expect(follow.settings_schema.properties.due_in_minutes).toMatchObject({ type: 'integer', maximum: 10080 });
  });

  it('validates settings and refuses to enable an incomplete rule', async () => {
    expect((await patch('welcome_message', { enabled: true })).body.error.code).toBe('incomplete_settings');
    const bad = await patch('auto_follow_up', { settings: { due_in_minutes: -5 } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0].path).toBe('settings.due_in_minutes');
    expect((await patch('nope', { enabled: true })).status).toBe(404);
    expect((await patch('auto_follow_up', { enabled: true }, t.ali)).status).toBe(403);
  });

  it('enables rules and merges settings', async () => {
    expect((await patch('welcome_message', { enabled: true, settings: { template_name: 'welcome_lead', language: 'ur' } })).status).toBe(200);
    expect((await patch('auto_follow_up', { enabled: true, settings: { due_in_minutes: 10 } })).body.data)
      .toEqual({ key: 'auto_follow_up', enabled: true, settings: { due_in_minutes: 10, type: 'call' } });
    const again = await patch('auto_follow_up', { settings: { type: 'whatsapp' } });
    expect(again.body.data.settings).toEqual({ due_in_minutes: 10, type: 'whatsapp' });
    await patch('auto_follow_up', { settings: { type: 'call' } });
  });
});

describe('lead rules', () => {
  it('welcomes a new lead on WhatsApp and creates the owner a follow-up, logging both', async () => {
    const before = Date.now();
    const id = (await call(quickAdd.POST, { method: 'POST', as: t.manager, ws: t.ws, body: { name: 'Haris Sohail', phone: '03211000001', assign_to: 'auto' } })).body.data.contact_id;
    await drain();

    expect(sent).toEqual([{ workspaceId: t.ws, to: '+923211000001', template: 'welcome_lead', language: 'ur', params: ['Haris'] }]);
    const [wa] = await admin`select body, meta from public.activities where contact_id = ${id} and type = 'whatsapp'`;
    expect(wa.meta).toMatchObject({ automation: 'welcome_message', message_id: 'wamid.auto.1' });
    expect((await admin`select first_response_at from public.contacts where id = ${id}`)[0].first_response_at).toBeNull();

    const [task] = await admin`select * from public.tasks where contact_id = ${id}`;
    expect(task).toMatchObject({ assigned_to: t.ali, origin: 'automation', type: 'call', title: 'Call Haris Sohail' });
    const due = new Date(task.due_at).getTime();
    expect(due).toBeGreaterThan(before + 9 * 60_000);
    expect(due).toBeLessThan(Date.now() + 11 * 60_000);

    const logged = await admin`select automation_key, status, result from public.automation_runs where contact_id = ${id} order by automation_key`;
    expect(logged.map((r) => [r.automation_key, r.status])).toEqual([['auto_follow_up', 'success'], ['welcome_message', 'success']]);
  });

  it('on a re-enquiry: no second welcome, no duplicate follow-up while one is open', async () => {
    await call(quickAdd.POST, { method: 'POST', as: t.manager, ws: t.ws, body: { phone: '+923211000001', assign_to: 'auto' } });
    await drain();
    expect(sent).toHaveLength(0);
    const r = await admin`select automation_key, status, result from public.automation_runs
                           where trigger_event = 'lead.received' order by created_at desc limit 2`;
    expect(Object.fromEntries(r.map((x) => [x.automation_key, x.result.reason]))).toEqual({
      welcome_message: 're-enquiry: already welcomed',
      auto_follow_up: 'owner already has an open follow-up for this lead',
    });
  });

  it('logs a failed send without blocking the other rules, and never runs a rule twice for one event', async () => {
    waFails = true;
    const id = (await call(quickAdd.POST, { method: 'POST', as: t.manager, ws: t.ws, body: { name: 'Fail Faisal', phone: '03211000002', assign_to: 'auto' } })).body.data.contact_id;
    await drain();
    const r = await admin`select automation_key, status, error from public.automation_runs where contact_id = ${id} order by automation_key`;
    expect(r).toEqual([
      { automation_key: 'auto_follow_up', status: 'success', error: null },
      { automation_key: 'welcome_message', status: 'failed', error: 'template not approved' },
    ]);
    // The job itself succeeded; replaying it changes nothing.
    await admin`update public.jobs set status = 'queued', run_at = now() where name = 'lead.received'`;
    await drain();
    expect(await admin`select 1 from public.automation_runs where contact_id = ${id}`).toHaveLength(2);
    expect(await admin`select 1 from public.tasks where contact_id = ${id}`).toHaveLength(1);
  });

  it('no-answer retry: books a call for tomorrow 11:00 local for the caller', async () => {
    await patch('no_answer_retry', { enabled: true });
    const [c] = await admin`select id from public.contacts where phone_e164 = '+923211000001'`;
    await withService((tx) => enqueue(tx, 'call.logged', { contact_id: c.id, outcome: 'no_answer', actor_id: t.sara }, { workspaceId: t.ws }));
    await withService((tx) => enqueue(tx, 'call.logged', { contact_id: c.id, outcome: 'interested', actor_id: t.sara }, { workspaceId: t.ws }));
    await drain();
    const tasks = await admin`select title, assigned_to, due_at from public.tasks where contact_id = ${c.id} and assigned_to = ${t.sara}`;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe('Call again: Haris Sohail');
    const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(tasks[0].due_at);
    expect(local).toBe('11:00');
    expect(tasks[0].due_at.getTime() - Date.now()).toBeGreaterThan(0);
    expect(tasks[0].due_at.getTime() - Date.now()).toBeLessThan(48 * 3600_000);
  });
});

describe('deal rules', () => {
  it('stage follow-up: task for the owner N days after reaching a chosen stage', async () => {
    expect((await patch('stage_follow_up', { enabled: true })).body.error.code).toBe('incomplete_settings');
    await patch('stage_follow_up', { enabled: true, settings: { stage_ids: [stages.visit], days: 3, title: 'Ask how the visit went' } });
    const d = await deal('5 marla, Bahria', stages.visit, { owner: t.bilal });
    await withService((tx) => enqueue(tx, 'deal.stage_changed', { deal_id: d, from_stage_id: stages.open, to_stage_id: stages.visit }, { workspaceId: t.ws }));
    await withService((tx) => enqueue(tx, 'deal.stage_changed', { deal_id: d, from_stage_id: stages.visit, to_stage_id: stages.open }, { workspaceId: t.ws }));
    await drain();
    const tasks = await admin`select title, assigned_to, deal_id, due_at from public.tasks where deal_id = ${d}`;
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ title: 'Ask how the visit went', assigned_to: t.bilal });
    const days = (tasks[0].due_at.getTime() - Date.now()) / 86400_000;
    expect(days).toBeGreaterThan(2);
    expect(days).toBeLessThan(4);
  });

  it('won notice: tells everyone and sends the customer a thank-you', async () => {
    expect((await patch('won_notice', { enabled: true, settings: { send_thank_you: true } })).body.error.code).toBe('incomplete_settings');
    await patch('won_notice', { enabled: true, settings: { send_thank_you: true, template_name: 'thank_you' } });
    const [c] = await admin`select id from public.contacts where phone_e164 = '+923211000001'`;
    const d = await deal('10 marla, DHA', stages.won, { owner: t.ali, contact: c.id, value: 25_000_000 });
    await withService((tx) => enqueue(tx, 'deal.won', { deal_id: d }, { workspaceId: t.ws }));
    await drain();
    const ns = await admin`select user_id, title from public.notifications where type = 'deal.won' and data->>'deal_id' = ${d}`;
    expect(ns).toHaveLength(4);
    expect(ns[0].title).toBe('Deal won by Ali: 10 marla, DHA (Rs. 25,000,000)');
    expect(sent).toEqual([{ workspaceId: t.ws, to: '+923211000001', template: 'thank_you', language: 'en', params: ['Haris'] }]);
  });

  it('stale deal alert: once per deal per stage visit', async () => {
    await patch('stale_deal_alert', { enabled: true, settings: { days: 7 } });
    const stale = await deal('Stuck deal', stages.open, { owner: t.sara, enteredDaysAgo: 10 });
    await deal('Fresh deal', stages.open, { enteredDaysAgo: 2 });
    await deal('Closed deal', stages.lost, { enteredDaysAgo: 30 });
    expect(await withService(runStaleDealAlerts)).toEqual({ alerted: 1 });
    expect(await withService(runStaleDealAlerts)).toEqual({ alerted: 0 });
    const ns = await admin`select user_id from public.notifications where type = 'deal.stale' and data->>'deal_id' = ${stale}`;
    expect(ns.map((n) => n.user_id).sort()).toEqual([t.manager, t.sara].sort());

    // Moves and stalls again: alerted again.
    await admin`update public.deals set stage_entered_at = now() - interval '8 days' where id = ${stale}`;
    expect(await withService(runStaleDealAlerts)).toEqual({ alerted: 1 });
  });

  it('does nothing for rules that are switched off', async () => {
    await patch('won_notice', { enabled: false });
    const d = await deal('Quiet win', stages.won);
    await withService((tx) => enqueue(tx, 'deal.won', { deal_id: d }, { workspaceId: t.ws }));
    await drain();
    expect(await admin`select 1 from public.automation_runs where deal_id = ${d}`).toHaveLength(0);
  });
});

describe('GET /automation-runs', () => {
  it('filters and paginates for managers only', async () => {
    expect((await call(runs.GET, { as: t.ali, ws: t.ws })).status).toBe(403);
    const failed = await call(runs.GET, { as: t.manager, ws: t.ws, query: { status: 'failed' } });
    expect(failed.body.data).toHaveLength(1);
    expect(failed.body.data[0]).toMatchObject({ automation_key: 'welcome_message', contact_name: 'Fail Faisal', error: 'template not approved' });

    const p1 = await call(runs.GET, { as: t.manager, ws: t.ws, query: { limit: '3' } });
    const p2 = await call(runs.GET, { as: t.manager, ws: t.ws, query: { limit: '3', cursor: p1.body.next_cursor } });
    const ids = [...p1.body.data, ...p2.body.data].map((r: { id: string }) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(p2.body.data.length).toBeGreaterThan(0);
  });
});
