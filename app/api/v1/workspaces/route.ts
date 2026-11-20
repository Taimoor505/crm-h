import { z } from 'zod';
import { ApiError, authRoute, json, readJson } from '@/server/http';
import { loadUser } from '@/server/core/identity';
import { createWorkspace, housePartner, regionFromInput, workspaceOut, type WorkspaceRow } from '@/server/core/workspaces';

// GET /workspaces: workspaces the caller belongs to (or administers as a partner).
export const GET = authRoute(async ({ tx, userId }) => {
  const user = await loadUser(tx, userId);
  const rows = await tx<WorkspaceRow[]>`
    select w.* from public.workspaces w
     where exists (select 1 from public.memberships m where m.workspace_id = w.id and m.user_id = ${userId} and m.status = 'active')
        or (${user.partner_admin_of}::uuid is not null and w.partner_id = ${user.partner_admin_of})
     order by w.created_at`;
  return json({ data: rows.map(workspaceOut) });
});

const createSchema = z.object({
  name: z.string().trim().min(1, 'Workspace name is required').max(80),
  template_key: z.string().max(40).default('general'),
  seed_samples: z.boolean().default(false),
  owner_name: z.string().trim().max(80).optional(),
}).passthrough();

// POST /workspaces: self-serve onboarding. The caller becomes the owner.
export const POST = authRoute(async ({ req, tx, userId }) => {
  const b = await readJson(req, createSchema);
  const [{ n }] = await tx<{ n: number }[]>`
    select count(*)::int as n from public.memberships where user_id = ${userId} and role = 'owner'`;
  if (n >= 10) throw new ApiError(429, 'workspace_limit', 'You already own 10 workspaces. Contact support to add more.');
  if (b.owner_name) await tx`update public.users set name = ${b.owner_name} where id = ${userId} and name in ('', split_part(email, '@', 1))`;
  const partner = await housePartner(tx);
  const ws = await createWorkspace(tx, {
    partnerId: partner.id,
    name: b.name,
    templateKey: b.template_key,
    region: regionFromInput(b as Record<string, unknown>),
    ownerId: userId,
    seedSamples: b.seed_samples,
  });
  return json({ workspace: workspaceOut(ws) }, 201);
});
export const dynamic = 'force-dynamic';
