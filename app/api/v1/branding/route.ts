import { NextRequest, NextResponse } from 'next/server';
import { getState, resolveBranding } from '@/lib/taimoor/store';
import { checkRateLimit } from '@/lib/taimoor/rate-limit';

export async function GET(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'local';
  const rl = checkRateLimit(`branding:${ip}`, 120, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const host =
    req.nextUrl.searchParams.get('host') ||
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host');
  const workspaceId = req.nextUrl.searchParams.get('workspace_id');

  const state = getState();
  const resolved = resolveBranding(state, { host, workspaceId });

  return NextResponse.json({
    partner: {
      id: resolved.partner.id,
      name: resolved.partner.name,
      slug: resolved.partner.slug,
      is_house: resolved.partner.is_house,
    },
    workspace: resolved.workspace
      ? {
          id: resolved.workspace.id,
          name: resolved.workspace.name,
          name_ur: resolved.workspace.name_ur,
          template_key: resolved.workspace.template_key,
          locale: resolved.workspace.locale,
        }
      : null,
    matched_domain: resolved.matched_domain,
    branding: resolved.branding,
  });
}
