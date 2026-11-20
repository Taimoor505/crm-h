import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, decodeCursor, encodeCursor, json, readJson, readQuery, userRoute } from '@/server/http';
import { normalizePhone } from '@/server/core/phone';
import { cleanCustom, contactOut, type ContactRow } from '@/server/core/crm';
import { createOrGetContact, logActivity } from '@/server/core/contacts';
import { loadWorkspace } from '@/server/core/workspaces';

const listSchema = z.object({
  q: z.string().trim().max(100).optional(),
  source: z.string().max(40).optional(),
  owner: z.union([z.literal('none'), z.literal('me'), z.uuid()]).optional(),
  status: z.string().max(30).optional(),
  tag: z.string().max(40).optional(),
  stage: z.uuid().optional(),
  updated_since: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// GET /contacts: newest first. Agents see only their own leads.
export const GET = userRoute({ allowWhenReadOnly: true }, async ({ req, tx, workspace, userId, isManager }) => {
  const q = readQuery(req, listSchema);
  const cursor = decodeCursor<{ c: string; id: string }>(q.cursor);
  const text = q.q?.toLowerCase();
  const digits = q.q?.replace(/\D/g, '') ?? '';
  const owner = q.owner === 'me' ? userId : q.owner;
  const filters = [
    tx`c.workspace_id = ${workspace.id}`,
    tx`c.deleted_at is null`,
    !isManager && tx`c.owner_id = ${userId}`,
    q.source && tx`c.source = ${q.source}`,
    owner === 'none' ? tx`c.owner_id is null` : owner ? tx`c.owner_id = ${owner}` : null,
    q.status && tx`c.status = ${q.status}`,
    q.tag && tx`${q.tag} = any(c.tags)`,
    q.stage && tx`exists (select 1 from public.deals d where d.contact_id = c.id and d.stage_id = ${q.stage} and d.deleted_at is null)`,
    q.updated_since && tx`c.updated_at >= ${q.updated_since}`,
    text && (digits.length >= 3
      ? tx`(lower(c.name) like ${'%' + text + '%'} or c.phone_e164 like ${'%' + digits + '%'} or lower(coalesce(c.email, '')) like ${'%' + text + '%'})`
      : tx`(lower(c.name) like ${'%' + text + '%'} or lower(coalesce(c.email, '')) like ${'%' + text + '%'} or ${text} = any(c.tags))`),
  ].filter((f): f is NonNullable<typeof f> & object => Boolean(f) && typeof f === 'object');
  const where = filters.reduce((acc, f) => tx`${acc} and ${f}`);
  const [{ total }] = await tx<{ total: number }[]>`select count(*)::int as total from public.contacts c where ${where}`;
  const rows = await tx<ContactRow[]>`
    select c.* from public.contacts c
     where ${where} ${cursor ? tx`and (c.created_at, c.id) < (${cursor.c}::timestamptz, ${cursor.id}::uuid)` : tx``}
     order by c.created_at desc, c.id desc
     limit ${q.limit + 1}`;
  const page = rows.slice(0, q.limit);
  const last = page.at(-1);
  return json({
    data: page.map(contactOut),
    pagination: {
      limit: q.limit,
      next_cursor: rows.length > q.limit && last ? encodeCursor({ c: last.created_at.toISOString(), id: last.id }) : null,
      total_visible: total,
    },
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1, 'Contact name is required').max(200),
  phone: z.string().trim().max(30).optional(),
  phone_e164: z.string().trim().max(30).optional(),
  phone_country: z.string().length(2).optional(),
  email: z.union([z.email(), z.literal('')]).optional(),
  source: z.string().trim().max(40).default('manual'),
  status: z.string().trim().max(30).default('new'),
  owner_id: z.uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  custom: z.record(z.string(), z.unknown()).optional(),
});

// POST /contacts: full create (quick add is POST /leads/quick-add).
export const POST = userRoute({}, async ({ req, tx, workspace, userId, isManager }) => {
  const b = await readJson(req, createSchema);
  const ws = await loadWorkspace(tx, workspace.id);
  const phone = normalizePhone(b.phone ?? b.phone_e164, b.phone_country ?? ws.default_phone_country);
  if (!phone) throw new ApiError(422, 'invalid_phone', 'Phone number is not valid');
  const custom = await cleanCustom(tx, workspace.id, 'contact', b.custom);
  const owner = isManager ? (b.owner_id === undefined ? userId : b.owner_id) : userId;
  await elevate(tx); // duplicate check must see other agents' leads
  const { contact, created } = await createOrGetContact(tx, {
    workspaceId: workspace.id, name: b.name, phoneE164: phone, email: b.email || null, source: b.source,
    ownerId: owner, tags: b.tags, custom,
  });
  if (!created) {
    throw new ApiError(409, 'duplicate_phone', `A lead with ${phone} already exists`, {
      duplicate_contact_id: contact.id,
      visible: isManager || contact.owner_id === userId,
    });
  }
  const [row] = await tx<ContactRow[]>`
    update public.contacts set status = ${b.status}, last_enquiry_at = now(), assigned_at = ${owner ? new Date().toISOString() : null}::timestamptz
     where id = ${contact.id} returning *`;
  await logActivity(tx, { workspaceId: workspace.id, contactId: row.id, type: 'system', actorId: userId, body: 'Lead added by hand', meta: { kind: 'lead_received', source_label: b.source } });
  return json({ contact: contactOut(row) }, 201);
});
