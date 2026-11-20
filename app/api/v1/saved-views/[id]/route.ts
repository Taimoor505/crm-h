import { ApiError, json, userRoute } from '@/server/http';

// DELETE /saved-views/:id (your own views only; RLS enforces it too)
export const DELETE = userRoute<{ id: string }>({ allowWhenReadOnly: true }, async ({ params, tx, workspace, userId }) => {
  const r = await tx`delete from public.saved_views where id = ${params.id} and workspace_id = ${workspace.id} and user_id = ${userId}`;
  if (r.count === 0) throw new ApiError(404, 'not_found', 'View not found');
  return json({ data: { removed: true } });
});
