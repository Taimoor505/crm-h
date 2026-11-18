import { NextRequest, NextResponse } from 'next/server';
import { requireManagerOrOwner, resolveActorContext } from '@/lib/taimoor/auth';
import { saveState } from '@/lib/taimoor/store';

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
    const field = state.custom_field_defs.find(
      (f) => f.id === id && f.workspace_id === ctx.workspace.id
    );
    if (!field) {
      return NextResponse.json({ error: 'Custom field not found' }, { status: 404 });
    }

    if (body?.label_en !== undefined) field.label_en = String(body.label_en);
    if (body?.label_ur !== undefined) field.label_ur = String(body.label_ur);
    if (Array.isArray(body?.options)) field.options = body.options.map(String);
    if (typeof body?.required === 'boolean') field.required = body.required;
    if (typeof body?.position === 'number') field.position = body.position;
    if (typeof body?.hidden === 'boolean') field.hidden = body.hidden;

    saveState(state);
    return NextResponse.json({ custom_field: field });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
