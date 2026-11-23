import { z } from 'zod';
import type { Db } from '../db';
import { ApiError } from '../http';

/**
 * "Sign in as": a workspace owner works as one of their managers or agents
 * (supabase/migrations/20261123000000_sign_in_as.sql). The owner keeps their own
 * token; requests carry SIGN_IN_AS_HEADER and server/http.ts swaps the user.
 */
export const SIGN_IN_AS_HEADER = 'x-sign-in-as';
export const SIGN_IN_AS_HOURS = 2;

export interface ActiveSignInAs {
  id: string;
  ownerId: string;
  targetUserId: string;
  workspaceId: string;
  expiresAt: string;
}

const uuid = z.uuid();

/** The session id from the request, or null when the header isn't sent. */
export function signInAsHeader(req: Request): string | null {
  const raw = req.headers.get(SIGN_IN_AS_HEADER);
  if (!raw) return null;
  const id = uuid.safeParse(raw.trim());
  if (!id.success) throw new ApiError(400, 'bad_request', `${SIGN_IN_AS_HEADER} must be a uuid`);
  return id.data;
}

export function signInAsEnded(): ApiError {
  return new ApiError(403, 'sign_in_as_ended', 'Your "Sign in as" session has ended. You’re back in your own account.');
}

/**
 * Checks a session for this request (service-role transaction). Valid only
 * while it is open and unexpired, belongs to the signed-in owner, is for this
 * workspace, the owner is still an active owner there, and the teammate is
 * still an active non-owner member. Returns null otherwise (an expired one is
 * marked ended); the caller throws signInAsEnded() once the transaction has
 * committed, so that mark isn't rolled back.
 */
export async function resolveSignInAs(tx: Db, sessionId: string, ownerId: string, workspaceId: string): Promise<ActiveSignInAs | null> {
  const [s] = await tx<{ id: string; target_user_id: string; expires_at: Date; ended_at: Date | null; still_allowed: boolean }[]>`
    select s.id, s.target_user_id, s.expires_at, s.ended_at,
           exists (select 1 from public.memberships o
                    where o.workspace_id = s.workspace_id and o.user_id = s.owner_id
                      and o.status = 'active' and o.role = 'owner')
       and exists (select 1 from public.memberships t
                    where t.workspace_id = s.workspace_id and t.user_id = s.target_user_id
                      and t.status = 'active' and t.role <> 'owner') as still_allowed
      from public.sign_in_as_sessions s
     where s.id = ${sessionId} and s.owner_id = ${ownerId} and s.workspace_id = ${workspaceId}`;
  if (!s || s.ended_at) return null;
  if (s.expires_at.getTime() <= Date.now()) {
    await tx`update public.sign_in_as_sessions set ended_at = now(), end_reason = 'expired' where id = ${s.id} and ended_at is null`;
    return null;
  }
  if (!s.still_allowed) return null;
  return { id: s.id, ownerId, targetUserId: s.target_user_id, workspaceId, expiresAt: s.expires_at.toISOString() };
}

/** Tags activities written in this transaction with the owner (migration trigger). */
export async function markSignedInAs(tx: Db, ownerId: string): Promise<void> {
  await tx`select set_config('app.signed_in_as_by', ${ownerId}, true)`;
}

async function audit(tx: Db, workspaceId: string, ownerId: string, action: string, targetUserId: string, meta: Record<string, unknown>) {
  await tx`
    insert into public.audit_logs (workspace_id, actor_id, action, entity_type, entity_id, meta)
    values (${workspaceId}, ${ownerId}, ${action}, 'user', ${targetUserId}, ${tx.json(meta as never)})`;
}

/**
 * Starts a session (service-role transaction). The caller must be an active
 * owner of the workspace; the target an active manager or agent, not the
 * caller. Any session the owner already has open there is ended first.
 */
export async function startSignInAs(
  tx: Db,
  p: { workspaceId: string; ownerId: string; targetUserId: string; ip: string | null; userAgent: string | null },
) {
  if (p.targetUserId === p.ownerId) throw new ApiError(422, 'validation_failed', 'You are already signed in as yourself');
  const [owner] = await tx<{ role: string }[]>`
    select role from public.memberships
     where workspace_id = ${p.workspaceId} and user_id = ${p.ownerId} and status = 'active'`;
  if (owner?.role !== 'owner') throw new ApiError(403, 'forbidden', 'Only workspace owners can sign in as a teammate');
  const [target] = await tx<{ user_id: string; role: 'manager' | 'agent' | 'owner'; name: string; email: string | null }[]>`
    select m.user_id, m.role, u.name, u.email
      from public.memberships m join public.users u on u.id = m.user_id
     where m.workspace_id = ${p.workspaceId} and m.user_id = ${p.targetUserId} and m.status = 'active'`;
  if (!target) throw new ApiError(404, 'not_found', 'This person is not an active member of the workspace');
  if (target.role === 'owner') throw new ApiError(403, 'forbidden', 'You can’t sign in as another owner');

  const replaced = await tx<{ id: string; target_user_id: string }[]>`
    update public.sign_in_as_sessions set ended_at = now(), end_reason = 'replaced'
     where owner_id = ${p.ownerId} and workspace_id = ${p.workspaceId} and ended_at is null
     returning id, target_user_id`;
  for (const r of replaced) await audit(tx, p.workspaceId, p.ownerId, 'sign_in_as.end', r.target_user_id, { session_id: r.id, reason: 'replaced' });

  const [s] = await tx<{ id: string; expires_at: Date }[]>`
    insert into public.sign_in_as_sessions (workspace_id, owner_id, target_user_id, expires_at, ip, user_agent)
    values (${p.workspaceId}, ${p.ownerId}, ${p.targetUserId}, now() + make_interval(hours => ${SIGN_IN_AS_HOURS}),
            ${p.ip}, ${p.userAgent})
    returning id, expires_at`;
  await audit(tx, p.workspaceId, p.ownerId, 'sign_in_as.start', p.targetUserId, { session_id: s.id, role: target.role });
  return {
    id: s.id,
    expires_at: s.expires_at.toISOString(),
    user: { id: target.user_id, name: target.name, email: target.email, role: target.role },
  };
}

/** Ends the owner's open session in the workspace, if any ("Return to my account"). */
export async function endSignInAs(tx: Db, workspaceId: string, ownerId: string): Promise<boolean> {
  const rows = await tx<{ id: string; target_user_id: string }[]>`
    update public.sign_in_as_sessions set ended_at = now(), end_reason = 'returned'
     where owner_id = ${ownerId} and workspace_id = ${workspaceId} and ended_at is null
     returning id, target_user_id`;
  for (const r of rows) await audit(tx, workspaceId, ownerId, 'sign_in_as.end', r.target_user_id, { session_id: r.id, reason: 'returned' });
  return rows.length > 0;
}
