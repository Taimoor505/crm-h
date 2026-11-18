import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { canSeeRecord, resolveActorContext } from '@/lib/taimoor/auth';
import { saveState } from '@/lib/taimoor/store';

export async function POST(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }

  try {
    const body = await req.json();
    const contactId = String(body?.contact_id || '');
    const prefillText = String(body?.prefill_text || '').trim();
    if (!contactId) {
      return NextResponse.json({ error: 'contact_id is required' }, { status: 400 });
    }

    const { state, ctx } = auth;
    const contact = state.contacts.find(
      (c) => c.id === contactId && c.workspace_id === ctx.workspace.id && !c.deleted_at
    );
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    if (!canSeeRecord(ctx, contact.owner_id)) {
      return NextResponse.json({ error: 'RLS Forbidden' }, { status: 403 });
    }

    const digits = contact.phone_e164.replace(/\D/g, '');
    const waUrl = `https://wa.me/${digits}${
      prefillText ? `?text=${encodeURIComponent(prefillText)}` : ''
    }`;
    const now = new Date().toISOString();

    const activity = {
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      contact_id: contact.id,
      deal_id: body?.deal_id ? String(body.deal_id) : null,
      type: 'whatsapp' as const,
      actor_id: ctx.user.id,
      body: prefillText
        ? `Click-to-chat launched: "${prefillText}"`
        : `Click-to-chat launched for ${contact.phone_e164}`,
      meta: { channel: 'click_to_chat', wa_url: waUrl },
      created_at: now,
    };

    state.activities.unshift(activity);
    contact.last_activity_at = now;
    contact.updated_at = now;
    saveState(state);

    return NextResponse.json({
      logged: true,
      wa_url: waUrl,
      phone_e164: contact.phone_e164,
      activity,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
