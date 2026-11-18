import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { canSeeRecord, resolveActorContext } from '@/lib/taimoor/auth';
import { emitDomainEvent, saveState } from '@/lib/taimoor/store';

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
    const targetStageId = String(body?.stage_id || '');
    if (!targetStageId) {
      return NextResponse.json({ error: 'stage_id is required' }, { status: 400 });
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

    const targetStage = state.stages.find(
      (s) => s.id === targetStageId && s.workspace_id === ctx.workspace.id
    );
    if (!targetStage) {
      return NextResponse.json({ error: 'Target stage not found in workspace' }, { status: 404 });
    }

    const prevStage = state.stages.find((s) => s.id === deal.stage_id);
    const now = new Date().toISOString();

    deal.stage_id = targetStage.id;
    deal.pipeline_id = targetStage.pipeline_id;
    deal.stage_entered_at = now;
    deal.updated_at = now;
    if (targetStage.kind === 'lost' && body?.lost_reason) {
      deal.lost_reason = String(body.lost_reason);
    }

    state.activities.unshift({
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      contact_id: deal.contact_id,
      deal_id: deal.id,
      type: 'stage_change',
      actor_id: ctx.user.id,
      body: `Moved deal "${deal.title}" from "${prevStage?.name || 'Unknown'}" to "${targetStage.name}"`,
      meta: {
        from_stage_id: prevStage?.id || null,
        to_stage_id: targetStage.id,
        kind: targetStage.kind,
      },
      created_at: now,
    });

    const emittedEvents = [
      emitDomainEvent(state, ctx.workspace.id, 'deal.stage_changed', {
        deal_id: deal.id,
        from_stage_id: prevStage?.id || null,
        to_stage_id: targetStage.id,
        stage_kind: targetStage.kind,
      }),
    ];

    if (targetStage.kind === 'won') {
      emittedEvents.push(
        emitDomainEvent(state, ctx.workspace.id, 'deal.won', {
          deal_id: deal.id,
          value_pkr: deal.value_pkr,
        })
      );
    } else if (targetStage.kind === 'lost') {
      emittedEvents.push(
        emitDomainEvent(state, ctx.workspace.id, 'deal.lost', {
          deal_id: deal.id,
          lost_reason: deal.lost_reason,
        })
      );
    }

    saveState(state);
    return NextResponse.json({ deal, emitted_events: emittedEvents });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
