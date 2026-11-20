import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';

// PATCH /custom-fields/:id (owner/manager): label, options, required, hidden, position.
export const PATCH = userRoute<{ id: string }>({ managerOnly: true }, async ({ req, params, tx, workspace }) => {
  const b = await readJson(req, z.object({
    label_en: z.string().trim().min(1).max(60).optional(),
    label: z.string().trim().min(1).max(60).optional(),
    options: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
    required: z.boolean().optional(),
    hidden: z.boolean().optional(),
    position: z.number().int().min(0).optional(),
  }).passthrough());
  await elevate(tx);
  const [f] = await tx<{ id: string; label_en: string; options: string[]; required: boolean; hidden: boolean; position: number }[]>`
    select * from public.custom_field_defs where id = ${params.id} and workspace_id = ${workspace.id}`;
  if (!f) throw new ApiError(404, 'not_found', 'Field not found');
  const [field] = await tx`
    update public.custom_field_defs set
      label_en = ${b.label_en ?? b.label ?? f.label_en}, options = ${tx.json(b.options ?? f.options)},
      required = ${b.required ?? f.required}, hidden = ${b.hidden ?? f.hidden}, position = ${b.position ?? f.position}
    where id = ${f.id}
    returning id, workspace_id, entity, key, label_en, type, options, required, position, hidden, created_at`;
  return json({ custom_field: field });
});
