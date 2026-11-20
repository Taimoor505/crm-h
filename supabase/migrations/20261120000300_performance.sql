-- Performance (Supabase advisor). Same rules, evaluated once per query
-- instead of once per row: auth.uid() wrapped in (select ...).
alter policy agent_availability_write on public.agent_availability
  using (public.is_workspace_member(workspace_id) and (user_id = (select auth.uid()) or public.is_workspace_manager(workspace_id)))
  with check (public.is_workspace_member(workspace_id) and (user_id = (select auth.uid()) or public.is_workspace_manager(workspace_id)));
alter policy notifications_own_read on public.notifications using (user_id = (select auth.uid()));
alter policy notifications_own_update on public.notifications
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy tasks_read on public.tasks
  using (public.is_workspace_member(workspace_id) and (public.is_workspace_manager(workspace_id) or assigned_to = (select auth.uid()) or created_by = (select auth.uid())));
alter policy tasks_insert on public.tasks
  with check (public.is_workspace_member(workspace_id) and created_by = (select auth.uid())
              and (public.is_workspace_manager(workspace_id) or assigned_to = (select auth.uid()))
              and (contact_id is null or exists (select 1 from public.contacts c where c.id = tasks.contact_id and c.workspace_id = tasks.workspace_id)));
alter policy tasks_update on public.tasks
  using (public.is_workspace_member(workspace_id) and (public.is_workspace_manager(workspace_id) or assigned_to = (select auth.uid())))
  with check (public.is_workspace_member(workspace_id) and (public.is_workspace_manager(workspace_id) or assigned_to = (select auth.uid())));
alter policy push_subscriptions_own on public.push_subscriptions
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy notification_settings_own on public.notification_settings
  using (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));

-- Indexes for the joins and filters the API runs on every page.
create index if not exists activities_contact_created_idx on public.activities (contact_id, created_at desc);
create index if not exists contacts_owner_idx on public.contacts (workspace_id, owner_id) where deleted_at is null;
create index if not exists deals_contact_idx on public.deals (contact_id) where deleted_at is null;
create index if not exists deals_owner_idx on public.deals (workspace_id, owner_id) where deleted_at is null;
create index if not exists deals_stage_idx on public.deals (stage_id);
create index if not exists deals_pipeline_idx on public.deals (pipeline_id);
create index if not exists tasks_assigned_status_idx on public.tasks (assigned_to, status, due_at);
create index if not exists tasks_deal_idx on public.tasks (deal_id) where deal_id is not null;
create index if not exists conversations_contact_idx on public.conversations (contact_id);
create index if not exists memberships_workspace_idx on public.memberships (workspace_id, status);
create index if not exists notifications_workspace_user_idx on public.notifications (workspace_id, user_id, created_at desc);
create index if not exists stages_pipeline_idx on public.stages (pipeline_id, position);
create index if not exists pipelines_workspace_idx on public.pipelines (workspace_id, position);
create index if not exists workspaces_partner_idx on public.workspaces (partner_id);
create index if not exists users_partner_admin_idx on public.users (partner_admin_of) where partner_admin_of is not null;
create index if not exists lead_events_contact_idx on public.lead_events (contact_id) where contact_id is not null;
create index if not exists custom_field_defs_ws_idx on public.custom_field_defs (workspace_id, entity, position);
create index if not exists imports_workspace_idx on public.imports (workspace_id, created_at desc);
