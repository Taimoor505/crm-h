import { z } from 'zod';
import { jsonb } from '@/server/db';
import { json, readJson, userRoute } from '@/server/http';
import {
  DEFAULT_LABEL, newPublicKey, newSecret, presentSource, PUBLIC_COLUMNS, type LeadSource,
} from '@/server/leads/sources';
import { leadSourceSettingsSchema, mappingSchema } from '@/server/leads/schemas';

// GET /lead-sources: all sources in the workspace (managers).
export const GET = userRoute({ managerOnly: true }, async ({ tx, workspace }) => {
  const rows = await tx<LeadSource[]>`
    select ${tx(PUBLIC_COLUMNS)} from public.lead_sources
     where workspace_id = ${workspace.id}
     order by created_at`;
  return json({ data: rows.map((r) => presentSource(r)) });
});

const createSchema = z.object({
  type: z.enum(['website_form', 'webhook', 'meta_leadgen', 'manual']),
  name: z.string().trim().min(1).max(100),
  source_label: z.string().trim().toLowerCase().regex(/^[a-z0-9_-]{1,40}$/).optional(),
  mapping: mappingSchema.default({}),
  settings: leadSourceSettingsSchema.default({}),
});

// POST /lead-sources: create. A webhook source's secret is returned once, here.
export const POST = userRoute({ managerOnly: true }, async ({ req, tx, workspace, userId }) => {
  const body = await readJson(req, createSchema);
  const secret = body.type === 'webhook' ? newSecret() : null;
  const [row] = await tx<LeadSource[]>`
    insert into public.lead_sources
      (workspace_id, type, name, source_label, public_key, secret, mapping, settings, created_by)
    values (${workspace.id}, ${body.type}, ${body.name}, ${body.source_label ?? DEFAULT_LABEL[body.type]},
            ${newPublicKey()}, ${secret}, ${jsonb(tx, body.mapping)}::jsonb,
            ${jsonb(tx, body.settings)}::jsonb, ${userId})
    returning ${tx(PUBLIC_COLUMNS)}`;
  return json({ data: presentSource({ ...row, secret }, { includeSecret: true }) }, 201);
});
