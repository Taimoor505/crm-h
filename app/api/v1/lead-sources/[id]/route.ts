import { z } from 'zod';
import { jsonb } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { newSecret, presentSource, PUBLIC_COLUMNS, type LeadSource } from '@/server/leads/sources';
import { leadSourceSettingsSchema, mappingSchema } from '@/server/leads/schemas';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  source_label: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,40}$/).optional(),
  mapping: mappingSchema.optional(),
  settings: leadSourceSettingsSchema.optional(),
  is_active: z.boolean().optional(),
  /** Webhook sources: issue a new secret (the old one stops working immediately). */
  rotate_secret: z.literal(true).optional(),
});

// PATCH /lead-sources/:id
export const PATCH = userRoute<{ id: string }>({ managerOnly: true }, async ({ req, tx, workspace, params }) => {
  const body = await readJson(req, patchSchema);
  const [current] = await tx<LeadSource[]>`
    select ${tx(PUBLIC_COLUMNS)} from public.lead_sources
     where id = ${params.id} and workspace_id = ${workspace.id}`;
  if (!current) throw new ApiError(404, 'not_found', 'Lead source not found');
  if (body.rotate_secret && current.type !== 'webhook') {
    throw new ApiError(422, 'no_secret', 'Only webhook sources have a secret');
  }

  const secret = body.rotate_secret ? newSecret() : null;
  const [row] = await tx<LeadSource[]>`
    update public.lead_sources set
      name = coalesce(${body.name ?? null}, name),
      source_label = coalesce(${body.source_label ?? null}, source_label),
      mapping = coalesce(${body.mapping ? jsonb(tx, body.mapping) : null}::jsonb, mapping),
      settings = coalesce(${body.settings ? jsonb(tx, body.settings) : null}::jsonb, settings),
      is_active = coalesce(${body.is_active ?? null}::boolean, is_active),
      updated_at = now()
    where id = ${params.id}
    returning ${tx(PUBLIC_COLUMNS)}`;
  // Separate statement: the secret column is write-only for this role.
  if (secret) await tx`update public.lead_sources set secret = ${secret} where id = ${params.id}`;
  return json({ data: presentSource({ ...row, secret }, { includeSecret: !!secret }) });
});
