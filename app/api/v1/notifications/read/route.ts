import { z } from 'zod';
import { json, readJson, userRoute } from '@/server/http';

const schema = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(200) }),
  z.object({ all: z.literal(true) }),
]);

// POST /notifications/read: { ids: [...] } or { all: true }.
export const POST = userRoute({ allowWhenReadOnly: true }, async ({ req, tx, workspace, userId }) => {
  const body = await readJson(req, schema);
  const ids = 'ids' in body ? body.ids : null;
  const updated = await tx`
    update public.notifications set read_at = now()
     where user_id = ${userId} and workspace_id = ${workspace.id} and read_at is null
       ${ids ? tx`and id = any(${ids}::uuid[])` : tx``}`;
  return json({ data: { marked_read: updated.count } });
});
