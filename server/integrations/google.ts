import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { withService, type Db } from '../db';
import { decryptSecret, encryptSecret } from '../crypto';
import { ApiError } from '../http';

/**
 * Google Calendar sync. Each user connects their own Google account; their
 * open follow-ups become calendar events (30 min, 10-minute reminder) and stay
 * in step when the follow-up moves, is completed (✓) or is cancelled.
 *
 * Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a Google Cloud OAuth
 * client, "Web application", with redirect URI <origin>/api/v1/integrations/google/callback).
 */
export const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function redirectUri(origin: string): string {
  return `${origin.replace(/\/$/, '')}/api/v1/integrations/google/callback`;
}

// ------------------------------------------------------------------ OAuth state (signed, 10 minutes)

function stateKey(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? '';
}

export function signState(userId: string): string {
  const body = Buffer.from(JSON.stringify({ u: userId, n: randomBytes(8).toString('hex'), t: Date.now() })).toString('base64url');
  const sig = createHmac('sha256', stateKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(state: string): string {
  const [body, sig] = state.split('.');
  if (!body || !sig) throw new ApiError(400, 'bad_state', 'Invalid sign-in state');
  const expected = createHmac('sha256', stateKey()).update(body).digest('base64url');
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new ApiError(400, 'bad_state', 'Invalid sign-in state');
  }
  const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as { u: string; t: number };
  if (Date.now() - p.t > 10 * 60_000) throw new ApiError(400, 'state_expired', 'The Google sign-in took too long. Try again.');
  return p.u;
}

export function authUrl(origin: string, userId: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID ?? '');
  u.searchParams.set('redirect_uri', redirectUri(origin));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES.join(' '));
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('state', signState(userId));
  return u.toString();
}

// ------------------------------------------------------------------ Google HTTP (swappable in tests)

export interface GoogleApi {
  exchangeCode(code: string, redirect: string): Promise<{ refresh_token?: string; access_token: string; id_token?: string; expires_in: number }>;
  refresh(refreshToken: string): Promise<{ access_token: string; expires_in: number }>;
  revoke(token: string): Promise<void>;
  calendar(accessToken: string, method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }>;
}

const realGoogle: GoogleApi = {
  async exchangeCode(code, redirect) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, redirect_uri: redirect, grant_type: 'authorization_code',
        client_id: process.env.GOOGLE_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      }),
    });
    const j = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new ApiError(400, 'google_exchange_failed', String(j.error_description ?? j.error ?? 'Google sign-in failed'));
    return j as never;
  },
  async refresh(refreshToken) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken, grant_type: 'refresh_token',
        client_id: process.env.GOOGLE_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      }),
    });
    const j = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error(`google_refresh_failed: ${String(j.error ?? res.status)}`);
    return j as never;
  },
  async revoke(token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined);
  },
  async calendar(accessToken, method, path, body) {
    const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      method,
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  },
};

let google: GoogleApi = realGoogle;
export const googleApi = () => google;
export function setGoogleApi(g: GoogleApi) {
  google = g;
}

/** The Google account email from the ID token (already verified by Google's token endpoint). */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    return (JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()) as { email?: string }).email ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ connection

export async function saveConnection(tx: Db, userId: string, refreshToken: string, email: string | null) {
  await tx`
    insert into public.google_calendar_connections (user_id, google_email, refresh_token_ciphertext)
    values (${userId}, ${email}, ${encryptSecret(refreshToken)})
    on conflict (user_id) do update
      set google_email = excluded.google_email, refresh_token_ciphertext = excluded.refresh_token_ciphertext,
          connected_at = now(), last_error = null`;
}

const tokenCache = new Map<string, { token: string; until: number }>();

async function accessTokenFor(tx: Db, userId: string): Promise<{ token: string; calendarId: string } | null> {
  const [c] = await tx<{ refresh_token_ciphertext: string; calendar_id: string }[]>`
    select refresh_token_ciphertext, calendar_id from public.google_calendar_connections where user_id = ${userId}`;
  if (!c) return null;
  const hit = tokenCache.get(userId);
  if (hit && hit.until > Date.now()) return { token: hit.token, calendarId: c.calendar_id };
  const r = await googleApi().refresh(decryptSecret(c.refresh_token_ciphertext));
  tokenCache.set(userId, { token: r.access_token, until: Date.now() + (r.expires_in - 60) * 1000 });
  return { token: r.access_token, calendarId: c.calendar_id };
}

export async function disconnect(tx: Db, userId: string) {
  const [c] = await tx<{ refresh_token_ciphertext: string }[]>`
    select refresh_token_ciphertext from public.google_calendar_connections where user_id = ${userId}`;
  if (c) await googleApi().revoke(decryptSecret(c.refresh_token_ciphertext)).catch(() => undefined);
  await tx`delete from public.task_calendar_events where user_id = ${userId}`;
  await tx`delete from public.google_calendar_connections where user_id = ${userId}`;
  tokenCache.delete(userId);
}

// ------------------------------------------------------------------ sync

interface TaskRow {
  id: string; workspace_id: string; assigned_to: string; title: string; notes: string | null; type: string;
  due_at: Date; status: string; contact_id: string | null; contact_name: string | null; contact_phone: string | null;
}

