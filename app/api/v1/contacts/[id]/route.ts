import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { normalizePhone } from '@/server/core/phone';
import { cleanCustom, contactOut, visibleContact, type ContactRow } from '@/server/core/crm';
import { logActivity } from '@/server/core/contacts';
import { loadWorkspace } from '@/server/core/workspaces';

type P = { id: string };

// GET /contacts/:id
export const GET = userRoute<P>({ allowWhenReadOnly: true }, async ({ params, tx, workspace, userId, isManager }) => {
  return json({ contact: contactOut(await visibleContact(tx, workspace.id, params.id, userId, isManager)) });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().max(30).optional(),
  phone_country: z.string().length(2).optional(),
  alt_phone: z.string().trim().max(30).nullable().optional(),
  email: z.union([z.email(), z.literal(''), z.null()]).optional(),
  status: z.string().trim().min(1).max(30).optional(),
  source: z.string().trim().min(1).max(40).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

// PATCH /contacts/:id
export const PATCH = userRoute<P>({}, async ({ req, params, tx, workspace, userId, isManager }) => {
  const c = await visibleContact(tx, workspace.id, params.id, userId, isManager);
  const b = await readJson(req, patchSchema);
  const ws = await loadWorkspace(tx, workspace.id);
  let phone = c.phone_e164;
  if (b.phone) {
    const p = normalizePhone(b.phone, b.phone_country ?? ws.default_phone_country);
    if (!p) throw new ApiError(422, 'invalid_phone', 'Phone number is not valid');
    phone = p;
  }
  let alt = c.alt_phone;
  if (b.alt_phone !== undefined) {
    alt = b.alt_phone ? normalizePhone(b.alt_phone, ws.default_phone_country) : null;
    if (b.alt_phone && !alt) throw new ApiError(422, 'invalid_phone', 'Second phone number is not valid');
  }
  const custom = b.custom ? { ...c.custom, ...(await cleanCustom(tx, workspace.id, 'contact', b.custom)) } : c.custom;
  if (phone !== c.phone_e164) {
    await elevate(tx);
    const [dup] = await tx`select id from public.contacts where workspace_id = ${workspace.id} and phone_e164 = ${phone} and deleted_at is null and id <> ${c.id}`;
    if (dup) throw new ApiError(409, 'duplicate_phone', `A lead with ${phone} already exists`, { duplicate_contact_id: dup.id });
  }
  const [row] = await tx<ContactRow[]>`
    update public.contacts set
      name = ${b.name ?? c.name}, phone_e164 = ${phone}, alt_phone = ${alt},
      email = ${b.email === undefined ? c.email : b.email || null}, status = ${b.status ?? c.status},
      source = ${b.source ?? c.source}, tags = ${b.tags ?? c.tags}::text[], custom = ${tx.json(custom as never)},
      updated_at = now()
    where id = ${c.id} returning *`;
  if (b.status && b.status !== c.status) {
    await logActivity(tx, { workspaceId: workspace.id, contactId: c.id, type: 'system', actorId: userId, body: `Status changed to ${b.status}`, meta: { kind: 'status_changed', from: c.status, to: b.status } });
  }
  return json({ contact: contactOut(row) });
});

// DELETE /contacts/:id: soft delete (owner/manager, or the agent who owns it).
export const DELETE = userRoute<P>({}, async ({ params, tx, workspace, userId, isManager }) => {
  const c = await visibleContact(tx, workspace.id, params.id, userId, isManager);
  await tx`update public.contacts set deleted_at = now(), updated_at = now() where id = ${c.id}`;
  await tx`update public.tasks set status = 'cancelled', updated_at = now() where contact_id = ${c.id} and status = 'open'`;
  return json({ deleted: true });
});
