import { z } from 'zod';
import { elevate } from '@/server/db';
import { json, readJson, userRoute } from '@/server/http';
import { visibleConversation } from '@/server/core/conversations';
import { markResponded } from '@/server/core/crm';
import { logActivity } from '@/server/core/contacts';
import { sendText } from '@/server/core/inbox';

type P = { id: string };

// GET /conversations/:id/messages: oldest first (last 500).
export const GET = userRoute<P>({ allowWhenReadOnly: true }, async ({ params, tx, workspace, userId, isManager }) => {
  const cv = await visibleConversation(tx, workspace.id, params.id, userId, isManager);
  await elevate(tx);
  const rows = await tx`
    select * from (select * from public.messages where conversation_id = ${cv.id} order by sent_at desc limit 500) m
     order by sent_at`;
  return json({ data: rows });
});

// POST /conversations/:id/messages: reply from the workspace's WhatsApp number.
export const POST = userRoute<P>({}, async ({ req, params, tx, workspace, userId, isManager }) => {
  const cv = await visibleConversation(tx, workspace.id, params.id, userId, isManager);
  const b = await readJson(req, z.object({ body: z.string().trim().min(1, 'Message is empty').max(4096), type: z.literal('text').default('text') }));
  await elevate(tx);
  const sent = await sendText(tx, workspace.id, cv.phone_e164, b.body);
  const [message] = await tx`
    insert into public.messages (workspace_id, conversation_id, direction, type, body, wa_message_id, status)
    values (${workspace.id}, ${cv.id}, 'outbound', 'text', ${b.body}, ${sent.messageId}, 'sent') returning *`;
  await tx`update public.conversations set last_message_at = now(), unread_count = 0 where id = ${cv.id}`;
  await markResponded(tx, cv.contact_id);
  await logActivity(tx, { workspaceId: workspace.id, contactId: cv.contact_id, type: 'whatsapp', actorId: userId, body: `WhatsApp sent: ${b.body.slice(0, 500)}`, meta: { direction: 'outbound', wa_message_id: sent.messageId } });
  return json({ message }, 201);
});
