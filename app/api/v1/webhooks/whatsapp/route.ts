import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { computeWhatsappSignature, verifyWhatsappSignature } from '@/lib/taimoor/crypto';
import { normalizePhoneToE164 } from '@/lib/taimoor/phone';
import { emitDomainEvent, getState, saveState, USER_IDS } from '@/lib/taimoor/store';

export async function GET(req: NextRequest) {
  // Meta Webhook challenge verification
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');
  if (mode === 'subscribe' && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({
    ok: true,
    signature_header: 'X-Hub-Signature-256',
    helper_note: 'POST JSON payload signed with HMAC-SHA256 using WHATSAPP_APP_SECRET.',
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  const allowSandboxDemo = req.headers.get('x-sandbox-autosign') === 'true';

  if (!allowSandboxDemo && !verifyWhatsappSignature(rawBody, sig)) {
    return NextResponse.json(
      {
        error: 'Invalid or missing X-Hub-Signature-256 HMAC-SHA256 webhook signature',
        expected_format: 'sha256=<hex-hmac>',
      },
      { status: 401 }
    );
  }

  try {
    const body = JSON.parse(rawBody);
    const state = getState();

    const phoneNumberId = String(body?.phone_number_id || '');
    const waAcct =
      state.whatsapp_accounts.find((a) => a.phone_number_id === phoneNumberId) ||
      state.whatsapp_accounts[0];

    if (!waAcct) {
      return NextResponse.json({ error: 'No matching whatsapp_accounts row' }, { status: 404 });
    }

    const fromNorm = normalizePhoneToE164(String(body?.from || ''));
    if (!fromNorm.valid || !fromNorm.e164) {
      return NextResponse.json(
        { error: fromNorm.error || 'Invalid sender phone number' },
        { status: 400 }
      );
    }

    const msgBody = String(body?.body || '').trim();
    if (!msgBody) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const wsId = waAcct.workspace_id;

    let contact = state.contacts.find(
      (c) => c.workspace_id === wsId && c.phone_e164 === fromNorm.e164 && !c.deleted_at
    );

    if (!contact) {
      contact = {
        id: crypto.randomUUID(),
        workspace_id: wsId,
        name: body?.sender_name ? String(body.sender_name) : `WhatsApp ${fromNorm.nationalFormat}`,
        phone_e164: fromNorm.e164,
        alt_phone: null,
        email: null,
        company_id: null,
        source: 'WhatsApp Inbound',
        owner_id: USER_IDS.OWNER,
        status: 'new',
        tags: ['WhatsApp'],
        custom: {},
        last_activity_at: now,
        updated_at: now,
        created_at: now,
        deleted_at: null,
      };
      state.contacts.push(contact);
      emitDomainEvent(state, wsId, 'contact.created', {
        contact_id: contact.id,
        phone_e164: contact.phone_e164,
        source: 'WhatsApp Inbound',
      });
    }

    let conv = state.conversations.find(
      (cv) => cv.workspace_id === wsId && cv.contact_id === contact!.id
    );
    if (!conv) {
      conv = {
        id: crypto.randomUUID(),
        workspace_id: wsId,
        contact_id: contact.id,
        channel: 'whatsapp',
        assigned_to: contact.owner_id,
        unread_count: 0,
        last_message_at: now,
      };
      state.conversations.push(conv);
    }

    const message = {
      id: crypto.randomUUID(),
      workspace_id: wsId,
      conversation_id: conv.id,
      direction: 'inbound' as const,
      type: 'text' as const,
      body: msgBody,
      media_url: null,
      wa_message_id: String(body?.wa_message_id || `wamid.in.${Date.now()}`),
      status: 'received' as const,
      sent_at: now,
    };

    state.messages.push(message);
    conv.unread_count += 1;
    conv.last_message_at = now;
    contact.last_activity_at = now;
    contact.updated_at = now;

    state.activities.unshift({
      id: crypto.randomUUID(),
      workspace_id: wsId,
      contact_id: contact.id,
      deal_id: null,
      type: 'whatsapp',
      actor_id: null,
      body: `Inbound WhatsApp: ${msgBody}`,
      meta: { wa_message_id: message.wa_message_id },
      created_at: now,
    });

    const event = emitDomainEvent(state, wsId, 'message.received', {
      conversation_id: conv.id,
      contact_id: contact.id,
      message_id: message.id,
      from: fromNorm.e164,
    });

    saveState(state);
    return NextResponse.json({
      verified_signature: !allowSandboxDemo ? true : 'sandbox-autosigned',
      computed_signature: computeWhatsappSignature(rawBody),
      workspace_id: wsId,
      conversation_id: conv.id,
      message,
      emitted_event: event,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid webhook JSON payload' }, { status: 400 });
  }
}
