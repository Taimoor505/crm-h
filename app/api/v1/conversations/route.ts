import { NextRequest, NextResponse } from 'next/server';
import { resolveActorContext } from '@/lib/taimoor/auth';

export async function GET(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }

  const { state, ctx } = auth;
  const rows = state.conversations
    .filter((cv) => {
      if (cv.workspace_id !== ctx.workspace.id) return false;
      if (ctx.effectiveRole === 'agent') {
        return cv.assigned_to === ctx.user.id;
      }
      return true;
    })
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
    .map((cv) => {
      const contact = state.contacts.find((c) => c.id === cv.contact_id);
      const msgs = state.messages
        .filter((m) => m.conversation_id === cv.id)
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
      return {
        ...cv,
        contact: contact
          ? {
              id: contact.id,
              name: contact.name,
              phone_e164: contact.phone_e164,
            }
          : null,
        last_message: msgs[msgs.length - 1] || null,
      };
    });

  return NextResponse.json({ data: rows });
}
