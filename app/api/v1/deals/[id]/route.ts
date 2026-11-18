import { NextRequest, NextResponse } from 'next/server';
import { canSeeRecord, resolveActorContext } from '@/lib/taimoor/auth';
import { validateCustomFields } from '@/lib/taimoor/custom-fields';
import { saveState, writeAuditLog } from '@/lib/taimoor/store';

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
    const deal = state.deals.find(
      (d) => d.id === id && d.workspace_id === ctx.workspace.id && !d.deleted_at
    );
    if (!deal) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
    }
    if (!canSeeRecord(ctx, deal.owner_id)) {
      return NextResponse.json({ error: 'RLS Forbidden' }, { status: 403 });
    }

    if (body?.title !== undefined) deal.title = String(body.title).trim();
    if (body?.value_pkr !== undefined) deal.value_pkr = Math.max(0, Number(body.value_pkr));
    if (body?.expected_close !== undefined) {
      deal.expected_close = body.expected_close ? String(body.expected_close) : null;
    }
    if (body?.lost_reason !== undefined) {
      deal.lost_reason = body.lost_reason ? String(body.lost_reason) : null;
    }

    if (body?.custom) {
      const wsDefs = state.custom_field_defs.filter(
        (d) => d.workspace_id === ctx.workspace.id
      );
      const check = validateCustomFields('deal', body.custom, wsDefs, { partial: true });
      if (!check.valid) {
        return NextResponse.json(
          { error: 'Custom field validation failed', details: check.errors },
          { status: 422 }
        );
      }
      deal.custom = { ...deal.custom, ...check.sanitized };
    }

    deal.updated_at = new Date().toISOString();
    saveState(state);
    return NextResponse.json({ deal });
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
  const deal = state.deals.find(
    (d) => d.id === id && d.workspace_id === ctx.workspace.id && !d.deleted_at
  );
  if (!deal) {
    return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  }
  if (!canSeeRecord(ctx, deal.owner_id)) {
    return NextResponse.json({ error: 'RLS Forbidden' }, { status: 403 });
  }

  deal.deleted_at = new Date().toISOString();
  writeAuditLog(state, {
    workspace_id: ctx.workspace.id,
    actor_id: ctx.user.id,
    action: 'deal.soft_deleted',
    entity_type: 'deal',
    entity_id: deal.id,
    meta: { restorable_days: 30 },
  });
  saveState(state);

  return NextResponse.json({ deleted: true, soft_deleted: true, restorable_days: 30 });
}
