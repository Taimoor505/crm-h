-- =============================================================================
-- Lead assignment (Huzaifa)
-- =============================================================================

create table public.assignment_rules (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  mode text not null default 'manual' check (mode in ('manual', 'round_robin', 'by_source')),
  -- Round-robin pool, in rotation order.
  agent_ids uuid[] not null default '{}',
  -- by_source: { "<source_label or lead_source_id>": ["<user_id>", ...] }.
  -- Several users for one source rotate among themselves.
  source_map jsonb not null default '{}',
  -- by_source with no matching entry: rotate through agent_ids, or leave unassigned.
  fallback text not null default 'round_robin' check (fallback in ('round_robin', 'unassigned')),
  -- Reassign a new lead nobody has touched after N minutes. NULL = off (default).
  reassign_after_minutes int check (reassign_after_minutes between 5 and 1440),
  max_auto_reassigns int not null default 2 check (max_auto_reassigns between 1 and 10),
  -- Last user picked per rotation key, so rotation survives restarts.
  rr_state jsonb not null default '{}',
  updated_by uuid references public.users (id),
  updated_at timestamptz not null default now()
);

create table public.agent_availability (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  available boolean not null default true,
  updated_by uuid references public.users (id),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

alter table public.assignment_rules enable row level security;
alter table public.agent_availability enable row level security;

create policy assignment_rules_member_read on public.assignment_rules for select
  using (public.is_workspace_member(workspace_id));
create policy assignment_rules_manager_write on public.assignment_rules for all
  using (public.is_workspace_manager(workspace_id))
  with check (public.is_workspace_manager(workspace_id));

create policy agent_availability_member_read on public.agent_availability for select
  using (public.is_workspace_member(workspace_id));
-- Agents toggle their own availability; managers can toggle anyone's.
create policy agent_availability_write on public.agent_availability for all
  using (public.is_workspace_member(workspace_id)
         and (user_id = auth.uid() or public.is_workspace_manager(workspace_id)))
  with check (public.is_workspace_member(workspace_id)
              and (user_id = auth.uid() or public.is_workspace_manager(workspace_id)));

grant select, insert, update, delete on public.assignment_rules, public.agent_availability
  to authenticated, service_role;
