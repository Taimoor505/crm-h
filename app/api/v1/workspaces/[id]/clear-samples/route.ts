import { elevate } from '@/server/db';
import { ApiError, json, userRoute } from '@/server/http';
import { clearSamples } from '@/server/core/workspaces';

// POST /workspaces/:id/clear-samples (owner/manager): removes the sample leads, deals and follow-ups.
export const POST = userRoute<{ id: string }>({ managerOnly: true }, async ({ params, tx, workspace }) => {
  if (params.id !== workspace.id) throw new ApiError(400, 'workspace_mismatch', 'URL workspace does not match X-Workspace-Id');
  await elevate(tx);
  return json({ data: { removed: await clearSamples(tx, workspace.id) } });
});
