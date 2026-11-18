import { z } from 'zod';
import { ApiError, json, readJson } from '@/server/http';
import { adminRoute } from '@/server/billing/context';
import { setSuspended } from '@/server/billing/access';

const schema = z.object({ suspended: z.boolean(), reason: z.string().trim().max(500).optional() });

/**
 * POST /admin/partners/:id/suspend (super-admins): { suspended: true } blocks
 * every workspace of the partner (reads too); false lifts it, after which
 * anything still unpaid is read-only/archived again as usual.
 */
export const POST = adminRoute<{ id: string }>(async ({ req, tx, params, userId }) => {
  const body = await readJson(req, schema);
  const [p] = await tx<{ is_house: boolean }[]>`select is_house from public.partners where id = ${params.id}`;
  if (!p) throw new ApiError(404, 'not_found', 'Partner not found');
  if (p.is_house && body.suspended) {
    throw new ApiError(422, 'house_partner', 'Suspend direct customers one by one with POST /admin/workspaces/:id/suspend');
  }
  const result = await setSuspended(tx, params.id, body.suspended);
  await tx`update public.partners set status = ${body.suspended ? 'suspended' : 'active'} where id = ${params.id}`;
  console.info(`[admin] ${userId} set partner ${params.id} suspended=${body.suspended}: ${body.reason ?? ''}`);
  return json({ data: { partner_id: params.id, suspended: body.suspended, ...result } });
});
