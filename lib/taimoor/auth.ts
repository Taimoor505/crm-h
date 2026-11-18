import { NextRequest } from 'next/server';
import { getState, USER_IDS, WORKSPACE_IDS } from './store';
import { DatabaseState, Membership, Role, User, Workspace } from './types';

export interface RequestActorContext {
  user: User;
  workspace: Workspace;
  membership: Membership | null;
  effectiveRole: Role | 'partner_admin';
  isPartnerAdminForWorkspace: boolean;
}

export interface AuthError {
  status: number;
  error: string;
}

export function resolveActorContext(
  req: NextRequest,
  explicitWorkspaceId?: string | null
): { ok: true; ctx: RequestActorContext; state: DatabaseState } | { ok: false; err: AuthError } {
  const state = getState();

  const headerUserId = req.headers.get('x-sandbox-user-id');
  const authHeader = req.headers.get('authorization');

  let userId = headerUserId || '';
  if (!userId && authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    // Format from /auth/otp/verify: taimoor_tok_<userId>
    if (token.startsWith('taimoor_tok_')) {
      userId = token.slice('taimoor_tok_'.length);
    }
  }

  // Default to primary seeded Owner in developer workbench if no header provided
  if (!userId) {
    userId = USER_IDS.OWNER;
  }

  const user = state.users.find((u) => u.id === userId);
  if (!user) {
    return {
      ok: false,
      err: { status: 401, error: 'Unauthorized: Unknown user actor' },
    };
  }

  const workspaceId =
    explicitWorkspaceId ||
    req.headers.get('x-workspace-id') ||
    req.nextUrl.searchParams.get('workspace_id') ||
    WORKSPACE_IDS.REAL_ESTATE;

  const workspace = state.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) {
    return {
      ok: false,
      err: { status: 404, error: `Workspace "${workspaceId}" not found` },
    };
  }

  const membership =
    state.memberships.find(
      (m) =>
        m.user_id === user.id &&
        m.workspace_id === workspace.id &&
        m.status === 'active'
    ) || null;

  const isPartnerAdminForWorkspace =
    Boolean(user.partner_admin_of) && user.partner_admin_of === workspace.partner_id;

  if (!membership && !isPartnerAdminForWorkspace) {
    return {
      ok: false,
      err: {
        status: 403,
        error: `RLS Forbidden: User "${user.name}" is neither a member of "${workspace.name}" nor its partner admin.`,
      },
    };
  }

  const effectiveRole: Role | 'partner_admin' = isPartnerAdminForWorkspace
    ? 'partner_admin'
    : membership!.role;

  return {
    ok: true,
    state,
    ctx: {
      user,
      workspace,
      membership,
      effectiveRole,
      isPartnerAdminForWorkspace,
    },
  };
}

export function canSeeRecord(
  ctx: RequestActorContext,
  recordOwnerId: string
): boolean {
  if (
    ctx.effectiveRole === 'owner' ||
    ctx.effectiveRole === 'manager' ||
    ctx.effectiveRole === 'partner_admin'
  ) {
    return true;
  }
  return recordOwnerId === ctx.user.id;
}

export function requireManagerOrOwner(ctx: RequestActorContext): AuthError | null {
  if (
    ctx.effectiveRole === 'owner' ||
    ctx.effectiveRole === 'manager' ||
    ctx.effectiveRole === 'partner_admin'
  ) {
    return null;
  }
  return {
    status: 403,
    error: 'Forbidden: Requires Manager, Owner, or Partner Admin role',
  };
}
