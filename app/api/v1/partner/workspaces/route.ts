import { z } from 'zod';
import { authRoute, json, readJson } from '@/server/http';
import { partnerOf } from '@/server/core/partner';
import { cleanBranding, createWorkspace, regionFromInput, workspaceOut, type WorkspaceRow } from '@/server/core/workspaces';

// GET /partner/workspaces: the partner's client workspaces.
export const GET = authRoute(async ({ req, tx, userId }) => {
  const partnerId = await partnerOf(tx, userId, req);
  const rows = await tx<(WorkspaceRow & { member_count: number; billing_status: string | null })[]>`
    select w.*, (select count(*)::int from public.memberships m where m.workspace_id = w.id and m.status = 'active') as member_count,
           w.status as billing_status
      from public.workspaces w where w.partner_id = ${partnerId} order by w.created_at desc`;
  return json({ data: rows.map((w) => ({ ...workspaceOut(w), member_count: w.member_count, billing_status: w.billing_status, branding: w.branding })) });
});

const schema = z.object({
  name: z.string().trim().min(1, 'Workspace name is required').max(80),
  template_key: z.string().max(40).default('general'),
  region: z.record(z.string(), z.unknown()).optional(),
  branding: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

// POST /partner/workspaces: a new client workspace (the client's owner is invited afterwards).
export const POST = authRoute(async ({ req, tx, userId }) => {
  const partnerId = await partnerOf(tx, userId, req);
  const b = await readJson(req, schema);
  const ws = await createWorkspace(tx, {
    partnerId,
    name: b.name,
    templateKey: b.template_key,
    region: regionFromInput({ ...(b as Record<string, unknown>), ...(b.region ?? {}) }),
    branding: cleanBranding(b.branding ?? {}),
    ownerId: null,
    seedSamples: false,
  });
  return json({ workspace: workspaceOut(ws) }, 201);
});
