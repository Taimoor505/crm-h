import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as settings from '@/app/api/v1/notification-settings/route';
import * as pushSubs from '@/app/api/v1/push-subscriptions/route';
import * as quickAdd from '@/app/api/v1/leads/quick-add/route';
import * as tasks from '@/app/api/v1/tasks/route';
import * as assign from '@/app/api/v1/contacts/[id]/assign/route';
import { closeDb, withService } from '@/server/db';
import { setPushDriver, type PushResult } from '@/server/channels/push';
import { setWhatsAppSender, type TemplateMessage } from '@/server/core/whatsapp';
import { notify } from '@/server/notifications/service';
import {
  sendOverdueAlerts, sendOverdueDigests, sendTaskReminders, sendUntouchedLeadAlerts,
} from '@/server/followups/alerts';
import { processJobs } from '@/worker/jobs';
import { admin, call, minutesFromNow, team } from './helpers';

/** An Etc/GMT zone whose local hour right now satisfies `pred`. */
function zoneWhere(pred: (hour: number) => boolean): string {
  for (let off = -12; off <= 14; off++) {
    const name = off === 0 ? 'Etc/GMT' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`; // Etc signs are inverted
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: name, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    if (pred(hour)) return name;
  }
  throw new Error('no zone found');
}
const DAY_ZONE = zoneWhere((h) => h >= 10 && h < 21);
const NIGHT_ZONE = zoneWhere((h) => h >= 0 && h < 6);

const pushed: { endpoint: string; title: string }[] = [];
const whatsapps: TemplateMessage[] = [];
let pushBehaviour: (endpoint: string) => PushResult | Error = () => 'sent';
let waBehaviour: () => Error | null = () => null;

let t: Awaited<ReturnType<typeof team>>;

/** Run the queue until it's empty (dispatch → deliver chains). */
async function drain() {
  for (let i = 0; i < 10; i++) {
    const { processed } = await processJobs('notif-test', 50);
    if (processed === 0) return;
  }
}

async function deliveries(notificationId: string) {
  return admin`select channel, status, error, attempts, scheduled_for from public.notification_deliveries
                where notification_id = ${notificationId} order by channel`;
}

beforeAll(async () => {
  setPushDriver({
    async send(sub, payload) {
      const r = pushBehaviour(sub.endpoint);
      if (r instanceof Error) throw r;
      if (r === 'sent') pushed.push({ endpoint: sub.endpoint, title: payload.title });
      return r;
    },
  });
  setWhatsAppSender({
    async sendTemplate(msg) {
      const e = waBehaviour();
      if (e) throw e;
      whatsapps.push(msg);
      return { messageId: `wamid.${whatsapps.length}` };
    },
  });
  process.env.WHATSAPP_COST_PKR = '4.5';
  t = await team('Notify Naya');
  await admin`update public.workspaces set timezone = ${DAY_ZONE} where id = ${t.ws}`;
  await admin`update public.users set phone = '+923001110000' where id = ${t.ali}`;
});

beforeEach(async () => {
  await admin`delete from public.jobs`;
  pushed.length = 0;
  whatsapps.length = 0;
  pushBehaviour = () => 'sent';
  waBehaviour = () => null;
});

afterAll(async () => {
  delete process.env.WHATSAPP_COST_PKR;
  await closeDb();
});

describe('settings and subscriptions', () => {
  it('shows defaults: WhatsApp only for urgent events', async () => {
    const res = await call(settings.GET, { as: t.ali, ws: t.ws });
    expect(res.status).toBe(200);
    const byType = Object.fromEntries(res.body.data.events.map((e: { type: string }) => [e.type, e]));
    expect(byType['lead.assigned']).toMatchObject({ in_app: true, push: true, whatsapp: true });
    expect(byType['task.reminder']).toMatchObject({ push: true, whatsapp: false });
    expect(res.body.data).toMatchObject({ quiet_hours: true, whatsapp_number_effective: '+923001110000', push: { devices: 0 } });
  });

  it('saves partial changes and validates the number', async () => {
    const bad = await call(settings.PUT, { method: 'PUT', as: t.sara, ws: t.ws, body: { whatsapp_number: '123' } });
    expect(bad.status).toBe(422);
    const res = await call(settings.PUT, {
      method: 'PUT', as: t.sara, ws: t.ws,
      body: { events: [{ type: 'lead.assigned', whatsapp: false }], whatsapp_number: '0321-2223333' },
    });
    expect(res.status).toBe(200);
    const la = res.body.data.events.find((e: { type: string }) => e.type === 'lead.assigned');
    expect(la).toMatchObject({ push: true, whatsapp: false });
    expect(res.body.data.whatsapp_number).toBe('+923212223333');
    // Each user only sees their own settings.
    const ali = await call(settings.GET, { as: t.ali, ws: t.ws });
    expect(ali.body.data.events.find((e: { type: string }) => e.type === 'lead.assigned').whatsapp).toBe(true);
  });

  it('registers and removes push subscriptions', async () => {
    const sub = { endpoint: 'https://push.example/ali-phone', keys: { p256dh: 'BPx'.padEnd(20, 'x'), auth: 'authsecret' } };
    expect((await call(pushSubs.POST, { method: 'POST', as: t.ali, ws: t.ws, body: sub })).status).toBe(201);
    expect((await call(pushSubs.POST, { method: 'POST', as: t.ali, ws: t.ws, body: { ...sub, endpoint: 'https://push.example/ali-laptop' } })).status).toBe(201);
    expect((await call(settings.GET, { as: t.ali, ws: t.ws })).body.data.push.devices).toBe(2);
    const del = await call(pushSubs.DELETE, { method: 'DELETE', as: t.ali, ws: t.ws, body: { endpoint: 'https://push.example/ali-laptop' } });
    expect(del.body.data.removed).toBe(1);
  });
});

describe('dispatch and delivery', () => {
  it('sends an urgent lead alert by push and WhatsApp, and counts the WhatsApp for billing', async () => {
    const lead = await call(quickAdd.POST, { method: 'POST', as: t.manager, ws: t.ws, body: { name: 'Push Pervez', phone: '03011000001', assign_to: t.ali } });
    expect(lead.status).toBe(201);
    await drain();

    const [n] = await admin`select id from public.notifications where user_id = ${t.ali} and type = 'lead.assigned'`;
    const d = await deliveries(n.id);
    expect(d.map((x) => [x.channel, x.status])).toEqual([['in_app', 'delivered'], ['push', 'sent'], ['whatsapp', 'sent']]);
    expect(pushed).toEqual([{ endpoint: 'https://push.example/ali-phone', title: 'Lead assigned to you: Push Pervez' }]);
    expect(whatsapps[0]).toMatchObject({ to: '+923001110000', template: 'agent_alert', params: ['Lead assigned to you: Push Pervez', 'via Quick add'] });

    const [u] = await admin`select whatsapp_sent, whatsapp_cost_pkr::float as cost from public.usage_counters where workspace_id = ${t.ws}`;
    expect(u).toEqual({ whatsapp_sent: 1, cost: 4.5 });
  });

  it('respects per-user choices and skips channels with nowhere to send', async () => {
    // Sara turned WhatsApp off for new leads and has no push device.
    await call(assign.POST, {
      method: 'POST', as: t.manager, ws: t.ws,
      params: { id: (await admin`select id from public.contacts where phone_e164 = '+923011000001'`)[0].id },
      body: { user_id: t.sara },
    });
    await drain();
    const [n] = await admin`select id from public.notifications where user_id = ${t.sara} and type = 'lead.assigned'`;
    const d = await deliveries(n.id);
    expect(d.map((x) => [x.channel, x.status, x.error])).toEqual([
      ['in_app', 'delivered', null],
      ['push', 'skipped', 'no push subscription'],
    ]);
    expect(whatsapps).toHaveLength(0);
  });

  it('holds push and WhatsApp until 08:00 during quiet hours (in-app is immediate)', async () => {
    const night = await team('Night Owls');
    await admin`update public.workspaces set timezone = ${NIGHT_ZONE} where id = ${night.ws}`;
    await admin`update public.users set phone = '+923001119999' where id = ${night.ali}`;
    const id = await withService((tx) => notify(tx, {
      workspaceId: night.ws, userId: night.ali, type: 'task.overdue', title: 'Late', priority: 'urgent',
    }));
    await drain();
    const d = await deliveries(id!);
    const wa = d.find((x) => x.channel === 'whatsapp')!;
    expect(wa.status).toBe('queued');
    const localHour = new Intl.DateTimeFormat('en-GB', { timeZone: NIGHT_ZONE, hour: '2-digit', hourCycle: 'h23' }).format(wa.scheduled_for);
    expect(localHour).toBe('08');
    expect(whatsapps).toHaveLength(0);

    // Opted out of quiet hours: goes now.
    await admin`insert into public.notification_settings (workspace_id, user_id, quiet_hours) values (${night.ws}, ${night.ali}, false)`;
    const id2 = await withService((tx) => notify(tx, { workspaceId: night.ws, userId: night.ali, type: 'task.overdue', title: 'Late 2' }));
    await drain();
    expect((await deliveries(id2!)).find((x) => x.channel === 'whatsapp')!.status).toBe('sent');
  });

  it('quiet_hours_release() maps night times to 08:00 local and leaves daytime alone', async () => {
    const [r] = await admin`
      select public.quiet_hours_release('Asia/Karachi', '2026-11-18 18:30:00+00') as late,   -- 23:30 PKT
             public.quiet_hours_release('Asia/Karachi', '2026-11-18 00:30:00+00') as early,  -- 05:30 PKT
             public.quiet_hours_release('Asia/Karachi', '2026-11-18 10:00:00+00') as day`;
    expect(r.late.toISOString()).toBe('2026-11-19T03:00:00.000Z');
    expect(r.early.toISOString()).toBe('2026-11-18T03:00:00.000Z');
    expect(r.day.toISOString()).toBe('2026-11-18T10:00:00.000Z');
  });

  it('disables subscriptions the browser has dropped', async () => {
    pushBehaviour = () => 'gone';
    const id = await withService((tx) => notify(tx, { workspaceId: t.ws, userId: t.ali, type: 'task.assigned', title: 'x' }));
    await drain();
    expect((await deliveries(id!)).find((x) => x.channel === 'push')).toMatchObject({ status: 'skipped' });
    const [s] = await admin`select disabled_at from public.push_subscriptions where endpoint = 'https://push.example/ali-phone'`;
    expect(s.disabled_at).not.toBeNull();
    await admin`update public.push_subscriptions set disabled_at = null`;
  });

  it('retries a failing WhatsApp send 3 times, then records the failure', async () => {
    waBehaviour = () => new Error('Meta is down');
    const id = await withService((tx) => notify(tx, { workspaceId: t.ws, userId: t.ali, type: 'task.overdue', title: 'Retry me' }));
    for (let i = 0; i < 4; i++) {
      await drain();
      await admin`update public.jobs set run_at = now() where status = 'queued'`;
    }
    const wa = (await deliveries(id!)).find((x) => x.channel === 'whatsapp')!;
    expect(wa).toMatchObject({ status: 'failed', attempts: 3, error: 'Meta is down' });
  });
});

describe('scheduled alerts', () => {
  it('reminds 15 minutes before a task is due, once', async () => {
    const task = (await call(tasks.POST, { method: 'POST', as: t.ali, ws: t.ws, body: { type: 'call', title: 'Ring Rizwan', due_at: minutesFromNow(10) } })).body.data;
    await call(tasks.POST, { method: 'POST', as: t.ali, ws: t.ws, body: { type: 'call', title: 'Later', due_at: minutesFromNow(60) } });
    // Other test files share the database: only this task should be due for a reminder.
    await admin`update public.tasks set reminder_sent_at = now() where id <> ${task.id}`;
    expect(await withService(sendTaskReminders)).toEqual({ reminded: 1 });
    expect(await withService(sendTaskReminders)).toEqual({ reminded: 0 });
    const [n] = await admin`select * from public.notifications where type = 'task.reminder' and data->>'task_id' = ${task.id}`;
    expect(n.title).toMatch(/^Due at .+: Ring Rizwan$/);
  });

  it('alerts the assignee when a task goes overdue (urgent), once', async () => {
    const task = (await call(tasks.POST, { method: 'POST', as: t.ali, ws: t.ws, body: { type: 'call', title: 'Missed', due_at: minutesFromNow(-3) } })).body.data;
    await admin`update public.tasks set overdue_notified_at = now() where id <> ${task.id}`;
    expect(await withService(sendOverdueAlerts)).toEqual({ alerted: 1 });
    expect(await withService(sendOverdueAlerts)).toEqual({ alerted: 0 });
    const [n] = await admin`select priority, title from public.notifications where type = 'task.overdue' and data->>'task_id' = ${task.id}`;
    expect(n).toEqual({ priority: 'urgent', title: 'Overdue: Missed' });
  });

  it('alerts owner and managers about a lead untouched for 30 minutes, once per enquiry', async () => {
    const id = (await call(quickAdd.POST, { method: 'POST', as: t.manager, ws: t.ws, body: { phone: '03011000050', assign_to: t.bilal } })).body.data.contact_id;
    await admin`update public.contacts set untouched_alerted_at = now() where workspace_id = ${t.ws} and id <> ${id}`;
    await admin`update public.contacts set last_enquiry_at = now() - interval '31 minutes' where id = ${id}`;
    expect(await withService(sendUntouchedLeadAlerts)).toEqual({ alerted: 1 });
    expect(await withService(sendUntouchedLeadAlerts)).toEqual({ alerted: 0 });
    const ns = await admin`select user_id from public.notifications where type = 'lead.untouched' and data->>'contact_id' = ${id}`;
    expect(ns.map((n) => n.user_id).sort()).toEqual([t.bilal, t.manager].sort());

    // Alerted 40 min ago, re-enquired 35 min ago, still untouched: alert again.
    await admin`update public.contacts set untouched_alerted_at = now() - interval '40 minutes',
                  last_enquiry_at = now() - interval '35 minutes' where id = ${id}`;
    expect(await withService(sendUntouchedLeadAlerts)).toEqual({ alerted: 1 });
  });

  it('sends managers one overdue digest per day after 09:00 local', async () => {
    const d = await team('Digest Dairy');
    await admin`update public.workspaces set timezone = ${zoneWhere((h) => h >= 10 && h < 23)} where id = ${d.ws}`;
    await call(tasks.POST, { method: 'POST', as: d.ali, ws: d.ws, body: { type: 'call', title: 'a', due_at: minutesFromNow(-60) } });
    await call(tasks.POST, { method: 'POST', as: d.ali, ws: d.ws, body: { type: 'call', title: 'b', due_at: minutesFromNow(-60) } });
    await call(tasks.POST, { method: 'POST', as: d.sara, ws: d.ws, body: { type: 'call', title: 'c', due_at: minutesFromNow(-60) } });
    await withService(sendOverdueDigests);
    await withService(sendOverdueDigests);
    const ns = await admin`select title, body from public.notifications where user_id = ${d.manager} and type = 'digest.overdue'`;
    expect(ns).toEqual([{ title: '3 overdue follow-ups in your team', body: 'Ali: 2, Sara: 1' }]);
  });
});
