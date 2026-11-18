import { NextRequest, NextResponse } from 'next/server';
import { getState, saveState, USER_IDS } from '@/lib/taimoor/store';

export async function PATCH(req: NextRequest) {
  const state = getState();
  const userId = req.headers.get('x-sandbox-user-id') || USER_IDS.PARTNER_ADMIN;
  const user = state.users.find((u) => u.id === userId);
  if (!user || !user.partner_admin_of) {
    return NextResponse.json({ error: 'Forbidden: Partner Admin role required' }, { status: 403 });
  }
  const partner = state.partners.find((p) => p.id === user.partner_admin_of);
  if (!partner) {
    return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    partner.default_branding = {
      ...partner.default_branding,
      ...(body || {}),
    };
    saveState(state);
    return NextResponse.json({ partner });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
