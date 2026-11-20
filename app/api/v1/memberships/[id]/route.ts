import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';

const schema = z.object({
  role: z.enum(['owner', 'manager', 'agent']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

// PATCH /memberships/:id (owner/manager): change role or suspend/reactivate.
export const PATCH = userRoute<{ id: string }>({ managerOnly: true }, async ({ req, params, tx, workspace, userId }) => {
  const b = await readJson(req, schema);
  await elevate(tx);
  const [m] = await tx<{ id: string; user_id: string; role: string; status: string }[]>`
    select id, user_id, role, status from public.memberships where id = ${params.id} and workspace_id = ${workspace.id} for update`;
  if (!m) throw new ApiError(404, 'not_found', 'Membership not found');
  if (m.user_id === userId) throw new ApiError(409, 'cannot_change_self', 'You cannot change your own role or access');
  if ((m.role === 'owner' || b.role === 'owner') && workspace.role !== 'owner') {
    throw new ApiError(403, 'forbidden', 'Only owners can change an owner');
  }
  const [updated] = await tx`
    update public.memberships set role = ${b.role ?? m.role}, status = ${b.status ?? m.status}
     where id = ${m.id} returning *`;
  if (m.role === 'owner' && (b.role && b.role !== 'owner' || b.status === 'suspended')) {
    const [{ n }] = await tx<{ n: number }[]>`
      select count(*)::int as n from public.memberships where workspace_id = ${workspace.id} and role = 'owner' and status = 'active'`;
    if (n === 0) throw new ApiError(409, 'last_owner', 'A workspace needs at least one owner');
  }
  return json({ membership: updated });
});
