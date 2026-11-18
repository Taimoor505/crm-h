import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireManagerOrOwner, resolveActorContext } from '@/lib/taimoor/auth';
import { saveState } from '@/lib/taimoor/store';
import { StageKind } from '@/lib/taimoor/types';

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
  const stages = state.stages
    .filter((s) => s.workspace_id === ctx.workspace.id && s.pipeline_id === id)
    .sort((a, b) => a.position - b.position);
  return NextResponse.json({ data: stages });
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
  const roleErr = requireManagerOrOwner(auth.ctx);
  if (roleErr) {
    return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });
  }

  try {
    const body = await req.json();
    const { state, ctx } = auth;
    const pipeline = state.pipelines.find(
      (p) => p.id === id && p.workspace_id === ctx.workspace.id
    );
    if (!pipeline) {
      return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
    }

    const name = String(body?.name || '').trim();
    const kind: StageKind = ['open', 'won', 'lost'].includes(body?.kind)
      ? body.kind
      : 'open';
    if (!name) {
      return NextResponse.json({ error: 'Stage name is required' }, { status: 400 });
    }

    const pos =
      state.stages
        .filter((s) => s.pipeline_id === id)
        .reduce((max, s) => Math.max(max, s.position), 0) + 1;

    const stage = {
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      pipeline_id: id,
      name,
      position: typeof body?.position === 'number' ? body.position : pos,
      kind,
    };
    state.stages.push(stage);
    saveState(state);
    return NextResponse.json({ stage }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
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
  const roleErr = requireManagerOrOwner(auth.ctx);
  if (roleErr) {
    return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });
  }

  try {
    const body = await req.json();
    const { state, ctx } = auth;
    const stageId = String(body?.stage_id || '');
    const stage = state.stages.find(
      (s) => s.id === stageId && s.pipeline_id === id && s.workspace_id === ctx.workspace.id
    );
    if (!stage) {
      return NextResponse.json({ error: 'Stage not found in pipeline' }, { status: 404 });
    }

    if (body?.name) stage.name = String(body.name);
    if (typeof body?.position === 'number') stage.position = body.position;
    if (body?.kind && ['open', 'won', 'lost'].includes(body.kind)) {
      stage.kind = body.kind;
    }

    saveState(state);
    return NextResponse.json({ stage });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
