import { HttpResponse, delay } from 'msw';
import { getDb, type MMembership, type MUser, type MWorkspace } from '../db';

export const BASE = '/api/v1';

export type Ctx = {
  user: MUser;
  ws: MWorkspace;
  membership: MMembership | null;
  role: 'owner' | 'manager' | 'agent' | 'partner_admin';
  isManager: boolean;
};

/** Postgres-style error (`{ error: { code, message } }`). */
export function fail(status: number, code: string, message: string, details?: unknown) {
  return HttpResponse.json({ error: { code, message, details } }, { status });
}

export async function latency() {
  await delay(120 + Math.random() * 180);
}

/** The person who holds the token, ignoring "Sign in as". */
export function tokenUser(req: Request): MUser | null {
  const h = req.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(h)?.[1] ?? '';
  const id = token.startsWith('mock.') ? token.slice(5) : null;
  if (!id) return null;
  return getDb().users.find((u) => u.id === id) ?? null;
}

/** Mirrors server/core/sign-in-as.ts, in memory (a page reload ends them). */
export const mockSignInAs = new Map<string, { ownerId: string; userId: string; workspaceId: string; expiresAt: string }>();

/** The open "Sign in as" session this request carries, if it is valid for the token holder. */
export function signInAsOf(req: Request) {
  const id = req.headers.get('x-sign-in-as');
  const owner = tokenUser(req);
  const s = id ? mockSignInAs.get(id) : undefined;
  if (!s || !owner || s.ownerId !== owner.id || s.workspaceId !== req.headers.get('x-workspace-id') || Date.parse(s.expiresAt) <= Date.now()) return null;
  return { id: id!, ...s };
}

/** Who the request acts as: the teammate during "Sign in as", else the token holder. */
export function userFromRequest(req: Request): MUser | null {
  const s = signInAsOf(req);
  if (s) return getDb().users.find((u) => u.id === s.userId) ?? null;
  return tokenUser(req);
}

/**
 * Mirrors server/http.ts userRoute: token, X-Workspace-Id, membership (partner
 * admins pass as managers), read-only and suspended enforcement.
 */
export function authorize(
  req: Request,
  opts: { managerOnly?: boolean; allowWhenReadOnly?: boolean; workspaceId?: string } = {},
): Ctx | Response {
  const db = getDb();
  const user = userFromRequest(req);
  if (!user) return fail(401, 'unauthorized', 'Missing Authorization: Bearer token');
  const wsId = opts.workspaceId ?? req.headers.get('x-workspace-id') ?? new URL(req.url).searchParams.get('workspace_id');
  if (!wsId) return fail(400, 'workspace_required', 'X-Workspace-Id header (uuid) is required');
  const ws = db.workspaces.find((w) => w.id === wsId);
  if (!ws) return fail(404, 'not_found', 'Workspace not found');
  const membership = db.memberships.find((m) => m.workspace_id === ws.id && m.user_id === user.id && m.status === 'active') ?? null;
  const partnerAdmin = user.partner_admin_of === ws.partner_id;
  if (!membership && !partnerAdmin && !user.is_super_admin) return fail(403, 'not_a_member', 'You are not a member of this workspace');
  const role = membership?.role ?? 'partner_admin';
  const isManager = role !== 'agent';
  if (opts.managerOnly && !isManager) return fail(403, 'forbidden', 'Only workspace owners and managers can do this');
  if (ws.status === 'suspended') return fail(403, 'workspace_suspended', 'This workspace is suspended; contact support');
  if (req.method !== 'GET' && ws.status !== 'active' && ws.status !== 'trialing' && !opts.allowWhenReadOnly) {
    return fail(403, 'workspace_read_only', `Workspace is ${ws.status}; changes are disabled`);
  }
  return { user, ws, membership, role, isManager };
}

export const isResponse = (x: unknown): x is Response => x instanceof Response;

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    const out: Record<string, unknown> = {};
    fd.forEach((v, k) => (out[k] = typeof v === 'string' ? v : v));
    return out as T;
  }
  const text = await req.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export function query(req: Request) {
  return new URL(req.url).searchParams;
}

export function nowIso() {
  return new Date().toISOString();
}

/** Simple id cursor pagination like the sandbox routes. */
export function paginate<T extends { id: string }>(rows: T[], cursor: string | null, limit: number) {
  let start = 0;
  if (cursor) {
    const idx = rows.findIndex((r) => r.id === cursor);
    if (idx >= 0) start = idx + 1;
  }
  const page = rows.slice(start, start + limit);
  const next = start + limit < rows.length && page.length ? page[page.length - 1].id : null;
  return { page, next };
}

/** Workspace-local day bounds as UTC instants. */
export function dayBounds(tz: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    .formatToParts(date)
    .reduce<Record<string, number>>((a, p) => (p.type !== 'literal' ? { ...a, [p.type]: +p.value } : a), {});
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const offset = asUtc - Math.floor(date.getTime() / 60000) * 60000;
  const start = Date.UTC(parts.year, parts.month - 1, parts.day) - offset;
  return { start, end: start + 86400_000 };
}

export function localDay(isoStr: string, tz: string) {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(isoStr));
  return d; // yyyy-mm-dd
}
