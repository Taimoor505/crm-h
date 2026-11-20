import { z } from 'zod';
import { json, readJson, userRoute } from '@/server/http';
import { markResponded, visibleContact } from '@/server/core/crm';
import { logActivity } from '@/server/core/contacts';

// POST /whatsapp/click-log: the agent opened WhatsApp (click-to-chat) for a lead. Counts as a response.
export const POST = userRoute({}, async ({ req, tx, workspace, userId, isManager }) => {
  const b = await readJson(req, z.object({ contact_id: z.uuid(), prefill_text: z.string().max(1000).optional() }));
  const c = await visibleContact(tx, workspace.id, b.contact_id, userId, isManager);
  await markResponded(tx, c.id);
  if (c.status === 'new') await tx`update public.contacts set status = 'contacted' where id = ${c.id}`;
  await logActivity(tx, {
    workspaceId: workspace.id, contactId: c.id, type: 'whatsapp', actorId: userId,
    body: `WhatsApp opened${b.prefill_text ? `: “${b.prefill_text.slice(0, 80)}”` : ''}`,
    meta: { click_to_chat: true },
  });
  const text = b.prefill_text ? `?text=${encodeURIComponent(b.prefill_text)}` : '';
  return json({ wa_url: `https://wa.me/${c.phone_e164.replace('+', '')}${text}`, logged: true });
});
