import type { Db } from '../db';
import { ApiError } from '../http';
import { decryptSecret } from '../crypto';
import { notify } from '../notifications/service';
import { createOrGetContact, logActivity } from './contacts';
import { normalizePhone } from './phone';

/** One inbound message from Meta's WhatsApp Cloud API webhook. */
export interface InboundMessage {
  phoneNumberId: string;
  from: string;           // digits, no +
  profileName: string | null;
  waMessageId: string;
  type: string;           // text, image, audio, document, button, interactive, ...
  text: string;
  timestamp: number | null; // epoch seconds
}

const MEDIA_LABEL: Record<string, string> = { image: '[Photo]', audio: '[Voice message]', video: '[Video]', document: '[Document]', sticker: '[Sticker]', location: '[Location]' };

/**
 * Stores an inbound message: contact (new ones become leads via the
 * contact.created job), conversation, message, timeline entry, and a
 * notification for the lead's owner. Idempotent on the WhatsApp message id.
 */
export async function recordInbound(tx: Db, m: InboundMessage): Promise<{ status: 'stored' | 'duplicate' | 'no_account' | 'bad_number'; conversationId?: string }> {
  const [acct] = await tx<{ workspace_id: string }[]>`
    select workspace_id from public.whatsapp_accounts where phone_number_id = ${m.phoneNumberId}`;
  if (!acct) return { status: 'no_account' };
  const ws = acct.workspace_id;
  const phone = normalizePhone(`+${m.from.replace(/\D/g, '')}`);
  if (!phone) return { status: 'bad_number' };
  const [dup] = await tx`select 1 from public.messages where workspace_id = ${ws} and wa_message_id = ${m.waMessageId}`;
  if (dup) return { status: 'duplicate' };

  const { contact } = await createOrGetContact(tx, {
    workspaceId: ws, name: m.profileName || phone, phoneE164: phone, source: 'whatsapp', tags: ['whatsapp'],
  });
  const at = m.timestamp ? new Date(m.timestamp * 1000) : new Date();
  const [conv] = await tx<{ id: string; assigned_to: string | null }[]>`
    insert into public.conversations (workspace_id, contact_id, channel, assigned_to, unread_count, last_message_at)
    values (${ws}, ${contact.id}, 'whatsapp', ${contact.owner_id}, 1, ${at})
    on conflict (workspace_id, contact_id, channel) do update
      set unread_count = public.conversations.unread_count + 1,
          last_message_at = greatest(public.conversations.last_message_at, excluded.last_message_at),
          assigned_to = coalesce(public.conversations.assigned_to, excluded.assigned_to)
    returning id, assigned_to`;
  const body = m.text || MEDIA_LABEL[m.type] || `[${m.type}]`;
  const type = ['image', 'audio', 'document'].includes(m.type) ? m.type : 'text';
  const inserted = await tx`
    insert into public.messages (workspace_id, conversation_id, direction, type, body, wa_message_id, status, sent_at)
    values (${ws}, ${conv.id}, 'inbound', ${type}, ${body}, ${m.waMessageId}, 'received', ${at})
    on conflict (workspace_id, wa_message_id) where wa_message_id is not null do nothing`;
  if (inserted.count === 0) return { status: 'duplicate' };
  await tx`update public.contacts set last_activity_at = now(), updated_at = now() where id = ${contact.id}`;
  await logActivity(tx, { workspaceId: ws, contactId: contact.id, type: 'whatsapp', body: `WhatsApp: ${body.slice(0, 500)}`, meta: { direction: 'inbound', wa_message_id: m.waMessageId, counts_as_response: false } });
  const owner = contact.owner_id ?? conv.assigned_to;
  if (owner) {
    await notify(tx, {
      workspaceId: ws, userId: owner, type: 'message.received',
      title: `WhatsApp from ${contact.name || phone}`, body: body.slice(0, 140),
      data: { contact_id: contact.id, conversation_id: conv.id },
      dedupeKey: `message.received:${conv.id}:${Math.floor(Date.now() / 600_000)}`, // at most one per 10 minutes per chat
    });
  }
  return { status: 'stored', conversationId: conv.id };
}

/** Delivery receipts for messages we sent. */
export async function recordStatus(tx: Db, waMessageId: string, status: string) {
  const order = ['sent', 'delivered', 'read'];
  if (status === 'failed') {
    await tx`update public.messages set status = 'failed' where wa_message_id = ${waMessageId} and direction = 'outbound'`;
  } else if (order.includes(status)) {
    await tx`
      update public.messages set status = ${status}
       where wa_message_id = ${waMessageId} and direction = 'outbound'
         and array_position(${order}::text[], status) < array_position(${order}::text[], ${status}::text)`;
  }
}

/** Sends a free-text reply from the workspace's own WhatsApp number (inside the 24-hour window). */
export async function sendText(tx: Db, workspaceId: string, toE164: string, text: string): Promise<{ messageId: string }> {
  const [acct] = await tx<{ phone_number_id: string; token_ciphertext: string; status: string }[]>`
    select phone_number_id, token_ciphertext, status from public.whatsapp_accounts where workspace_id = ${workspaceId} limit 1`;
  if (!acct || acct.status === 'disconnected') {
    throw new ApiError(409, 'whatsapp_not_connected', 'Connect a WhatsApp number in Settings to reply from the inbox');
  }
  const res = await fetch(`https://graph.facebook.com/v21.0/${acct.phone_number_id}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${decryptSecret(acct.token_ciphertext)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: toE164.replace(/^\+/, ''), type: 'text', text: { body: text } }),
  });
  const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok || !body.messages?.[0]?.id) {
    // 131047: outside the 24-hour window; a template is needed.
    if (body.error?.code === 131047) throw new ApiError(409, 'outside_window', 'More than 24 hours since their last message. Send an approved template instead.');
    throw new ApiError(502, 'whatsapp_send_failed', body.error?.message ?? 'WhatsApp did not accept the message');
  }
  return { messageId: body.messages[0].id };
}
