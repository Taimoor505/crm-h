import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as sources from '@/app/api/v1/lead-sources/route';
import * as hook from '@/app/api/v1/hooks/leads/[key]/route';
import * as rules from '@/app/api/v1/assignment-rules/route';
import * as summary from '@/app/api/v1/home/summary/route';
import * as quickAdd from '@/app/api/v1/leads/quick-add/route';
import * as tasks from '@/app/api/v1/tasks/route';
import { closeDb, withService, withUser } from '@/server/db';
import { enqueue } from '@/server/queue';
import { logActivity } from '@/server/core/contacts';
import { processJobs, HANDLERS } from '@/worker/jobs';
import { runSchedulerTick, SCHEDULE } from '@/worker/scheduler';
import { admin, call, minutesFromNow, team } from './helpers';

let t: Awaited<ReturnType<typeof team>>;
let key: string;
let secret: string;

async function postLead(phone: string, name?: string) {
  const raw = JSON.stringify({ phone, name });
  const res = await call(hook.POST, {
    method: 'POST', params: { key }, rawBody: raw,
    headers: { 'content-type': 'application/json', 'x-signature': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}` },
  });
  return res.body.contact_id as string;
}

const reassignOnly = SCHEDULE.filter((j) => j.key === 'leads.auto_reassign');

beforeAll(async () => {
  t = await team('Worker Wholesale');
  const s = await call(sources.POST, { method: 'POST', as: t.manager, ws: t.ws, body: { type: 'webhook', name: 'Facebook (Zapier)', source_label: 'facebook' } });
  key = s.body.data.public_key;
  secret = s.body.data.secret;
  await call(rules.PUT, {
    method: 'PUT', as: t.manager, ws: t.ws,
    body: { mode: 'round_robin', agent_ids: [t.ali, t.sara, t.bilal], reassign_after_minutes: 10, max_auto_reassigns: 1 },
  });
});

beforeEach(async () => {
  await admin`truncate public.scheduler_runs`;
});

afterAll(async () => {
  await closeDb();
});

describe('auto-reassign untouched leads', () => {
  it('moves a lead nobody touched within N minutes, once, and tells both agents', async () => {
    const id = await postLead('03008000001', 'Slow Sohail');
    const [c0] = await admin`select owner_id from public.contacts where id = ${id}`;
    await admin`update public.contacts set assigned_at = now() - interval '11 minutes' where id = ${id}`;

    const now = new Date();
    const first = await runSchedulerTick('test-1', now, reassignOnly);
    expect(first[0]).toMatchObject({ status: 'done', result: { reassigned: 1 } });

    const [c1] = await admin`select owner_id, auto_reassign_count from public.contacts where id = ${id}`;
    expect(c1.owner_id).not.toBe(c0.owner_id);
    expect(c1.auto_reassign_count).toBe(1);

    const [act] = await admin`select meta from public.activities where contact_id = ${id} and type = 'assignment' order by created_at desc limit 1`;
    expect(act.meta).toMatchObject({ from: c0.owner_id, to: c1.owner_id, reason: 'auto_reassign' });
    const [away] = await admin`select * from public.notifications where user_id = ${c0.owner_id} and type = 'lead.reassigned_away'`;
    expect(away.data.contact_id).toBe(id);

    // Same window again (a second worker, or a retry): skipped.
    const again = await runSchedulerTick('test-2', now, reassignOnly);
    expect(again[0].status).toBe('skipped');

    // Next window, still untouched, but max_auto_reassigns = 1 → stays put.
    await admin`update public.contacts set assigned_at = now() - interval '11 minutes' where id = ${id}`;
    const later = await runSchedulerTick('test-1', new Date(now.getTime() + 60_000), reassignOnly);
    expect(later[0]).toMatchObject({ status: 'done', result: { reassigned: 0 } });

    const [run] = await admin`select * from public.scheduler_runs where job_key = 'leads.auto_reassign' order by window_start limit 1`;
    expect(run).toMatchObject({ status: 'done', worker: 'test-1' });
  });

  it('leaves leads alone once someone has responded', async () => {
    const id = await postLead('03008000002');
    const [c] = await admin`select owner_id from public.contacts where id = ${id}`;
    await withUser(c.owner_id, (tx) => logActivity(tx, { workspaceId: t.ws, contactId: id, type: 'call', actorId: c.owner_id, body: 'Called' }));
    await admin`update public.contacts set assigned_at = now() - interval '11 minutes' where id = ${id}`;
    const res = await runSchedulerTick('test-1', new Date(), reassignOnly);
    expect(res[0].result).toMatchObject({ reassigned: 0 });
    expect((await admin`select owner_id from public.contacts where id = ${id}`)[0].owner_id).toBe(c.owner_id);
  });

  it('does nothing when auto-reassign is off (the default)', async () => {
    const other = await team('Off By Default');
    await call(rules.PUT, { method: 'PUT', as: other.manager, ws: other.ws, body: { mode: 'round_robin', agent_ids: [other.ali, other.sara] } });
    await call(quickAdd.POST, { method: 'POST', as: other.manager, ws: other.ws, body: { phone: '03008000003', assign_to: 'auto' } });
    await admin`update public.contacts set assigned_at = now() - interval '2 hours' where workspace_id = ${other.ws}`;
    const res = await runSchedulerTick('test-1', new Date(), reassignOnly);
    expect(res[0].result).toMatchObject({ reassigned: 0 });
  });
});

describe('job queue', () => {
  it('turns an inbound WhatsApp contact (Taimoor\'s contact.created) into an assigned lead', async () => {
    await admin`delete from public.jobs`;
    const [c] = await admin`
      insert into public.contacts (workspace_id, name, phone_e164, source) values (${t.ws}, 'WA Waleed', '+923008000010', 'whatsapp')
      returning id`;
    await withService((tx) => enqueue(tx, 'contact.created', { contact_id: c.id, source: 'whatsapp' }, { workspaceId: t.ws }));

    expect(await processJobs('test-worker')).toEqual({ processed: 1, failed: 0 });
    const [after] = await admin`select owner_id, last_enquiry_at from public.contacts where id = ${c.id}`;
    expect(after.owner_id).not.toBeNull();
    expect(after.last_enquiry_at).not.toBeNull();
    const [job] = await admin`select status, attempts from public.jobs where name = 'contact.created'`;
    expect(job).toMatchObject({ status: 'done', attempts: 1 });

    // Delivered twice (at-least-once queue): no second assignment.
    await withService((tx) => enqueue(tx, 'contact.created', { contact_id: c.id, source: 'whatsapp' }, { workspaceId: t.ws }));
    await processJobs('test-worker');
    const acts = await admin`select 1 from public.activities where contact_id = ${c.id} and type = 'assignment'`;
    expect(acts).toHaveLength(1);
  });

  it('dedupes by key, retries failures with backoff, then gives up', async () => {
    await admin`delete from public.jobs`;
    const ids = await withService(async (tx) => [
      await enqueue(tx, 'test.explode', {}, { dedupeKey: 'boom-1' }),
      await enqueue(tx, 'test.explode', {}, { dedupeKey: 'boom-1' }),
    ]);
    expect(ids[1]).toBeNull();

    HANDLERS['test.explode'] = async () => {
      throw new Error('kaboom');
    };
    try {
      await admin`update public.jobs set max_attempts = 2`;
      expect(await processJobs('w')).toEqual({ processed: 1, failed: 1 });
      const [j1] = await admin`select status, attempts, last_error, run_at > now() as delayed from public.jobs`;
      expect(j1).toMatchObject({ status: 'queued', attempts: 1, delayed: true });
      expect(j1.last_error).toContain('kaboom');

      await admin`update public.jobs set run_at = now()`;
      await processJobs('w');
      const [j2] = await admin`select status, attempts from public.jobs`;
      expect(j2).toMatchObject({ status: 'dead', attempts: 2 });
    } finally {
      delete HANDLERS['test.explode'];
    }
  });

  it('marks events nobody handles yet as done', async () => {
    await admin`delete from public.jobs`;
    await withService((tx) => enqueue(tx, 'deal.won', { deal_id: 'x' }));
    await processJobs('w');
    expect((await admin`select status from public.jobs`)[0].status).toBe('done');
  });

  it('housekeeping purges lead payloads after 30 days', async () => {
    await admin`update public.lead_events set received_at = now() - interval '31 days'
                 where id = (select id from public.lead_events where workspace_id = ${t.ws} limit 1)`;
    const res = await runSchedulerTick('w', new Date(), SCHEDULE.filter((j) => j.key === 'housekeeping'));
    expect(res[0]).toMatchObject({ status: 'done', result: { lead_events: 1 } });
  });
});

describe('GET /home/summary', () => {
  it("gives an agent their own day at a glance", async () => {
    const h = await team('Home Homes');
    await call(quickAdd.POST, { method: 'POST', as: h.ali, ws: h.ws, body: { name: 'Fresh', phone: '03009000001' } });
    const responded = (await call(quickAdd.POST, { method: 'POST', as: h.ali, ws: h.ws, body: { name: 'Answered', phone: '03009000002' } })).body.data.contact_id;
    await call(quickAdd.POST, { method: 'POST', as: h.sara, ws: h.ws, body: { name: 'Not Ali', phone: '03009000003' } });
    await withUser(h.ali, (tx) => logActivity(tx, { workspaceId: h.ws, contactId: responded, type: 'call', actorId: h.ali }));
    await call(tasks.POST, { method: 'POST', as: h.ali, ws: h.ws, body: { type: 'call', title: 'Late', due_at: minutesFromNow(-30) } });
    await call(tasks.POST, { method: 'POST', as: h.ali, ws: h.ws, body: { type: 'call', title: 'Later', due_at: minutesFromNow(5 * 24 * 60) } });
    await admin`insert into public.contacts (workspace_id, phone_e164, source, last_enquiry_at) values (${h.ws}, '+923009000004', 'website', now())`;

    const res = await call(summary.GET, { as: h.ali, ws: h.ws });
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.me).toEqual({ user_id: h.ali, role: 'agent', available: true });
    expect(d.tasks).toMatchObject({ overdue: 1, upcoming: 1 });
    expect(d.tasks.next.map((x: { title: string }) => x.title)).toEqual(['Late']);
    expect(d.leads).toMatchObject({ new_today: 2, awaiting_first_response: 1, unassigned: null });
    expect(d.leads.recent.map((x: { name: string }) => x.name).sort()).toEqual(['Answered', 'Fresh']);
    expect(d.speed_to_lead_today.responded).toBe(1);
    expect(typeof d.speed_to_lead_today.median_seconds).toBe('number');

    expect((await call(summary.GET, { as: h.ali, ws: h.ws, query: { scope: 'team' } })).status).toBe(403);

    const team_ = await call(summary.GET, { as: h.manager, ws: h.ws, query: { scope: 'team' } });
    expect(team_.body.data.leads).toMatchObject({ new_today: 4, unassigned: 1 });
  });
});
