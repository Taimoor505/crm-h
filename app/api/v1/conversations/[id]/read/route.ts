import { elevate } from '@/server/db';
import { json, userRoute } from '@/server/http';
import { visibleConversation } from '@/server/core/conversations';

// POST /conversations/:id/read
export const POST = userRoute<{ id: string }>({ allowWhenReadOnly: true }, async ({ params, tx, workspace, userId, isManager }) => {
  const cv = await visibleConversation(tx, workspace.id, params.id, userId, isManager);
  await elevate(tx);
  await tx`update public.conversations set unread_count = 0 where id = ${cv.id}`;
  return json({ data: { unread_count: 0 } });
});
