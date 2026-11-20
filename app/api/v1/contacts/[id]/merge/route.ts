import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { contactOut, type ContactRow } from '@/server/core/crm';
import { logActivity } from '@/server/core/contacts';

// POST /contacts/:id/merge (owner/manager): folds secondary_contact_id into this contact.
export const POST = userRoute<{ id: string }>({ managerOnly: true }, async ({ req, params, tx, workspace, userId }) => {
  const b = await readJson(req, z.object({ secondary_contact_id: z.uuid() }));
  if (b.secondary_contact_id === params.id) throw new ApiError(422, 'validation_failed', 'Choose a different contact to merge');
  await elevate(tx);
  const rows = await tx<ContactRow[]>`
    select * from public.contacts where workspace_id = ${workspace.id} and deleted_at is null
       and id in (${params.id}, ${b.secondary_contact_id}) for update`;
  const primary = rows.find((r) => r.id === params.id);
  const secondary = rows.find((r) => r.id === b.secondary_contact_id);
  if (!primary || !secondary) throw new ApiError(404, 'not_found', 'Contact not found');
  const tags = Array.from(new Set([...primary.tags, ...secondary.tags]));
  await tx`update public.contacts set deleted_at = now(), updated_at = now() where id = ${secondary.id}`;
  const [row] = await tx<ContactRow[]>`
    update public.contacts set
      tags = ${tags}::text[], email = coalesce(email, ${secondary.email}),
      alt_phone = coalesce(alt_phone, ${secondary.phone_e164}),
      custom = ${tx.json({ ...secondary.custom, ...primary.custom } as never)},
      owner_id = coalesce(owner_id, ${secondary.owner_id}),
      first_response_at = least(first_response_at, ${secondary.first_response_at}),
      last_enquiry_at = greatest(last_enquiry_at, ${secondary.last_enquiry_at}),
      updated_at = now()
    where id = ${primary.id} returning *`;
  for (const t of ['deals', 'tasks', 'activities', 'conversations'] as const) {
    await tx`update ${tx('public.' + t)} set contact_id = ${primary.id} where contact_id = ${secondary.id}`;
  }
  await logActivity(tx, { workspaceId: workspace.id, contactId: primary.id, type: 'system', actorId: userId, body: `Merged with ${secondary.name}`, meta: { kind: 'merged', merged_contact_id: secondary.id } });
  return json({ contact: contactOut(row) });
});
