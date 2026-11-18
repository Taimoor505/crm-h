import { z } from 'zod';
import type { Tx } from '../db';
import { ApiError, authRoute } from '../http';
import type { BillingAccount } from './subscriptions';

const uuid = z.uuid();

/**
 * Who is paying:
 *  - X-Partner-Id: a partner admin, billed for all the partner's client workspaces;
 *  - X-Workspace-Id: the owner of a direct-customer workspace (house partner).
 * Owners of a partner's client workspace are billed through the partner.
 */
export async function resolveBillingAccount(tx: Tx, req: Request, userId: string): Promise<BillingAccount> {
  const partnerHeader = req.headers.get('x-partner-id');
  if (partnerHeader) {
    const pid = uuid.safeParse(partnerHeader);
    if (!pid.success) throw new ApiError(400, 'bad_partner', 'X-Partner-Id must be a uuid');
    const [m] = await tx`
      select 1 from public.partner_members
       where partner_id = ${pid.data} and user_id = ${userId} and status = 'active'`;
    if (!m) throw new ApiError(403, 'not_partner_admin', 'You are not an admin of this partner');
    return { partnerId: pid.data, workspaceId: null };
  }

  const wsHeader = req.headers.get('x-workspace-id');
  if (wsHeader) {
    const ws = uuid.safeParse(wsHeader);
    if (!ws.success) throw new ApiError(400, 'workspace_required', 'X-Workspace-Id must be a uuid');
    const [w] = await tx<{ partner_id: string; is_house: boolean; role: string }[]>`
      select w.partner_id, p.is_house, m.role
        from public.memberships m
        join public.workspaces w on w.id = m.workspace_id
        join public.partners p on p.id = w.partner_id
       where m.workspace_id = ${ws.data} and m.user_id = ${userId} and m.status = 'active'`;
    if (!w) throw new ApiError(403, 'not_a_member', 'You are not a member of this workspace');
    if (w.role !== 'owner') throw new ApiError(403, 'forbidden', 'Only the workspace owner manages billing');
    if (!w.is_house) {
      throw new ApiError(403, 'billed_by_partner', 'This workspace is billed through your partner; contact them about billing');
    }
    return { partnerId: w.partner_id, workspaceId: ws.data };
  }
  throw new ApiError(400, 'billing_account_required', 'Send X-Partner-Id (partner admins) or X-Workspace-Id (direct customers)');
}

type Handler<P> = (c: { req: Request; params: P; userId: string; tx: Tx; account: BillingAccount }) => Promise<Response>;

export function billingRoute<P = Record<string, string>>(handler: Handler<P>) {
  return authRoute<P>(async (c) => handler({ ...c, account: await resolveBillingAccount(c.tx, c.req, c.userId) }));
}

/** Super-admin (platform staff) endpoints. */
export function adminRoute<P = Record<string, string>>(
  handler: (c: { req: Request; params: P; userId: string; tx: Tx }) => Promise<Response>,
) {
  return authRoute<P>(async (c) => {
    const [a] = await c.tx`select 1 from public.platform_admins where user_id = ${c.userId}`;
    if (!a) throw new ApiError(403, 'not_platform_admin', 'Super-admins only');
    return handler(c);
  });
}
