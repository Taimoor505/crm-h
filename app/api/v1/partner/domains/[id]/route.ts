import { ApiError, authRoute, json } from '@/server/http';
import { partnerOf } from '@/server/core/partner';

// DELETE /partner/domains/:id
export const DELETE = authRoute<{ id: string }>(async ({ req, params, tx, userId }) => {
  const partnerId = await partnerOf(tx, userId, req);
  const r = await tx`delete from public.partner_domains where id = ${params.id} and partner_id = ${partnerId}`;
  if (r.count === 0) throw new ApiError(404, 'not_found', 'Domain not found');
  return json({ data: { removed: true } });
});
