import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, call, contactFor, minutesFromNow, team } from './helpers';
import { setGoogleApi, signState, syncTasks, verifyState, type GoogleApi } from '@/server/integrations/google';
import { setCalendarScheduler } from '@/server/integrations/calendar-hook';
import * as status from '@/app/api/v1/integrations/google/route';
import * as connect from '@/app/api/v1/integrations/google/connect/route';
import * as callback from '@/app/api/v1/integrations/google/callback/route';
import * as tasks from '@/app/api/v1/tasks/route';
import * as task from '@/app/api/v1/tasks/[id]/route';
import * as complete from '@/app/api/v1/tasks/[id]/complete/route';

/** In-memory Google: one calendar per access token. */
function fakeGoogle() {
  const events = new Map<string, { owner: string; body: Record<string, unknown> }>();
  const revoked: string[] = [];
  let n = 0;
  const api: GoogleApi = {
    async exchangeCode(code) {
      return { refresh_token: `rt-${code}`, access_token: `at-${code}`, expires_in: 3600, id_token: `x.${Buffer.from(JSON.stringify({ email: `${code}@gmail.com` })).toString('base64url')}.y` };
    },
    async refresh(rt) {
      return { access_token: rt.replace('rt-', 'at-'), expires_in: 3600 };
    },
    async revoke(t) {
      revoked.push(t);
    },
    async calendar(token, method, path, body) {
      const id = decodeURIComponent(path.split('/events/')[1] ?? '');
      if (method === 'POST') {
        const eid = `ev${++n}`;
        events.set(eid, { owner: token, body: body as Record<string, unknown> });
        return { status: 200, json: { id: eid } };
      }
      const ev = events.get(id);
      if (!ev || ev.owner !== token) return { status: 404, json: {} };
      if (method === 'DELETE') events.delete(id);
      else ev.body = body as Record<string, unknown>;
      return { status: 200, json: { id } };
    },
  };
  return { api, events, revoked };
}

describe('Google Calendar sync', () => {
  const g = fakeGoogle();
  const queued: string[] = [];
  beforeAll(() => {
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'csecret';
    setGoogleApi(g.api);
    setCalendarScheduler((ids) => queued.push(...ids));
  });
  afterAll(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    setCalendarScheduler(null);
  });
  const flush = async () => {
    const ids = queued.splice(0);
    await syncTasks(ids, 'https://crm.test');
  };

  it('signs state and rejects tampering', () => {
    const s = signState('11111111-1111-1111-1111-111111111111');
    expect(verifyState(s)).toBe('11111111-1111-1111-1111-111111111111');
    expect(() => verifyState(`${s}x`)).toThrow();
  });

  it('connects, backfills, and follows a follow-up through its life', async () => {
    const t = await team('Calendar Co');
    const contactId = await contactFor(t.ws, t.ali, 'Calendar Lead');
    // A follow-up that exists before connecting is backfilled.
    const before = await call(tasks.POST, { method: 'POST', as: t.ali, ws: t.ws, body: { contact_id: contactId, type: 'call', title: 'Call back', due_at: minutesFromNow(120) } });
    expect(before.status).toBe(201);
    queued.length = 0; // not connected yet: nothing to do

    let s = await call(status.GET, { as: t.ali });
    expect(s.body.data).toMatchObject({ configured: true, connected: false });

    const c = await call(connect.POST, { method: 'POST', as: t.ali, body: {} });
    const url = new URL(c.body.data.url);
    expect(url.searchParams.get('redirect_uri')).toBe('https://crm.test/api/v1/integrations/google/callback');
    expect(url.searchParams.get('access_type')).toBe('offline');

    const cb = await call(callback.GET, { query: { code: 'ali', state: url.searchParams.get('state')! } });
    expect(cb.status).toBe(303);
    expect(cb.headers.get('location')).toBe('https://crm.test/settings/calendar?google=connected');
    // Backfill runs in the background; wait for it.
    for (let i = 0; i < 50 && g.events.size === 0; i++) await new Promise((r) => setTimeout(r, 20));
    expect(g.events.size).toBe(1);

    const [stored] = await admin`select refresh_token_ciphertext from public.google_calendar_connections where user_id = ${t.ali}`;
    expect(stored.refresh_token_ciphertext).not.toContain('rt-ali');

    // Create → event with reminder and a link back.
    const f = (await call(tasks.POST, { method: 'POST', as: t.ali, ws: t.ws, body: { contact_id: contactId, type: 'meeting', title: 'Site visit', due_at: minutesFromNow(240) } })).body.data;
    await flush();
    const [link] = await admin`select event_id from public.task_calendar_events where task_id = ${f.id}`;
    const ev = g.events.get(link.event_id)!;
    expect(ev.body.summary).toBe('Site visit');
    expect(String(ev.body.description)).toContain(`https://crm.test/contacts/${contactId}`);
    expect(ev.body.reminders).toEqual({ useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] });

    // Reschedule → event moves.
    const due = minutesFromNow(600);
    await call(task.PATCH, { method: 'PATCH', as: t.ali, ws: t.ws, params: { id: f.id }, body: { due_at: due } });
    await flush();
    expect((g.events.get(link.event_id)!.body.start as { dateTime: string }).dateTime).toBe(new Date(due).toISOString());

    // Complete → ✓, and the next follow-up is added.
    const done = await call(complete.POST, { method: 'POST', as: t.ali, ws: t.ws, params: { id: f.id }, body: { next: { type: 'call', due_at: minutesFromNow(2000) } } });
    expect(done.status).toBe(200);
    await flush();
    expect(g.events.get(link.event_id)!.body.summary).toBe('✓ Site visit');
    expect(g.events.size).toBe(3);

    // Reassign to someone without Google → removed from Ali's calendar.
    const nextId = done.body.data.next.id;
    await call(task.PATCH, { method: 'PATCH', as: t.manager, ws: t.ws, params: { id: nextId }, body: { assigned_to: t.sara } });
    await flush();
    expect(g.events.size).toBe(2);

    // Cancel → deleted.
    await call(task.PATCH, { method: 'PATCH', as: t.ali, ws: t.ws, params: { id: before.body.data.id }, body: { status: 'cancelled' } });
    await flush();
    expect(g.events.size).toBe(1);

    s = await call(status.GET, { as: t.ali });
    expect(s.body.data).toMatchObject({ connected: true, email: 'ali@gmail.com', synced_count: 1, last_error: null });

    // Disconnect revokes and forgets.
    expect((await call(status.DELETE, { method: 'DELETE', as: t.ali })).status).toBe(200);
    expect(g.revoked).toContain('rt-ali');
    expect((await call(status.GET, { as: t.ali })).body.data.connected).toBe(false);
  });

  it('rejects a callback with a forged state', async () => {
    const cb = await call(callback.GET, { query: { code: 'x', state: 'abc.def' } });
    expect(cb.headers.get('location')).toBe('https://crm.test/settings/calendar?google=error');
  });
});
