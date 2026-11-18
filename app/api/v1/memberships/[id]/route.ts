import { NextRequest, NextResponse } from 'next/server';
import { requireManagerOrOwner, resolveActorContext } from '@/lib/taimoor/auth';
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
  const roleErr = requireManagerOrOwner(auth.ctx);
  if (roleErr) {
    return NextResponse.json({ error: roleErr.error }, { status: roleErr.status });
  }

  try {
    const body = await req.json();
    const { state, ctx } = auth;
    const membership = state.memberships.find(
      (m) => m.id === id && m.workspace_id === ctx.workspace.id
    );
    if (!membership) {
      return NextResponse.json({ error: 'Membership not found in workspace' }, { status: 404 });
    }

    const prevRole = membership.role;
    const prevStatus = membership.status;

    if (body?.role && ['owner', 'manager', 'agent'].includes(body.role)) {
      membership.role = body.role;
    }
    if (body?.status && ['active', 'invited', 'suspended'].includes(body.status)) {
      membership.status = body.status;
    }

    writeAuditLog(state, {
      workspace_id: ctx.workspace.id,
      actor_id: ctx.user.id,
      action: 'membership.role_changed',
      entity_type: 'membership',
      entity_id: membership.id,
      meta: {
        before: { role: prevRole, status: prevStatus },
        after: { role: membership.role, status: membership.status },
      },
    });

    saveState(state);
    return NextResponse.json({ membership });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
