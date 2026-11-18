import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { canSeeRecord, resolveActorContext } from '@/lib/taimoor/auth';
import { normalizePhoneToE164 } from '@/lib/taimoor/phone';
import { validateCustomFields } from '@/lib/taimoor/custom-fields';
import { emitDomainEvent, saveState, writeAuditLog } from '@/lib/taimoor/store';

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
  const contact = state.contacts.find(
    (c) => c.id === id && c.workspace_id === ctx.workspace.id && !c.deleted_at
  );
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }
  if (!canSeeRecord(ctx, contact.owner_id)) {
    return NextResponse.json(
      { error: 'RLS Forbidden: Agents can only access contacts where owner_id = their user id' },
      { status: 403 }
    );
  }
  return NextResponse.json({ contact });
}

export async function PATCH(
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
    const { state, ctx } = auth;
    const contact = state.contacts.find(
      (c) => c.id === id && c.workspace_id === ctx.workspace.id
    );
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    if (!canSeeRecord(ctx, contact.owner_id)) {
      return NextResponse.json({ error: 'RLS Forbidden: Not record owner' }, { status: 403 });
    }

    if (body?.restore === true && contact.deleted_at) {
      const deletedAgeDays =
        (Date.now() - Date.parse(contact.deleted_at)) / (1000 * 60 * 60 * 24);
      if (deletedAgeDays > 30) {
        return NextResponse.json(
          { error: '30-day restore window expired for soft-deleted contact' },
          { status: 410 }
        );
      }
      contact.deleted_at = null;
      writeAuditLog(state, {
        workspace_id: ctx.workspace.id,
        actor_id: ctx.user.id,
        action: 'contact.restored',
        entity_type: 'contact',
        entity_id: contact.id,
        meta: {},
      });
    }

    if (body?.name !== undefined) contact.name = String(body.name).trim();
    if (body?.email !== undefined) contact.email = body.email ? String(body.email) : null;
    if (body?.status !== undefined) contact.status = String(body.status);
    if (body?.source !== undefined) contact.source = String(body.source);
    if (Array.isArray(body?.tags)) contact.tags = body.tags.map(String);

    if (body?.phone || body?.phone_e164) {
      const norm = normalizePhoneToE164(body.phone || body.phone_e164);
      if (!norm.valid || !norm.e164) {
        return NextResponse.json({ error: norm.error || 'Invalid phone' }, { status: 400 });
      }
      const dup = state.contacts.find(
        (c) =>
          c.workspace_id === ctx.workspace.id &&
          c.phone_e164 === norm.e164 &&
          c.id !== contact.id &&
          !c.deleted_at
      );
      if (dup) {
        return NextResponse.json(
          { error: `Phone ${norm.e164} already belongs to another contact` },
          { status: 409 }
        );
      }
      contact.phone_e164 = norm.e164;
    }

    if (body?.custom) {
      const wsDefs = state.custom_field_defs.filter(
        (d) => d.workspace_id === ctx.workspace.id
      );
      const check = validateCustomFields('contact', body.custom, wsDefs, { partial: true });
      if (!check.valid) {
        return NextResponse.json(
          { error: 'Custom field validation failed', details: check.errors },
          { status: 422 }
        );
      }
      contact.custom = { ...contact.custom, ...check.sanitized };
    }

    const now = new Date().toISOString();
    contact.updated_at = now;
    contact.last_activity_at = now;

    state.activities.unshift({
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      contact_id: contact.id,
      deal_id: null,
      type: 'system',
      actor_id: ctx.user.id,
      body: `Contact "${contact.name}" updated`,
      meta: { fields: Object.keys(body || {}) },
      created_at: now,
    });

    const event = emitDomainEvent(state, ctx.workspace.id, 'contact.updated', {
      contact_id: contact.id,
      updated_fields: Object.keys(body || {}),
    });

    saveState(state);
    return NextResponse.json({ contact, emitted_event: event });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }
  const { state, ctx } = auth;
  const contact = state.contacts.find(
    (c) => c.id === id && c.workspace_id === ctx.workspace.id && !c.deleted_at
  );
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }
  if (!canSeeRecord(ctx, contact.owner_id)) {
    return NextResponse.json({ error: 'RLS Forbidden: Not record owner' }, { status: 403 });
  }

  const now = new Date().toISOString();
  contact.deleted_at = now;
  contact.updated_at = now;

  writeAuditLog(state, {
    workspace_id: ctx.workspace.id,
    actor_id: ctx.user.id,
    action: 'contact.soft_deleted',
    entity_type: 'contact',
    entity_id: contact.id,
    meta: { restorable_until: new Date(Date.now() + 30 * 86400_000).toISOString() },
  });

  saveState(state);
  return NextResponse.json({
    deleted: true,
    soft_deleted: true,
    restorable_days: 30,
    contact_id: contact.id,
  });
}
