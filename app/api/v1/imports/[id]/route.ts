import { ApiError, json, userRoute } from '@/server/http';

// GET /imports/:id
export const GET = userRoute<{ id: string }>({ allowWhenReadOnly: true }, async ({ params, tx, workspace }) => {
  const [job] = await tx`select * from public.imports where id = ${params.id} and workspace_id = ${workspace.id}`;
  if (!job) throw new ApiError(404, 'not_found', 'Import not found');
  return json({ import_job: job });
});
