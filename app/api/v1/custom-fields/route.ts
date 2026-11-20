import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readJson, readQuery, userRoute } from '@/server/http';

const TYPES = ['text', 'number', 'money', 'date', 'select', 'multiselect', 'phone', 'area', 'boolean', 'email', 'url'] as const;

// GET /custom-fields?entity=contact|deal
export const GET = userRoute({ allowWhenReadOnly: true }, async ({ req, tx, workspace }) => {
  const q = readQuery(req, z.object({ entity: z.enum(['contact', 'deal']).optional() }));
  const rows = await tx`
    select id, workspace_id, entity, key, label_en, type, options, required, position, hidden, created_at
      from public.custom_field_defs
     where workspace_id = ${workspace.id} ${q.entity ? tx`and entity = ${q.entity}` : tx``}
     order by entity, position, created_at`;
  return json({ data: rows });
});

// POST /custom-fields (owner/manager)
export const POST = userRoute({ managerOnly: true }, async ({ req, tx, workspace }) => {
  const b = await readJson(req, z.object({
    entity: z.enum(['contact', 'deal']),
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,40}$/, 'Key must be lowercase letters, digits and underscores').optional(),
    label_en: z.string().trim().min(1).max(60).optional(),
    label: z.string().trim().min(1).max(60).optional(),
    type: z.enum(TYPES).default('text'),
    options: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    required: z.boolean().default(false),
  }).passthrough());
  const label = b.label_en ?? b.label;
  if (!label) throw new ApiError(422, 'validation_failed', 'Field label is required');
  const key = b.key ?? (label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'f_$1').slice(0, 40) || 'field');
  if ((b.type === 'select' || b.type === 'multiselect') && b.options.length === 0) {
    throw new ApiError(422, 'validation_failed', 'Add at least one option');
  }
  await elevate(tx);
  const [dup] = await tx`select 1 from public.custom_field_defs where workspace_id = ${workspace.id} and entity = ${b.entity} and key = ${key}`;
  if (dup) throw new ApiError(409, 'duplicate_key', 'A field with this name already exists');
  const [field] = await tx`
    insert into public.custom_field_defs (workspace_id, entity, key, label_en, type, options, required, position)
    values (${workspace.id}, ${b.entity}, ${key}, ${label}, ${b.type}, ${tx.json(b.options)}, ${b.required},
            (select coalesce(max(position), 0) + 1 from public.custom_field_defs where workspace_id = ${workspace.id} and entity = ${b.entity}))
    returning id, workspace_id, entity, key, label_en, type, options, required, position, hidden, created_at`;
  return json({ custom_field: field }, 201);
});
