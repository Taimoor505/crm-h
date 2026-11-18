-- =============================================================================
-- Bridge between Taimoor's core schema (001-003) and Huzaifa's migrations.
-- Runs after 003_indexes_and_triggers.sql. Every change to a core table is
-- listed in docs/for-taimoor.md so Taimoor can fold it into his migrations.
-- =============================================================================

-- 1. Taimoor's RLS policies call functions in schema `app`. Supabase does not
--    grant a custom schema to API roles, so without this every policy that
--    calls app.* fails with "permission denied for schema app".
grant usage on schema app to authenticated, service_role;
grant execute on all functions in schema app to authenticated, service_role;

-- 2. The helper names my policies use, delegating to Taimoor's so there is one
--    definition of membership (partner admins count as managers, as in his).
create or replace function public.is_workspace_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_workspace_member(ws)
$$;

create or replace function public.is_workspace_manager(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_manager_or_owner(ws)
$$;

create or replace function public.workspace_role(ws uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select m.role from public.memberships m
      where m.workspace_id = ws and m.user_id = app.current_user_id() and m.status = 'active'),
    (select 'manager' from public.workspaces w join public.users u on u.id = app.current_user_id()
      where w.id = ws and u.partner_admin_of = w.partner_id))
$$;

grant execute on function public.is_workspace_member(uuid), public.is_workspace_manager(uuid),
  public.workspace_role(uuid) to authenticated, service_role;

-- 3. Billing makes unpaid workspaces read-only, then archived (data kept).
alter table public.workspaces drop constraint if exists workspaces_status_check;
alter table public.workspaces add constraint workspaces_status_check
  check (status in ('active', 'read_only', 'archived', 'suspended'));

-- 4. A new lead can be unassigned (manual assignment mode, or nobody
--    available): managers are alerted and assign it. Managers still see every
--    contact under Taimoor's RLS; agents only see their own.
alter table public.contacts alter column owner_id drop not null;

-- 5. Taimoor's 002 has read policies only on activities. Assignments, task
--    events and notes written by signed-in users need an insert policy.
drop policy if exists activities_member_insert on public.activities;
create policy activities_member_insert on public.activities for insert
  with check (app.is_workspace_member(workspace_id) and actor_id = app.current_user_id());
