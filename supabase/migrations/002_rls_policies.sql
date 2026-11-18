-- Taimoor Core: 002_rls_policies.sql
-- Multi-Tenant & Role-Based Row-Level Security Policies

CREATE SCHEMA IF NOT EXISTS app;

-- Session helper functions (compatible with Supabase JWT claims or SET LOCAL transaction context)
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS UUID AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.user_id', true), '')::uuid,
    auth.uid()
  );
$$ LANGUAGE SQL STABLE;

CREATE OR REPLACE FUNCTION app.is_workspace_member(ws_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.workspace_id = ws_id
      AND m.user_id = app.current_user_id()
      AND m.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.workspaces w
    JOIN public.users u ON u.id = app.current_user_id()
    WHERE w.id = ws_id
      AND u.partner_admin_of = w.partner_id
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION app.is_manager_or_owner(ws_id UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.workspace_id = ws_id
      AND m.user_id = app.current_user_id()
      AND m.status = 'active'
      AND m.role IN ('owner', 'manager')
  )
  OR EXISTS (
    SELECT 1 FROM public.workspaces w
    JOIN public.users u ON u.id = app.current_user_id()
    WHERE w.id = ws_id
      AND u.partner_admin_of = w.partner_id
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Enable RLS on every workspace-scoped table
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Workspace & Membership Visibility
CREATE POLICY workspaces_member_read ON public.workspaces
  FOR SELECT USING (app.is_workspace_member(id));

CREATE POLICY memberships_workspace_read ON public.memberships
  FOR SELECT USING (app.is_workspace_member(workspace_id));

-- Contacts: Agents see ONLY owner_id = current_user_id; Managers/Owners/Partner Admins see all workspace contacts
CREATE POLICY contacts_role_read ON public.contacts
  FOR SELECT USING (
    deleted_at IS NULL
    AND app.is_workspace_member(workspace_id)
    AND (
      app.is_manager_or_owner(workspace_id)
      OR owner_id = app.current_user_id()
    )
  );

CREATE POLICY contacts_role_write ON public.contacts
  FOR ALL USING (
    app.is_workspace_member(workspace_id)
    AND (
      app.is_manager_or_owner(workspace_id)
      OR owner_id = app.current_user_id()
    )
  );

-- Deals: Same Agent vs Manager/Owner isolation
CREATE POLICY deals_role_read ON public.deals
  FOR SELECT USING (
    deleted_at IS NULL
    AND app.is_workspace_member(workspace_id)
    AND (
      app.is_manager_or_owner(workspace_id)
      OR owner_id = app.current_user_id()
    )
  );

-- Shared Workspace Reference Tables (Custom Fields, Pipelines, Stages, Companies, Activities, Conversations, Imports)
CREATE POLICY custom_fields_read ON public.custom_field_defs FOR SELECT USING (app.is_workspace_member(workspace_id));
CREATE POLICY companies_read ON public.companies FOR SELECT USING (app.is_workspace_member(workspace_id));
CREATE POLICY pipelines_read ON public.pipelines FOR SELECT USING (app.is_workspace_member(workspace_id));
CREATE POLICY stages_read ON public.stages FOR SELECT USING (app.is_workspace_member(workspace_id));
CREATE POLICY activities_read ON public.activities FOR SELECT USING (app.is_workspace_member(workspace_id));
CREATE POLICY whatsapp_accounts_admin_read ON public.whatsapp_accounts FOR SELECT USING (app.is_manager_or_owner(workspace_id));
CREATE POLICY conversations_read ON public.conversations FOR SELECT USING (
  app.is_workspace_member(workspace_id)
  AND (app.is_manager_or_owner(workspace_id) OR assigned_to = app.current_user_id())
);
CREATE POLICY messages_read ON public.messages FOR SELECT USING (app.is_workspace_member(workspace_id));
CREATE POLICY imports_read ON public.imports FOR SELECT USING (app.is_workspace_member(workspace_id));
CREATE POLICY domain_events_read ON public.domain_events FOR SELECT USING (app.is_manager_or_owner(workspace_id));
CREATE POLICY audit_logs_read ON public.audit_logs FOR SELECT USING (
  workspace_id IS NOT NULL AND app.is_manager_or_owner(workspace_id)
);
