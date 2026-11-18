import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { resolveActorContext } from '@/lib/taimoor/auth';
import { saveState } from '@/lib/taimoor/store';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }
  const { state, ctx } = auth;
  const conv = state.conversations.find(
    (c) => c.id === id && c.workspace_id === ctx.workspace.id
  );
  if (!conv) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }
  if (ctx.effectiveRole === 'agent' && conv.assigned_to !== ctx.user.id) {
    return NextResponse.json({ error: 'RLS Forbidden' }, { status: 403 });
  }

  const messages = state.messages
    .filter((m) => m.conversation_id === conv.id)
    .sort((a, b) => a.sent_at.localeCompare(b.sent_at));

  return NextResponse.json({ conversation: conv, data: messages });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }

  try {
    const body = await req.json();
    const text = String(body?.body || '').trim();
    const type = ['text', 'template', 'image', 'audio', 'document'].includes(body?.type)
      ? body.type
      : 'text';
    if (!text) {
      return NextResponse.json({ error: 'Message body is required' }, { status: 400 });
    }

    const { state, ctx } = auth;
    const conv = state.conversations.find(
      (c) => c.id === id && c.workspace_id === ctx.workspace.id
    );
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    if (ctx.effectiveRole === 'agent' && conv.assigned_to !== ctx.user.id) {
      return NextResponse.json({ error: 'RLS Forbidden' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const msg = {
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      conversation_id: conv.id,
      direction: 'outbound' as const,
      type,
      body: text,
      media_url: body?.media_url ? String(body.media_url) : null,
      wa_message_id: `wamid.out.${Date.now()}`,
      status: 'sent' as const,
      sent_at: now,
    };

    state.messages.push(msg);
    conv.last_message_at = now;
    conv.unread_count = 0;

    // Meter Meta template messages for pass-through billing
    if (type === 'template') {
      const waAcct = state.whatsapp_accounts.find(
        (a) => a.workspace_id === ctx.workspace.id
      );
      if (waAcct) {
        waAcct.template_messages_sent += 1;
      }
    }

    state.activities.unshift({
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      contact_id: conv.contact_id,
      deal_id: null,
      type: 'whatsapp',
      actor_id: ctx.user.id,
      body: `Outbound WhatsApp (${type}): ${text}`,
      meta: { wa_message_id: msg.wa_message_id, metered_template: type === 'template' },
      created_at: now,
    });

    saveState(state);
    return NextResponse.json({ message: msg }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
