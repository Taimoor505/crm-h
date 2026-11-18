import { z } from 'zod';
import { jsonb } from '@/server/db';
import { json, readJson, userRoute } from '@/server/http';
import { encryptSecret } from '@/server/crypto';
import { subscribeMetaPage } from '@/server/leads/meta';
import {
  DEFAULT_LABEL, newPublicKey, newSecret, presentSource, PUBLIC_COLUMNS, type LeadSource,
} from '@/server/leads/sources';
import { leadSourceSettingsSchema, mappingSchema, metaConnectionSchema } from '@/server/leads/schemas';

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
  /** meta_leadgen only: the Facebook page (from Facebook Login on the frontend). */
  meta: metaConnectionSchema.optional(),
}).refine((b) => b.type !== 'meta_leadgen' || !!b.meta?.page_access_token, {
  path: ['meta'], message: 'meta.page_id and meta.page_access_token are required for Meta lead ads',
});

// POST /lead-sources: create. A webhook source's secret is returned once, here.
export const POST = userRoute({ managerOnly: true }, async ({ req, tx, workspace, userId }) => {
  const body = await readJson(req, createSchema);
  let secret = body.type === 'webhook' ? newSecret() : null;
  const settings: Record<string, unknown> = { ...body.settings };
  if (body.type === 'meta_leadgen' && body.meta) {
    await subscribeMetaPage(body.meta.page_id, body.meta.page_access_token!);
    settings.meta_page_id = body.meta.page_id;
    settings.meta_form_ids = body.meta.form_ids ?? [];
    secret = encryptSecret(body.meta.page_access_token!);
  }
  const [row] = await tx<LeadSource[]>`
    insert into public.lead_sources
      (workspace_id, type, name, source_label, public_key, secret, mapping, settings, created_by)
    values (${workspace.id}, ${body.type}, ${body.name}, ${body.source_label ?? DEFAULT_LABEL[body.type]},
            ${newPublicKey()}, ${secret}, ${jsonb(tx, body.mapping)}::jsonb,
            ${jsonb(tx, settings)}::jsonb, ${userId})
    returning ${tx(PUBLIC_COLUMNS)}`;
  // Only webhook secrets are shown (once); a Meta page token never leaves the server.
  return json({ data: presentSource({ ...row, secret }, { includeSecret: body.type === 'webhook' }) }, 201);
});

