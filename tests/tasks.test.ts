import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as tasks from '@/app/api/v1/tasks/route';
import * as taskById from '@/app/api/v1/tasks/[id]/route';
import * as complete from '@/app/api/v1/tasks/[id]/complete/route';
import * as quickAdd from '@/app/api/v1/leads/quick-add/route';
import { closeDb, withUser } from '@/server/db';
import { logActivity } from '@/server/core/contacts';
import { createFollowUpFromCall } from '@/server/tasks/service';
import { admin, call, contactFor, minutesFromNow, stage, team } from './helpers';

let t: Awaited<ReturnType<typeof team>>;
let aliLead: string;
let saraLead: string;

beforeAll(async () => {
  t = await team('Tasks Traders');
  aliLead = (await call(quickAdd.POST, { method: 'POST', as: t.ali, ws: t.ws, body: { name: 'Imran', phone: '03007000001' } }))
    .body.data.contact_id;
  saraLead = (await call(quickAdd.POST, { method: 'POST', as: t.sara, ws: t.ws, body: { name: 'Nadia', phone: '03007000002' } }))
    .body.data.contact_id;
});

afterAll(async () => {
  await closeDb();
});

const create = (as: string, body: Record<string, unknown>) =>
  call(tasks.POST, { method: 'POST', as, ws: t.ws, body });

describe('POST /tasks', () => {
  it('creates a task with a sensible default title and logs it on the timeline', async () => {
    const res = await create(t.ali, { contact_id: aliLead, type: 'call', due_at: minutesFromNow(60) });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ title: 'Call Imran', assigned_to: t.ali, status: 'open', origin: 'manual' });
    const [act] = await admin`select * from public.activities where contact_id = ${aliLead} and type = 'task'`;
    expect(act.meta).toMatchObject({ action: 'created', task_id: res.body.data.id });
  });

  it("stops agents creating tasks on contacts they can't see, or for colleagues", async () => {
    expect((await create(t.ali, { contact_id: saraLead, type: 'call', due_at: minutesFromNow(60) })).status).toBe(404);
    expect((await create(t.ali, { type: 'other', due_at: minutesFromNow(60), assigned_to: t.sara })).status).toBe(403);
  });

  it('lets managers assign to agents, who get notified', async () => {
    const res = await create(t.manager, { contact_id: saraLead, type: 'site_visit', due_at: minutesFromNow(24 * 60 * 3), assigned_to: t.sara });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Site visit with Nadia');
    const [n] = await admin`select * from public.notifications where user_id = ${t.sara} and type = 'task.assigned'`;
    expect(n.data.task_id).toBe(res.body.data.id);
  });

  it("won't attach a task to another workspace's deal", async () => {
    const other = await team('Deal Elsewhere');
    const [pl] = await admin`insert into public.pipelines (workspace_id, name) values (${other.ws}, 'P') returning id`;
    const stg = await stage(other.ws, pl.id, 'S');
    const [d] = await admin`insert into public.deals (workspace_id, pipeline_id, stage_id, contact_id, owner_id, title)
                            values (${other.ws}, ${pl.id}, ${stg}, ${await contactFor(other.ws)}, ${other.ali}, 'x') returning id`;
    const res = await create(t.manager, { deal_id: d.id, type: 'call', due_at: minutesFromNow(60) });
    expect(res.body.error.code).toBe('deal_not_found');
  });

  it('validates input', async () => {
    const res = await create(t.ali, { type: 'fax', due_at: 'tomorrow' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(['due_at', 'type']);
  });
});

