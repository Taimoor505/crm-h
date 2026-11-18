import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { canSeeRecord, resolveActorContext } from '@/lib/taimoor/auth';
import { validateCustomFields } from '@/lib/taimoor/custom-fields';
import { emitDomainEvent, saveState } from '@/lib/taimoor/store';

export async function GET(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }

  const { state, ctx } = auth;
  const sp = req.nextUrl.searchParams;
  const pipelineId = sp.get('pipeline_id');
  const stageId = sp.get('stage_id');
  const cursor = sp.get('cursor');
  const limit = Math.min(Math.max(Number(sp.get('limit') || 20), 1), 100);

  let rows = state.deals.filter((d) => {
    if (d.workspace_id !== ctx.workspace.id || d.deleted_at) return false;
    if (!canSeeRecord(ctx, d.owner_id)) return false;
    if (pipelineId && d.pipeline_id !== pipelineId) return false;
    if (stageId && d.stage_id !== stageId) return false;
    return true;
  });

  rows = rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  let start = 0;
  if (cursor) {
    const idx = rows.findIndex((d) => d.id === cursor);
    if (idx >= 0) start = idx + 1;
  }
  const page = rows.slice(start, start + limit);
  const nextCursor =
    start + limit < rows.length && page.length > 0 ? page[page.length - 1].id : null;

  return NextResponse.json({
    data: page,
    pagination: { limit, next_cursor: nextCursor, total_visible: rows.length },
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

    const title = String(body?.title || '').trim();
    const contactId = String(body?.contact_id || '');
    const pipelineId = String(body?.pipeline_id || '');
    const stageId = String(body?.stage_id || '');

    if (!title || !contactId) {
      return NextResponse.json(
        { error: 'title and contact_id are required' },
        { status: 400 }
      );
    }

    const contact = state.contacts.find(
      (c) => c.id === contactId && c.workspace_id === ctx.workspace.id && !c.deleted_at
    );
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found in workspace' }, { status: 404 });
    }

    const pipeline =
      state.pipelines.find(
        (p) => p.id === pipelineId && p.workspace_id === ctx.workspace.id
      ) || state.pipelines.find((p) => p.workspace_id === ctx.workspace.id);

    if (!pipeline) {
      return NextResponse.json({ error: 'No pipeline found in workspace' }, { status: 404 });
    }

    const stage =
      state.stages.find((s) => s.id === stageId && s.pipeline_id === pipeline.id) ||
      state.stages
        .filter((s) => s.pipeline_id === pipeline.id)
        .sort((a, b) => a.position - b.position)[0];

    if (!stage) {
      return NextResponse.json({ error: 'No stage found in pipeline' }, { status: 404 });
    }

    const wsDefs = state.custom_field_defs.filter(
      (d) => d.workspace_id === ctx.workspace.id
    );
    const check = validateCustomFields('deal', body?.custom, wsDefs);
    if (!check.valid) {
      return NextResponse.json(
        { error: 'Custom field validation failed', details: check.errors },
        { status: 422 }
      );
    }

    const now = new Date().toISOString();
    const ownerId =
      ctx.effectiveRole === 'agent'
        ? ctx.user.id
        : String(body?.owner_id || contact.owner_id || ctx.user.id);

    const deal = {
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      contact_id: contact.id,
      title,
      value_pkr: Math.max(0, Number(body?.value_pkr || 0)),
      owner_id: ownerId,
      expected_close: body?.expected_close ? String(body.expected_close) : null,
      lost_reason: null,
      custom: check.sanitized,
      stage_entered_at: now,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    state.deals.push(deal);
    state.activities.unshift({
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      contact_id: contact.id,
      deal_id: deal.id,
      type: 'system',
      actor_id: ctx.user.id,
      body: `Deal "${deal.title}" created in stage "${stage.name}" (PKR ${deal.value_pkr.toLocaleString('en-PK')})`,
      meta: { stage_id: stage.id, value_pkr: deal.value_pkr },
      created_at: now,
    });

    const event = emitDomainEvent(state, ctx.workspace.id, 'deal.created', {
      deal_id: deal.id,
      contact_id: contact.id,
      value_pkr: deal.value_pkr,
      stage_id: stage.id,
    });

    saveState(state);
    return NextResponse.json({ deal, emitted_event: event }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
