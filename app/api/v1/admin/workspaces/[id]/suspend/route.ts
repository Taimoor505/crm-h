import { z } from 'zod';
import { ApiError, json, readJson } from '@/server/http';
import { adminRoute } from '@/server/billing/context';
import { setWorkspaceSuspended } from '@/server/billing/access';

const schema = z.object({ suspended: z.boolean(), reason: z.string().trim().max(500).optional() });

/**
 * POST /admin/workspaces/:id/suspend (super-admins): suspend or lift one
 * workspace, e.g. a direct customer. Lifting re-applies the unpaid-invoice rules.
 */
export const POST = adminRoute<{ id: string }>(async ({ req, tx, params, userId }) => {
  const body = await readJson(req, schema);
  const [w] = await tx`select 1 from public.workspaces where id = ${params.id}`;
  if (!w) throw new ApiError(404, 'not_found', 'Workspace not found');
  const changed = await setWorkspaceSuspended(tx, params.id, body.suspended);
  console.info(`[admin] ${userId} set workspace ${params.id} suspended=${body.suspended}: ${body.reason ?? ''}`);
  return json({ data: { workspace_id: params.id, suspended: body.suspended, changed } });
});
