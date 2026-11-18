import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireManagerOrOwner, resolveActorContext } from '@/lib/taimoor/auth';
import { saveState } from '@/lib/taimoor/store';
import { CustomFieldEntity, CustomFieldType } from '@/lib/taimoor/types';

export async function GET(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }
  const { state, ctx } = auth;
  const entity = req.nextUrl.searchParams.get('entity');
  const fields = state.custom_field_defs
    .filter(
      (f) =>
        f.workspace_id === ctx.workspace.id &&
        (!entity || f.entity === entity)
    )
    .sort((a, b) => a.position - b.position);

  return NextResponse.json({ data: fields });
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
    const entity = body?.entity as CustomFieldEntity;
    const key = String(body?.key || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    const labelEn = String(body?.label_en || '').trim();
    const labelUr = String(body?.label_ur || labelEn).trim();
    const type = (body?.type || 'text') as CustomFieldType;

    if (!['contact', 'deal'].includes(entity) || !key || !labelEn) {
      return NextResponse.json(
        { error: 'entity (contact|deal), key, and label_en are required' },
        { status: 400 }
      );
    }

    if (!['text', 'number', 'money', 'date', 'select', 'phone'].includes(type)) {
      return NextResponse.json({ error: 'Invalid custom field type' }, { status: 400 });
    }

    const { state, ctx } = auth;
    const duplicate = state.custom_field_defs.find(
      (f) => f.workspace_id === ctx.workspace.id && f.entity === entity && f.key === key
    );
    if (duplicate) {
      return NextResponse.json(
        { error: `Custom field "${key}" already exists on ${entity}` },
        { status: 409 }
      );
    }

    const maxPos = state.custom_field_defs
      .filter((f) => f.workspace_id === ctx.workspace.id)
      .reduce((max, f) => Math.max(max, f.position), 0);

    const field = {
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      entity,
      key,
      label_en: labelEn,
      label_ur: labelUr,
      type,
      options: Array.isArray(body?.options) ? body.options.map(String) : [],
      required: Boolean(body?.required),
      position: typeof body?.position === 'number' ? body.position : maxPos + 1,
      hidden: Boolean(body?.hidden),
      created_at: new Date().toISOString(),
    };

    state.custom_field_defs.push(field);
    saveState(state);

    return NextResponse.json({ custom_field: field }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
