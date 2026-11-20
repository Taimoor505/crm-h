import { z } from 'zod';
import { ApiError, json, readJson, userRoute } from '@/server/http';

const filters = z.object({
  q: z.string().max(100).optional(),
  source: z.string().max(40).optional(),
  owner: z.string().max(40).optional(),
  status: z.string().max(30).optional(),
  tag: z.string().max(40).optional(),
  stage: z.string().max(40).optional(),
  created_within_days: z.coerce.number().int().min(1).max(365).optional(),
  awaiting: z.enum(['true']).optional(),
}).strict();

// GET /saved-views: mine plus views shared in this workspace.
export const GET = userRoute({ allowWhenReadOnly: true }, async ({ tx, workspace, userId }) => {
  const rows = await tx`
    select id, name, filters, shared, user_id, created_at from public.saved_views
     where workspace_id = ${workspace.id} and (user_id = ${userId} or shared)
     order by shared, position, created_at`;
  return json({ data: rows });
});

// POST /saved-views { name, filters, shared? } (sharing: owners/managers)
export const POST = userRoute({ allowWhenReadOnly: true }, async ({ req, tx, workspace, userId, isManager }) => {
  const b = await readJson(req, z.object({ name: z.string().trim().min(1).max(60), filters, shared: z.boolean().default(false) }));
  if (b.shared && !isManager) throw new ApiError(403, 'forbidden', 'Only owners and managers can share views with the team');
  const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from public.saved_views where workspace_id = ${workspace.id} and user_id = ${userId}`;
  if (n >= 30) throw new ApiError(422, 'too_many_views', 'You can save up to 30 views');
  const [view] = await tx`
    insert into public.saved_views (workspace_id, user_id, name, filters, shared, position)
    values (${workspace.id}, ${userId}, ${b.name}, ${tx.json(b.filters)}, ${b.shared}, ${n})
    returning id, name, filters, shared, user_id, created_at`;
  return json({ data: view }, 201);
});
