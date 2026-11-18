import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { canSeeRecord, resolveActorContext } from '@/lib/taimoor/auth';
import { normalizePhoneToE164 } from '@/lib/taimoor/phone';
import { validateCustomFields } from '@/lib/taimoor/custom-fields';
import {
  emitDomainEvent,
  saveState,
  syncToSupabaseIfConfigured,
} from '@/lib/taimoor/store';

export async function GET(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }
  const { state, ctx } = auth;
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim().toLowerCase();
  const source = sp.get('source');
  const owner = sp.get('owner');
  const tag = sp.get('tag');
  const status = sp.get('status');
  const stage = sp.get('stage');
  const updatedSince = sp.get('updated_since');
  const includeDeleted = sp.get('include_deleted') === 'true';
  const cursor = sp.get('cursor');
  const limit = Math.min(Math.max(Number(sp.get('limit') || 20), 1), 100);

  let rows = state.contacts.filter((c) => {
    if (c.workspace_id !== ctx.workspace.id) return false;
    if (!includeDeleted && c.deleted_at) return false;
    if (!canSeeRecord(ctx, c.owner_id)) return false;
    if (source && c.source !== source) return false;
    if (owner && c.owner_id !== owner) return false;
    if (status && c.status !== status) return false;
    if (tag && !c.tags.includes(tag)) return false;
    if (updatedSince && c.updated_at < updatedSince) return false;
    if (stage) {
      const hasDealInStage = state.deals.some(
        (d) =>
          d.workspace_id === ctx.workspace.id &&
          d.contact_id === c.id &&
          d.stage_id === stage &&
          !d.deleted_at
      );
      if (!hasDealInStage) return false;
    }
    if (q) {
      const hay = `${c.name} ${c.phone_e164} ${c.email || ''} ${c.tags.join(' ')} ${JSON.stringify(c.custom)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  rows = rows.sort((a, b) =>
    a.updated_at === b.updated_at
      ? b.id.localeCompare(a.id)
      : b.updated_at.localeCompare(a.updated_at)
  );

  let startIndex = 0;
  if (cursor) {
    const idx = rows.findIndex((r) => r.id === cursor);
    if (idx >= 0) startIndex = idx + 1;
  }

  const page = rows.slice(startIndex, startIndex + limit);
  const nextCursor =
    startIndex + limit < rows.length && page.length > 0
      ? page[page.length - 1].id
      : null;

  return NextResponse.json({
    data: page,
    pagination: {
      limit,
      next_cursor: nextCursor,
      total_visible: rows.length,
    },
    rls_scope: {
      actor_id: ctx.user.id,
      effective_role: ctx.effectiveRole,
      owner_filtered: ctx.effectiveRole === 'agent',
    },
  });
}

export async function POST(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }

  try {
    const body = await req.json();
    const { state, ctx } = auth;

    const name = String(body?.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Contact name is required' }, { status: 400 });
    }

    const phoneNorm = normalizePhoneToE164(body?.phone || body?.phone_e164);
    if (!phoneNorm.valid || !phoneNorm.e164) {
      return NextResponse.json(
        { error: phoneNorm.error || 'Invalid phone number' },
        { status: 400 }
      );
    }

    // Duplicate check on (workspace_id, phone_e164)
    const duplicate = state.contacts.find(
      (c) =>
        c.workspace_id === ctx.workspace.id &&
        c.phone_e164 === phoneNorm.e164 &&
        !c.deleted_at
    );
    if (duplicate) {
      return NextResponse.json(
        {
          error: `Duplicate contact phone ${phoneNorm.e164} already exists in workspace`,
          duplicate_contact_id: duplicate.id,
        },
        { status: 409 }
      );
    }

    let altPhoneE164: string | null = null;
    if (body?.alt_phone) {
      const altNorm = normalizePhoneToE164(body.alt_phone);
      if (!altNorm.valid) {
        return NextResponse.json({ error: `alt_phone: ${altNorm.error}` }, { status: 400 });
      }
      altPhoneE164 = altNorm.e164;
    }

    const wsDefs = state.custom_field_defs.filter((d) => d.workspace_id === ctx.workspace.id);
    const customCheck = validateCustomFields('contact', body?.custom, wsDefs);
    if (!customCheck.valid) {
      return NextResponse.json(
        { error: 'Custom field validation failed', details: customCheck.errors },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    const ownerId =
      ctx.effectiveRole === 'agent'
        ? ctx.user.id
        : String(body?.owner_id || ctx.user.id);

    const contact = {
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      name,
      phone_e164: phoneNorm.e164,
      alt_phone: altPhoneE164,
      email: body?.email ? String(body.email).trim() : null,
      company_id: body?.company_id ? String(body.company_id) : null,
      source: String(body?.source || 'manual'),
      owner_id: ownerId,
      status: String(body?.status || 'new'),
      tags: Array.isArray(body?.tags) ? body.tags.map(String) : [],
      custom: customCheck.sanitized,
      last_activity_at: now,
      updated_at: now,
      created_at: now,
      deleted_at: null,
    };

    state.contacts.push(contact);
    state.activities.unshift({
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      contact_id: contact.id,
      deal_id: null,
      type: 'system',
      actor_id: ctx.user.id,
      body: `Contact "${contact.name}" created (${contact.phone_e164})`,
      meta: { source: contact.source },
      created_at: now,
    });

    const event = emitDomainEvent(state, ctx.workspace.id, 'contact.created', {
      contact_id: contact.id,
      phone_e164: contact.phone_e164,
      owner_id: contact.owner_id,
      source: contact.source,
    });

    saveState(state);
    await syncToSupabaseIfConfigured('contacts', contact as unknown as Record<string, unknown>);

    return NextResponse.json({ contact, emitted_event: event }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
