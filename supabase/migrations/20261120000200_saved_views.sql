-- Saved lead views ("My hot leads", "Unassigned this week", ...). Personal by
-- default; owners/managers can share a view with the whole workspace.
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  filters jsonb not null default '{}'::jsonb,
  shared boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists saved_views_ws_user_idx on public.saved_views (workspace_id, user_id);

alter table public.saved_views enable row level security;

-- Read: your own views, plus views shared in workspaces you belong to.
create policy saved_views_read on public.saved_views for select to authenticated
  using (user_id = (select auth.uid()) or (shared and public.is_workspace_member(workspace_id)));
-- Write: only your own views, in workspaces you belong to.
create policy saved_views_write on public.saved_views for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_workspace_member(workspace_id));
