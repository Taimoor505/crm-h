import { NextRequest, NextResponse } from 'next/server';
import { resolveActorContext } from '@/lib/taimoor/auth';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const auth = resolveActorContext(req, id);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }

  const { state } = auth;
  const members = state.memberships
    .filter((m) => m.workspace_id === id)
    .map((m) => {
      const user = state.users.find((u) => u.id === m.user_id);
      return {
        ...m,
        user: user
          ? {
              id: user.id,
              name: user.name,
              phone: user.phone,
              email: user.email,
              locale: user.locale,
            }
          : null,
      };
    });

  return NextResponse.json({ data: members });
}
