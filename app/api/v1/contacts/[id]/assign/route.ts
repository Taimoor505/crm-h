import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { assignContact } from '@/server/assignment/engine';
import type { Contact } from '@/server/core/contacts';

// POST /contacts/:id/assign (owner/manager): { user_id } or null to unassign.
export const POST = userRoute<{ id: string }>({ managerOnly: true }, async ({ req, params, tx, workspace, userId }) => {
  const b = await readJson(req, z.object({ user_id: z.uuid().nullable() }));
  await elevate(tx);
  const [c] = await tx<Contact[]>`
    select * from public.contacts where id = ${params.id} and workspace_id = ${workspace.id} and deleted_at is null for update`;
  if (!c) throw new ApiError(404, 'not_found', 'Contact not found');
  if (b.user_id) {
    const [m] = await tx`select 1 from public.memberships where workspace_id = ${workspace.id} and user_id = ${b.user_id} and status = 'active'`;
    if (!m) throw new ApiError(422, 'not_a_member', 'That person is not an active member of this workspace');
  }
  const changed = c.owner_id !== b.user_id;
  if (changed) {
    await assignContact(tx, { contact: c, toUserId: b.user_id, actorId: userId, reason: b.user_id === userId ? 'self' : 'manual' });
    // Open follow-ups move with the lead.
    if (b.user_id) {
      await tx`update public.tasks set assigned_to = ${b.user_id}, updated_at = now()
                where contact_id = ${c.id} and status = 'open' and assigned_to = ${c.owner_id}`;
    }
  }
  return json({ data: { contact_id: c.id, owner_id: b.user_id, changed } });
});
