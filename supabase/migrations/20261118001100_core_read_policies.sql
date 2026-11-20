-- =============================================================================
-- Read policies for core tables that Taimoor's 002 leaves without RLS.
--
-- New Supabase projects can enable RLS on every new table automatically. With
-- RLS on and no policy, signed-in users read nothing from users / partners,
-- which empties team lists (assignment rules, reports, notification settings).
-- This enables RLS explicitly and adds read policies, so the result is the
-- same whether or not the project auto-enables RLS. Writes stay server-side.
-- =============================================================================

alter table public.users enable row level security;
alter table public.partners enable row level security;
alter table public.partner_domains enable row level security;
alter table public.industry_templates enable row level security;

-- Yourself, and anyone who shares a workspace with you (partner admins see
-- the people in their client workspaces, via app.is_workspace_member).
drop policy if exists users_self_or_colleague_read on public.users;
create policy users_self_or_colleague_read on public.users for select
  using (
    id = app.current_user_id()
    or exists (select 1 from public.memberships m
                where m.user_id = users.id and m.status = 'active'
                  and app.is_workspace_member(m.workspace_id))
  );

-- A partner is visible to its own admins and to members of its workspaces.
drop policy if exists partners_member_read on public.partners;
create policy partners_member_read on public.partners for select
  using (
    exists (select 1 from public.users u where u.id = app.current_user_id() and u.partner_admin_of = partners.id)
    or exists (select 1 from public.workspaces w where w.partner_id = partners.id and app.is_workspace_member(w.id))
  );

-- Industry templates are the same for everyone.
drop policy if exists industry_templates_read on public.industry_templates;
create policy industry_templates_read on public.industry_templates for select to authenticated
  using (true);

-- partner_domains: no client policy; branding is resolved server-side.

grant select on public.users, public.partners, public.industry_templates to authenticated;
