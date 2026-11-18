import React from 'react';
import {
  getDbConnectionStatus,
  getState,
  resolveBranding,
  WORKSPACE_IDS,
} from '@/lib/taimoor/store';
import { CORE_SCHEMA_TABLES, MIGRATION_SQL_SNIPPETS } from '@/lib/taimoor/sql-pack';
import { OPENAPI_ENDPOINTS } from '@/lib/taimoor/openapi';
import WorkbenchShell from '@/components/workbench/WorkbenchShell';
import { InspectorPayload, ResolvedBrandingResponse } from '@/components/workbench/types';
import { notFound } from 'next/navigation';
import { isDevToolsEnabled } from '@/lib/dev-tools';

export const dynamic = 'force-dynamic';

export default function WorkbenchPage() {
  // Development only. Super-admin access needs `is_super_admin` from /me
  // (see docs/frontend-endpoint-map.md); until then NEXT_PUBLIC_ENABLE_DEV_TOOLS=true opens it.
  if (!isDevToolsEnabled()) notFound();

  const state = getState();
  const defaultWsId = state.workspaces[0]?.id || WORKSPACE_IDS.REAL_ESTATE;
  const dbStatus = getDbConnectionStatus();

  const initialData: InspectorPayload = {
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
      workspace_id: defaultWsId,
      custom_fields: state.custom_field_defs.filter((f) => f.workspace_id === defaultWsId),
      pipelines: state.pipelines.filter((p) => p.workspace_id === defaultWsId),
      stages: state.stages.filter((s) => s.workspace_id === defaultWsId),
      contacts: state.contacts.filter((c) => c.workspace_id === defaultWsId && !c.deleted_at),
      deals: state.deals.filter((d) => d.workspace_id === defaultWsId && !d.deleted_at),
      conversations: state.conversations
        .filter((cv) => cv.workspace_id === defaultWsId)
        .map((cv) => ({
          ...cv,
          contact: state.contacts.find((c) => c.id === cv.contact_id) || null,
          messages: state.messages.filter((m) => m.conversation_id === cv.id),
        })),
      whatsapp_accounts: state.whatsapp_accounts
        .filter((wa) => wa.workspace_id === defaultWsId)
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
      imports: state.imports.filter((i) => i.workspace_id === defaultWsId),
      activities: state.activities
        .filter((a) => a.workspace_id === defaultWsId)
        .slice(0, 30),
    },
    domain_events: state.domain_events.slice(0, 40),
    audit_logs: state.audit_logs.slice(0, 40),
  };

  const resolved = resolveBranding(state, { workspaceId: defaultWsId });
  const initialBranding: ResolvedBrandingResponse = {
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
  };

  return (
    <WorkbenchShell initialData={initialData} initialBranding={initialBranding} />
  );
}