describe('GET /tasks', () => {
  beforeAll(async () => {
    // Ali: one overdue, one later today (if there's time left today), one next week.
    await create(t.ali, { contact_id: aliLead, type: 'whatsapp', title: 'Overdue WA', due_at: minutesFromNow(-90) });
    await create(t.ali, { contact_id: aliLead, type: 'meeting', title: 'Next week', due_at: minutesFromNow(7 * 24 * 60) });
  });

  it('buckets open tasks into overdue / today / upcoming without overlap', async () => {
    const get = async (due: string) =>
      (await call(tasks.GET, { as: t.ali, ws: t.ws, query: { due } })).body.data.map((x: { title: string }) => x.title);
    const overdue = await get('overdue');
    const today = await get('today');
    const upcoming = await get('upcoming');
    expect(overdue).toEqual(['Overdue WA']);
    expect(upcoming).toContain('Next week');
    // "Call Imran" is due in an hour: today, unless that crosses midnight in Karachi.
    expect([...today, ...upcoming]).toContain('Call Imran');
    expect(new Set([...overdue, ...today, ...upcoming]).size).toBe(overdue.length + today.length + upcoming.length);
  });

  it('shows agents only their own tasks, whatever they ask for', async () => {
    const res = await call(tasks.GET, { as: t.ali, ws: t.ws, query: { assigned_to: 'all' } });
    expect(res.body.data.every((x: { assigned_to: string }) => x.assigned_to === t.ali)).toBe(true);
    // RLS backs this up even with a hand-written query.
    const rows = await withUser(t.ali, (tx) => tx`select id from public.tasks where assigned_to = ${t.sara}`);
    expect(rows).toHaveLength(0);
  });

  it('gives managers the whole team, with the contact embedded', async () => {
    const res = await call(tasks.GET, { as: t.manager, ws: t.ws, query: { assigned_to: 'all' } });
    const owners = new Set(res.body.data.map((x: { assigned_to: string }) => x.assigned_to));
    expect(owners).toEqual(new Set([t.ali, t.sara]));
    const visit = res.body.data.find((x: { type: string }) => x.type === 'site_visit');
    expect(visit.contact).toEqual({ id: saraLead, name: 'Nadia', phone_e164: '+923007000002' });
  });

  it('paginates with a cursor in due order', async () => {
    const page1 = await call(tasks.GET, { as: t.manager, ws: t.ws, query: { assigned_to: 'all', limit: '2' } });
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.next_cursor).toBeTruthy();
    const page2 = await call(tasks.GET, {
      as: t.manager, ws: t.ws, query: { assigned_to: 'all', limit: '2', cursor: page1.body.next_cursor },
    });
    const all = [...page1.body.data, ...page2.body.data];
    expect(new Set(all.map((x: { id: string }) => x.id)).size).toBe(all.length);
    const dues = all.map((x: { due_at: string }) => new Date(x.due_at).getTime());
    expect(dues).toEqual([...dues].sort((a, b) => a - b));
  });

  it('keeps other workspaces out', async () => {
    const other = await team('Elsewhere');
    expect((await call(tasks.GET, { as: other.manager, ws: t.ws })).status).toBe(403);
    const rows = await withUser(other.manager, (tx) => tx`select id from public.tasks where workspace_id = ${t.ws}`);
    expect(rows).toHaveLength(0);
  });
});

