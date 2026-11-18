import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getState, saveState, USER_IDS } from '@/lib/taimoor/store';

export async function POST(req: NextRequest) {
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
    const domain = String(body?.domain || '').trim().toLowerCase();
    if (!domain || !domain.includes('.')) {
      return NextResponse.json({ error: 'Valid custom domain is required' }, { status: 400 });
    }
    if (state.partner_domains.some((d) => d.domain.toLowerCase() === domain)) {
      return NextResponse.json({ error: 'Domain already registered' }, { status: 409 });
    }

    const record = {
      id: crypto.randomUUID(),
      partner_id: partner.id,
      domain,
      verified: true,
      created_at: new Date().toISOString(),
    };
    state.partner_domains.push(record);
    saveState(state);
    return NextResponse.json({ partner_domain: record }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
