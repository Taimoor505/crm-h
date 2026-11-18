import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getState, saveState, USER_IDS, writeAuditLog } from '@/lib/taimoor/store';

function getPartnerAdminActor(req: NextRequest) {
  const state = getState();
  const userId = req.headers.get('x-sandbox-user-id') || USER_IDS.PARTNER_ADMIN;
  const user = state.users.find((u) => u.id === userId);
  if (!user || !user.partner_admin_of) {
    return { ok: false as const, status: 403, error: 'Forbidden: Partner Admin role required' };
  }
  const partner = state.partners.find((p) => p.id === user.partner_admin_of);
  if (!partner) {
    return { ok: false as const, status: 404, error: 'Partner not found' };
  }
  return { ok: true as const, state, user, partner };
}

export async function GET(req: NextRequest) {
  const res = getPartnerAdminActor(req);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }
  const workspaces = res.state.workspaces.filter((w) => w.partner_id === res.partner.id);
  const domains = res.state.partner_domains.filter((d) => d.partner_id === res.partner.id);
  return NextResponse.json({
    partner: res.partner,
    domains,
    workspaces,
  });
}

export async function POST(req: NextRequest) {
  const res = getPartnerAdminActor(req);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }
  try {
    const body = await req.json();
    const name = String(body?.name || '').trim();
    const templateKey = String(body?.template_key || 'general');
    if (!name) {
      return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 });
    }
    const tpl = res.state.industry_templates.find((t) => t.key === templateKey);
    if (!tpl) {
      return NextResponse.json({ error: 'Invalid template_key' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const ws = {
      id: crypto.randomUUID(),
      partner_id: res.partner.id,
      name,
      industry_template_id: tpl.id,
      template_key: tpl.key,
      branding: body?.branding || {},
      locale: (body?.locale === 'ur' ? 'ur' : 'en') as 'en' | 'ur',
      timezone: 'Asia/Karachi',
      status: 'active' as const,
      created_at: now,
    };
    res.state.workspaces.push(ws);
    writeAuditLog(res.state, {
      workspace_id: ws.id,
      actor_id: res.user.id,
      action: 'partner.workspace_provisioned',
      entity_type: 'workspace',
      entity_id: ws.id,
      meta: { partner_id: res.partner.id },
    });
    saveState(res.state);
    return NextResponse.json({ workspace: ws }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}
