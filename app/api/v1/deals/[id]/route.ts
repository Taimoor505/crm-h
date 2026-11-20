import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { cleanCustom, dealOut } from '@/server/core/crm';
import { reloadDeal, visibleDeal } from '@/server/core/deals';

type P = { id: string };

// GET /deals/:id
export const GET = userRoute<P>({ allowWhenReadOnly: true }, async ({ params, tx, workspace, userId, isManager }) => {
  return json({ deal: dealOut(await visibleDeal(tx, workspace.id, params.id, userId, isManager)) });
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  value_minor: z.number().int().min(0).max(1e15).nullable().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  expected_close: z.iso.date().nullable().optional(),
  owner_id: z.uuid().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

// PATCH /deals/:id (stage changes go through POST /deals/:id/move)
export const PATCH = userRoute<P>({}, async ({ req, params, tx, workspace, userId, isManager }) => {
  const d = await visibleDeal(tx, workspace.id, params.id, userId, isManager);
  const b = await readJson(req, patchSchema);
  if (b.owner_id && !isManager) throw new ApiError(403, 'forbidden', 'Only owners and managers can reassign deals');
  if (b.owner_id) {
    const [m] = await tx`select 1 from public.memberships where workspace_id = ${workspace.id} and user_id = ${b.owner_id} and status = 'active'`;
    if (!m) throw new ApiError(422, 'not_a_member', 'That person is not an active member of this workspace');
  }
  const custom = b.custom ? { ...d.custom, ...(await cleanCustom(tx, workspace.id, 'deal', b.custom)) } : d.custom;
  await elevate(tx);
  await tx`
    update public.deals set
      title = ${b.title ?? d.title},
      value_minor = ${b.value_minor === undefined ? d.value_minor : b.value_minor ?? 0},
      currency = ${b.currency ?? d.currency},
      expected_close = ${b.expected_close === undefined ? d.expected_close : b.expected_close},
      owner_id = ${b.owner_id ?? d.owner_id},
      custom = ${tx.json(custom as never)}, updated_at = now()
    where id = ${d.id}`;
  return json({ deal: dealOut(await reloadDeal(tx, d.id)) });
});

// DELETE /deals/:id: soft delete.
export const DELETE = userRoute<P>({}, async ({ params, tx, workspace, userId, isManager }) => {
  const d = await visibleDeal(tx, workspace.id, params.id, userId, isManager);
  await elevate(tx);
  await tx`update public.deals set deleted_at = now(), updated_at = now() where id = ${d.id}`;
  return json({ deleted: true });
});
