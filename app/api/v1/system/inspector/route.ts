import { NextRequest, NextResponse } from 'next/server';
import { getDbConnectionStatus, getState, resetSeedState } from '@/lib/taimoor/store';
import { CORE_SCHEMA_TABLES, MIGRATION_SQL_SNIPPETS } from '@/lib/taimoor/sql-pack';
import { OPENAPI_ENDPOINTS } from '@/lib/taimoor/openapi';

export async function GET(req: NextRequest) {
  const state = getState();
  const workspaceId = req.nextUrl.searchParams.get('workspace_id') || state.workspaces[0]?.id;
  const dbStatus = getDbConnectionStatus();

  return NextResponse.json({
    db_status: dbStatus,
    partners: state.partners,
    partner_domains: state.partner_domains,
    workspaces: state.workspaces,
    users: state.users,
    memberships: state.memberships,
    industry_templates: state.industry_templates,
    schema_tables: CORE_SCHEMA_TABLES,
    migration_snippets: MIGRATION_SQL_SNIPPETS,
    endpoints: OPENAPI_ENDPOINTS,
    active_workspace_snapshot: {
      workspace_id: workspaceId,
      custom_fields: state.custom_field_defs.filter((f) => f.workspace_id === workspaceId),
      pipelines: state.pipelines.filter((p) => p.workspace_id === workspaceId),
      stages: state.stages.filter((s) => s.workspace_id === workspaceId),
      contacts: state.contacts.filter((c) => c.workspace_id === workspaceId && !c.deleted_at),
      deals: state.deals.filter((d) => d.workspace_id === workspaceId && !d.deleted_at),
      conversations: state.conversations
        .filter((cv) => cv.workspace_id === workspaceId)
        .map((cv) => ({
          ...cv,
          contact: state.contacts.find((c) => c.id === cv.contact_id) || null,
          messages: state.messages.filter((m) => m.conversation_id === cv.id),
        })),
      whatsapp_accounts: state.whatsapp_accounts
        .filter((wa) => wa.workspace_id === workspaceId)
        .map((wa) => ({
          id: wa.id,
          workspace_id: wa.workspace_id,
          phone_number_id: wa.phone_number_id,
          waba_id: wa.waba_id,
          token_ref: wa.token_ref,
          token_encrypted_preview: `${wa.token_ciphertext.slice(0, 22)}...`,
          status: wa.status,
          template_messages_sent: wa.template_messages_sent,
        })),
      imports: state.imports.filter((i) => i.workspace_id === workspaceId),
      activities: state.activities
        .filter((a) => a.workspace_id === workspaceId)
        .slice(0, 30),
    },
    domain_events: state.domain_events.slice(0, 40),
    audit_logs: state.audit_logs.slice(0, 40),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.action === 'reset_seed') {
    const fresh = resetSeedState();
    return NextResponse.json({ ok: true, workspaces: fresh.workspaces.length });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
