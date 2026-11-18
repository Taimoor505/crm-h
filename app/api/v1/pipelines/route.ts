import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireManagerOrOwner, resolveActorContext } from '@/lib/taimoor/auth';
import { saveState } from '@/lib/taimoor/store';

export async function GET(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }
  const { state, ctx } = auth;

  const pipelines = state.pipelines
    .filter((p) => p.workspace_id === ctx.workspace.id)
    .sort((a, b) => a.position - b.position)
    .map((p) => ({
      ...p,
      stages: state.stages
        .filter((s) => s.pipeline_id === p.id)
        .sort((a, b) => a.position - b.position),
    }));

  return NextResponse.json({ data: pipelines });
}

export async function POST(req: NextRequest) {
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
    const name = String(body?.name || '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Pipeline name is required' }, { status: 400 });
    }

    const { state, ctx } = auth;
    const pos =
      state.pipelines
        .filter((p) => p.workspace_id === ctx.workspace.id)
        .reduce((max, p) => Math.max(max, p.position), 0) + 1;

    const pipeline = {
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      name,
      position: pos,
      created_at: new Date().toISOString(),
    };
    state.pipelines.push(pipeline);
    saveState(state);

    return NextResponse.json({ pipeline }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
