import { NextRequest, NextResponse } from 'next/server';
import { canSeeRecord, resolveActorContext } from '@/lib/taimoor/auth';

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
  const contact = state.contacts.find(
    (c) => c.id === id && c.workspace_id === ctx.workspace.id
  );
  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  }
  if (!canSeeRecord(ctx, contact.owner_id)) {
    return NextResponse.json({ error: 'RLS Forbidden' }, { status: 403 });
  }

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get('limit') || 25), 1), 100);
  const cursor = req.nextUrl.searchParams.get('cursor');

  const items = state.activities
    .filter((a) => a.workspace_id === ctx.workspace.id && a.contact_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  let start = 0;
  if (cursor) {
    const idx = items.findIndex((i) => i.id === cursor);
    if (idx >= 0) start = idx + 1;
  }
  const page = items.slice(start, start + limit);
  const nextCursor =
    start + limit < items.length && page.length > 0 ? page[page.length - 1].id : null;

  return NextResponse.json({
    data: page,
    pagination: { limit, next_cursor: nextCursor, total: items.length },
  });
}
