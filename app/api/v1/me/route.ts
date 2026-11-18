import { NextRequest, NextResponse } from 'next/server';
import { resolveActorContext } from '@/lib/taimoor/auth';

export async function GET(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }

  const { state, ctx } = auth;
  const memberships = state.memberships
    .filter((m) => m.user_id === ctx.user.id && m.status === 'active')
    .map((m) => {
      const ws = state.workspaces.find((w) => w.id === m.workspace_id);
      return {
        ...m,
        workspace_name: ws?.name || null,
        template_key: ws?.template_key || null,
      };
    });

  return NextResponse.json({
    user: ctx.user,
    active_workspace: ctx.workspace,
    effective_role: ctx.effectiveRole,
    memberships,
  });
}
