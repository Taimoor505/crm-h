import type { Db } from '../db';
import { ApiError } from '../http';
import type { AuthSession } from '../identity/gotrue';
import { workspaceOut, type WorkspaceRow } from './workspaces';

export interface UserRow {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  locale: string;
  partner_admin_of: string | null;
  created_at: Date | string;
}

export async function loadUser(tx: Db, userId: string) {
  const [u] = await tx<(UserRow & { is_super_admin: boolean })[]>`
    select u.id, u.name, u.phone, u.email, u.locale, u.partner_admin_of, u.created_at,
           exists (select 1 from public.platform_admins pa where pa.user_id = u.id) as is_super_admin
      from public.users u where u.id = ${userId}`;
  if (!u) throw new ApiError(401, 'unauthorized', 'Your account was not found. Please sign in again.');
  return {
    ...u,
    created_at: u.created_at instanceof Date ? u.created_at.toISOString() : u.created_at,
  };
}

export async function membershipsOf(tx: Db, userId: string) {
  const rows = await tx<{ id: string; user_id: string; workspace_id: string; role: string; status: string; created_at: Date; workspace_name: string; template_key: string }[]>`
    select m.id, m.user_id, m.workspace_id, m.role, m.status, m.created_at, w.name as workspace_name, w.template_key
      from public.memberships m join public.workspaces w on w.id = m.workspace_id
     where m.user_id = ${userId} and m.status = 'active' and w.status <> 'archived'
     order by m.created_at`;
  return rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() }));
}

/**
 * GET /me. Picks the requested workspace (member, partner admin of its
 * partner, or super admin), else the first membership, else the first
 * workspace of the partner the user administers.
 */
export async function mePayload(tx: Db, userId: string, requestedWs: string | null) {
  const user = await loadUser(tx, userId);
  const memberships = await membershipsOf(tx, userId);
  let ws: WorkspaceRow | null = null;
  if (requestedWs) {
    [ws] = await tx<WorkspaceRow[]>`
      select w.* from public.workspaces w
       where w.id = ${requestedWs}
         and (exists (select 1 from public.memberships m where m.workspace_id = w.id and m.user_id = ${userId} and m.status = 'active')
              or w.partner_id = ${user.partner_admin_of}
              or ${user.is_super_admin})`;
    if (!ws) throw new ApiError(403, 'not_a_member', 'You are not a member of this workspace');
  } else if (memberships[0]) {
    [ws] = await tx<WorkspaceRow[]>`select * from public.workspaces where id = ${memberships[0].workspace_id}`;
  } else if (user.partner_admin_of) {
    [ws] = await tx<WorkspaceRow[]>`
      select * from public.workspaces where partner_id = ${user.partner_admin_of} order by created_at limit 1`;
  }
  const m = ws ? memberships.find((x) => x.workspace_id === ws!.id) : null;
  const role = m?.role ?? (ws && user.partner_admin_of === ws.partner_id ? 'partner_admin' : ws && user.is_super_admin ? 'owner' : null);
  return {
    user,
    active_workspace: ws ? workspaceOut(ws) : null,
    effective_role: role,
    memberships,
  };
}

/** What sign-in, sign-up (auto-confirmed) and refresh return. */
export async function sessionPayload(tx: Db, s: AuthSession) {
  const user = await loadUser(tx, s.user.id);
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_at: s.expires_at,
    token_type: 'Bearer',
    user,
    memberships: await membershipsOf(tx, s.user.id),
  };
}
