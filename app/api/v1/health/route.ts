import { NextResponse } from 'next/server';
import { getDbConnectionStatus, getState } from '@/lib/taimoor/store';

export async function GET() {
  const dbStatus = getDbConnectionStatus();
  const state = getState();
  return NextResponse.json({
    ok: true,
    version: 'v1',
    persistence: dbStatus.mode,
    supabase_configured: dbStatus.supabaseConfigured,
    direct_pg_configured: dbStatus.directPgConfigured,
    counts: {
      partners: state.partners.length,
      workspaces: state.workspaces.length,
      templates: state.industry_templates.length,
      contacts: state.contacts.filter((c) => !c.deleted_at).length,
      deals: state.deals.filter((d) => !d.deleted_at).length,
      domain_events: state.domain_events.length,
    },
  });
}
