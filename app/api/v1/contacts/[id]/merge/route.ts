import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { canSeeRecord, resolveActorContext } from '@/lib/taimoor/auth';
import { emitDomainEvent, saveState, writeAuditLog } from '@/lib/taimoor/store';

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
    const secondaryId = String(body?.secondary_contact_id || '');
    if (!secondaryId || secondaryId === id) {
      return NextResponse.json(
        { error: 'Valid secondary_contact_id distinct from primary id is required' },
        { status: 400 }
      );
    }

    const { state, ctx } = auth;
    const primary = state.contacts.find(
      (c) => c.id === id && c.workspace_id === ctx.workspace.id && !c.deleted_at
    );
    const secondary = state.contacts.find(
      (c) => c.id === secondaryId && c.workspace_id === ctx.workspace.id && !c.deleted_at
    );

    if (!primary || !secondary) {
      return NextResponse.json({ error: 'Primary or secondary contact not found' }, { status: 404 });
    }
    if (!canSeeRecord(ctx, primary.owner_id) || !canSeeRecord(ctx, secondary.owner_id)) {
      return NextResponse.json({ error: 'RLS Forbidden' }, { status: 403 });
    }

    const now = new Date().toISOString();
    primary.alt_phone = primary.alt_phone || secondary.phone_e164;
    primary.email = primary.email || secondary.email;
    primary.tags = Array.from(new Set([...primary.tags, ...secondary.tags]));
    primary.custom = { ...secondary.custom, ...primary.custom };
    primary.updated_at = now;
    primary.last_activity_at = now;

    // Reassign deals, activities, conversations
    state.deals.forEach((d) => {
      if (d.contact_id === secondary.id) d.contact_id = primary.id;
    });
    state.activities.forEach((a) => {
      if (a.contact_id === secondary.id) a.contact_id = primary.id;
    });
    state.conversations.forEach((cv) => {
      if (cv.contact_id === secondary.id) cv.contact_id = primary.id;
    });

    secondary.deleted_at = now;

    state.activities.unshift({
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      contact_id: primary.id,
      deal_id: null,
      type: 'system',
      actor_id: ctx.user.id,
      body: `Merged duplicate contact "${secondary.name}" (${secondary.phone_e164}) into "${primary.name}"`,
      meta: { merged_contact_id: secondary.id },
      created_at: now,
    });

    writeAuditLog(state, {
      workspace_id: ctx.workspace.id,
      actor_id: ctx.user.id,
      action: 'contact.merged',
      entity_type: 'contact',
      entity_id: primary.id,
      meta: { secondary_id: secondary.id },
    });

    const event = emitDomainEvent(state, ctx.workspace.id, 'contact.updated', {
      contact_id: primary.id,
      merged_from: secondary.id,
    });

    saveState(state);
    return NextResponse.json({ contact: primary, merged_contact_id: secondary.id, emitted_event: event });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
