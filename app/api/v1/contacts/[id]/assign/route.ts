import { z } from 'zod';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { assignContact } from '@/server/assignment/engine';
import type { Contact } from '@/server/core/contacts';

const schema = z.object({
  /** New owner; null unassigns. */
  user_id: z.uuid().nullable(),
});

// POST /contacts/:id/assign (managers): manual assignment or reassignment.
export const POST = userRoute<{ id: string }>({ managerOnly: true }, async ({ req, tx, workspace, userId, params }) => {
  const body = await readJson(req, schema);
  const [contact] = await tx<Contact[]>`
    select * from public.contacts
     where id = ${params.id} and workspace_id = ${workspace.id} and deleted_at is null
       for update`;
  if (!contact) throw new ApiError(404, 'not_found', 'Contact not found');

  if (body.user_id) {
    const [m] = await tx<{ user_id: string }[]>`
      select user_id from public.memberships
       where workspace_id = ${workspace.id} and user_id = ${body.user_id} and status = 'active'`;
    if (!m) throw new ApiError(422, 'invalid_assignee', 'Assignee is not an active member of this workspace');
  }
  if (contact.owner_id === body.user_id) {
    return json({ data: { contact_id: contact.id, owner_id: contact.owner_id, changed: false } });
  }

  await assignContact(tx, { contact, toUserId: body.user_id, actorId: userId, reason: 'manual', rule: 'manual' });
  return json({ data: { contact_id: contact.id, owner_id: body.user_id, changed: true } });
});
