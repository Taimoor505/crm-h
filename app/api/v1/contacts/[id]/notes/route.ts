import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { canSeeRecord, resolveActorContext } from '@/lib/taimoor/auth';
import { saveState } from '@/lib/taimoor/store';

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
    const noteBody = String(body?.body || '').trim();
    if (!noteBody) {
      return NextResponse.json({ error: 'Note body is required' }, { status: 400 });
    }

    const { state, ctx } = auth;
    const contact = state.contacts.find(
      (c) => c.id === id && c.workspace_id === ctx.workspace.id && !c.deleted_at
    );
    if (!contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    if (!canSeeRecord(ctx, contact.owner_id)) {
      return NextResponse.json({ error: 'RLS Forbidden' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const activity = {
      id: crypto.randomUUID(),
      workspace_id: ctx.workspace.id,
      contact_id: contact.id,
      deal_id: body?.deal_id ? String(body.deal_id) : null,
      type: 'note' as const,
      actor_id: ctx.user.id,
      body: noteBody,
      meta: {},
      created_at: now,
    };

    state.activities.unshift(activity);
    contact.last_activity_at = now;
    contact.updated_at = now;
    saveState(state);

    return NextResponse.json({ activity }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