describe('completing tasks and follow-ups', () => {
  it('records the outcome, counts as first response and creates the next follow-up', async () => {
    const before = (await admin`select first_response_at from public.contacts where id = ${aliLead}`)[0];
    expect(before.first_response_at).toBeNull();

    const task = (await create(t.ali, { contact_id: aliLead, type: 'call', title: 'Intro call', due_at: minutesFromNow(5) })).body.data;
    const res = await call(complete.POST, {
      method: 'POST', as: t.ali, ws: t.ws, params: { id: task.id },
      body: { outcome: 'interested', note: 'Wants a site visit Saturday', next: { type: 'site_visit', due_at: minutesFromNow(3 * 24 * 60) } },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.task).toMatchObject({ status: 'done', outcome: 'interested', completed_by: t.ali });
    expect(res.body.data.next).toMatchObject({
      type: 'site_visit', assigned_to: t.ali, origin: 'task_completion', parent_task_id: task.id, title: 'Site visit with Imran',
    });

    const after = (await admin`select first_response_at, last_response_at from public.contacts where id = ${aliLead}`)[0];
    expect(after.first_response_at).not.toBeNull();

    const [act] = await admin`
      select body from public.activities where contact_id = ${aliLead} and meta->>'action' = 'completed'`;
    expect(act.body).toBe('Done: Intro call\nOutcome: interested\nWants a site visit Saturday');

    // Completing twice is refused (no duplicate follow-ups).
    const again = await call(complete.POST, { method: 'POST', as: t.ali, ws: t.ws, params: { id: task.id }, body: {} });
    expect(again.status).toBe(409);
  });

  it("doesn't let an agent complete a colleague's task", async () => {
    const [visit] = await admin`select id from public.tasks where assigned_to = ${t.sara} limit 1`;
    const res = await call(complete.POST, { method: 'POST', as: t.ali, ws: t.ws, params: { id: visit.id }, body: {} });
    expect(res.status).toBe(404); // invisible to Ali under RLS
  });

  it('first_response_at is set by any logged call/WhatsApp/note, but not by context notes', async () => {
    await withUser(t.sara, (tx) =>
      logActivity(tx, { workspaceId: t.ws, contactId: saraLead, type: 'note', actorId: t.sara, body: 'context', meta: { counts_as_response: false } }));
    expect((await admin`select first_response_at from public.contacts where id = ${saraLead}`)[0].first_response_at).toBeNull();
    await withUser(t.sara, (tx) =>
      logActivity(tx, { workspaceId: t.ws, contactId: saraLead, type: 'whatsapp', actorId: t.sara, body: 'Salam!' }));
    expect((await admin`select first_response_at from public.contacts where id = ${saraLead}`)[0].first_response_at).not.toBeNull();
  });

  it('createFollowUpFromCall gives Taimoor\'s call endpoint a one-line follow-up', async () => {
    const task = await withUser(t.ali, (tx) =>
      createFollowUpFromCall(tx, { workspaceId: t.ws, contactId: aliLead, actorId: t.ali, followUp: { type: 'call', due_at: minutesFromNow(24 * 60) } }));
    expect(task).toMatchObject({ origin: 'call_outcome', assigned_to: t.ali, title: 'Call Imran' });
  });
});

describe('PATCH /tasks/:id', () => {
  it('reschedules and clears the reminder flag', async () => {
    const task = (await create(t.ali, { type: 'other', title: 'Send brochure', due_at: minutesFromNow(30) })).body.data;
    await admin`update public.tasks set reminder_sent_at = now() where id = ${task.id}`;
    const res = await call(taskById.PATCH, {
      method: 'PATCH', as: t.ali, ws: t.ws, params: { id: task.id }, body: { due_at: minutesFromNow(120) },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.reminder_sent_at).toBeNull();
  });

  it('lets managers reassign, but not agents', async () => {
    const task = (await create(t.ali, { contact_id: aliLead, type: 'call', title: 'Price follow-up', due_at: minutesFromNow(30) })).body.data;
    expect((await call(taskById.PATCH, {
      method: 'PATCH', as: t.ali, ws: t.ws, params: { id: task.id }, body: { assigned_to: t.sara },
    })).status).toBe(403);
    const res = await call(taskById.PATCH, {
      method: 'PATCH', as: t.manager, ws: t.ws, params: { id: task.id }, body: { assigned_to: t.bilal },
    });
    expect(res.body.data.assigned_to).toBe(t.bilal);
    const [n] = await admin`select title from public.notifications where user_id = ${t.bilal} and data->>'task_id' = ${task.id}`;
    expect(n.title).toBe('New task: Price follow-up');
  });

  it('cancels with a timeline entry, and refuses to reopen a done task', async () => {
    const task = (await create(t.ali, { contact_id: aliLead, type: 'call', title: 'Cancel me', due_at: minutesFromNow(30) })).body.data;
    const res = await call(taskById.PATCH, { method: 'PATCH', as: t.ali, ws: t.ws, params: { id: task.id }, body: { status: 'cancelled' } });
    expect(res.body.data.status).toBe('cancelled');
    const [act] = await admin`select body from public.activities where meta->>'task_id' = ${task.id} and meta->>'action' = 'cancelled'`;
    expect(act.body).toBe('Cancelled: Cancel me');

    const [done] = await admin`select id from public.tasks where status = 'done' and assigned_to = ${t.ali} limit 1`;
    const reopen = await call(taskById.PATCH, { method: 'PATCH', as: t.ali, ws: t.ws, params: { id: done.id }, body: { status: 'open' } });
    expect(reopen.status).toBe(409);
  });
});

describe('read-only workspaces (unpaid)', () => {
  it('blocks writes but still allows reads', async () => {
    await admin`update public.workspaces set status = 'read_only' where id = ${t.ws}`;
    try {
      const write = await create(t.ali, { type: 'other', due_at: minutesFromNow(30) });
      expect(write.status).toBe(403);
      expect(write.body.error.code).toBe('workspace_read_only');
      expect((await call(tasks.GET, { as: t.ali, ws: t.ws })).status).toBe(200);
    } finally {
      await admin`update public.workspaces set status = 'active' where id = ${t.ws}`;
    }
  });
});