function eventBody(t: TaskRow, appUrl: string) {
  const start = t.due_at;
  const end = new Date(start.getTime() + 30 * 60_000);
  const done = t.status === 'done';
  const lines = [
    t.contact_name ? `Lead: ${t.contact_name}` : null,
    t.contact_phone ? `Phone: ${t.contact_phone}` : null,
    t.notes ? `\n${t.notes}` : null,
    t.contact_id ? `\nOpen in CRM: ${appUrl}/contacts/${t.contact_id}` : `\nOpen in CRM: ${appUrl}/follow-ups`,
  ].filter(Boolean);
  return {
    summary: `${done ? '✓ ' : ''}${t.title}`,
    description: lines.join('\n'),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    reminders: done ? { useDefault: false, overrides: [] } : { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] },
    extendedProperties: { private: { crm_task_id: t.id } },
  };
}

/**
 * Brings Google in line with one follow-up: create, update, mark done, move to
 * the new owner's calendar, or delete. Never throws: a failure is stored on
 * the connection (last_error) so the settings page can show it.
 */
export async function syncTask(tx: Db, taskId: string, appUrl: string): Promise<'created' | 'updated' | 'deleted' | 'skipped'> {
  const [t] = await tx<TaskRow[]>`
    select t.id, t.workspace_id, t.assigned_to, t.title, t.notes, t.type, t.due_at, t.status, t.contact_id,
           c.name as contact_name, c.phone_e164 as contact_phone
      from public.tasks t left join public.contacts c on c.id = t.contact_id
     where t.id = ${taskId}`;
  const [link] = await tx<{ user_id: string; event_id: string }[]>`
    select user_id, event_id from public.task_calendar_events where task_id = ${taskId}`;

  const removeLinked = async () => {
    if (!link) return;
    try {
      const auth = await accessTokenFor(tx, link.user_id);
      if (auth) await googleApi().calendar(auth.token, 'DELETE', `/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(link.event_id)}`);
    } catch {
      // the event may already be gone
    }
    await tx`delete from public.task_calendar_events where task_id = ${taskId}`;
  };

  if (!t || t.status === 'cancelled') {
    await removeLinked();
    return link ? 'deleted' : 'skipped';
  }
  // Reassigned: the event moves to the new owner's calendar.
  if (link && link.user_id !== t.assigned_to) await removeLinked();

  let auth: { token: string; calendarId: string } | null = null;
  try {
    auth = await accessTokenFor(tx, t.assigned_to);
  } catch (err) {
    await tx`update public.google_calendar_connections set last_error = ${String((err as Error).message).slice(0, 300)} where user_id = ${t.assigned_to}`;
    return 'skipped';
  }
  if (!auth) return 'skipped';
  const cal = `/calendars/${encodeURIComponent(auth.calendarId)}/events`;
  const body = eventBody(t, appUrl);
  const current = link && link.user_id === t.assigned_to ? link : null;
  try {
    if (current) {
      const r = await googleApi().calendar(auth.token, 'PATCH', `${cal}/${encodeURIComponent(current.event_id)}`, body);
      if (r.status === 404 || r.status === 410) {
        await tx`delete from public.task_calendar_events where task_id = ${taskId}`;
        return syncTask(tx, taskId, appUrl);
      }
      if (r.status >= 400) throw new Error(`google ${r.status}`);
      await tx`update public.task_calendar_events set synced_at = now() where task_id = ${taskId}`;
      await tx`update public.google_calendar_connections set last_synced_at = now(), last_error = null where user_id = ${t.assigned_to}`;
      return 'updated';
    }
    if (t.status !== 'open') return 'skipped'; // don't add already-finished follow-ups
    const r = await googleApi().calendar(auth.token, 'POST', cal, body);
    if (r.status >= 400 || !r.json.id) throw new Error(`google ${r.status}`);
    await tx`
      insert into public.task_calendar_events (task_id, user_id, event_id) values (${taskId}, ${t.assigned_to}, ${String(r.json.id)})
      on conflict (task_id) do update set user_id = excluded.user_id, event_id = excluded.event_id, synced_at = now()`;
    await tx`update public.google_calendar_connections set last_synced_at = now(), last_error = null where user_id = ${t.assigned_to}`;
    return 'created';
  } catch (err) {
    await tx`update public.google_calendar_connections set last_error = ${String((err as Error).message).slice(0, 300)} where user_id = ${t.assigned_to}`;
    return 'skipped';
  }
}

/** Runs syncTask for each id in its own service transaction (call after the response with next/server `after`). */
export async function syncTasks(taskIds: string[], appUrl: string): Promise<void> {
  if (!googleConfigured()) return;
  for (const id of new Set(taskIds)) {
    try {
      await withService((tx) => syncTask(tx, id, appUrl));
    } catch (err) {
      console.error('[calendar] sync failed', id, err);
    }
  }
}

/** On connect: put the user's upcoming open follow-ups into the calendar (max 200). */
export async function backfill(userId: string, appUrl: string): Promise<number> {
  const ids = await withService((tx) => tx<{ id: string }[]>`
    select id from public.tasks
     where assigned_to = ${userId} and status = 'open' and due_at > now() - interval '1 day'
     order by due_at limit 200`);
  await syncTasks(ids.map((r) => r.id), appUrl);
  return ids.length;
}
