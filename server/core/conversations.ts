import type { Db } from '../db';
import { ApiError } from '../http';

export async function visibleConversation(tx: Db, workspaceId: string, id: string, userId: string, isManager: boolean) {
  const [cv] = await tx<{ id: string; contact_id: string; assigned_to: string | null; owner_id: string | null; phone_e164: string }[]>`
    select cv.id, cv.contact_id, cv.assigned_to, c.owner_id, c.phone_e164
      from public.conversations cv join public.contacts c on c.id = cv.contact_id
     where cv.id = ${id} and cv.workspace_id = ${workspaceId}`;
  if (!cv) throw new ApiError(404, 'not_found', 'Conversation not found');
  if (!isManager && cv.owner_id !== userId && cv.assigned_to !== userId) throw new ApiError(403, 'forbidden', 'This chat belongs to someone else');
  return cv;
}
