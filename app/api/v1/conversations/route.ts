import { json, userRoute } from '@/server/http';

// GET /conversations: WhatsApp chats, latest first. Agents see chats with their own leads.
export const GET = userRoute({ allowWhenReadOnly: true }, async ({ tx, workspace, userId, isManager }) => {
  const rows = await tx`
    select cv.*, c.name as contact_name, c.phone_e164 as contact_phone, c.owner_id as contact_owner,
           lm.id as lm_id, lm.direction as lm_direction, lm.type as lm_type, lm.body as lm_body, lm.status as lm_status, lm.sent_at as lm_sent_at
      from public.conversations cv
      join public.contacts c on c.id = cv.contact_id and c.deleted_at is null
      left join lateral (
        select * from public.messages m where m.conversation_id = cv.id order by m.sent_at desc limit 1
      ) lm on true
     where cv.workspace_id = ${workspace.id}
       ${isManager ? tx`` : tx`and (c.owner_id = ${userId} or cv.assigned_to = ${userId})`}
     order by cv.last_message_at desc
     limit 200`;
  return json({
    data: rows.map((r) => ({
      id: r.id, workspace_id: r.workspace_id, contact_id: r.contact_id, channel: r.channel, assigned_to: r.assigned_to ?? r.contact_owner,
      unread_count: r.unread_count, last_message_at: r.last_message_at,
      contact: { id: r.contact_id, name: r.contact_name, phone_e164: r.contact_phone },
      last_message: r.lm_id ? { id: r.lm_id, conversation_id: r.id, direction: r.lm_direction, type: r.lm_type, body: r.lm_body, status: r.lm_status, sent_at: r.lm_sent_at } : null,
    })),
  });
});
