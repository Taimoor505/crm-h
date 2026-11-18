-- =============================================================================
-- Preset automations (Huzaifa, weeks 9-10)
-- A fixed catalog of rules (server/automations/catalog.ts) with an on/off
-- toggle and a few settings each. Every run is logged in automation_runs so
-- support can answer "why did this message go out?".
-- =============================================================================

create table public.automations (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  key text not null,
  enabled boolean not null default false,
  settings jsonb not null default '{}',
  updated_by uuid references public.users (id),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, key)
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  automation_key text not null,
  trigger_event text not null,             -- lead.received, call.logged, deal.won, schedule ...
  -- What fired it (job id, or deal+stage for scheduled checks). Unique per rule:
  -- a retried event can never run the same rule twice.
  trigger_ref text not null,
  contact_id uuid references public.contacts (id) on delete set null,
  deal_id uuid references public.deals (id) on delete set null,
  status text not null check (status in ('success', 'skipped', 'failed')),
  result jsonb not null default '{}',      -- e.g. { task_id }, { message_id }, { reason }
  error text,
  created_at timestamptz not null default now(),
  unique (automation_key, trigger_ref)
);
create index automation_runs_workspace_idx on public.automation_runs (workspace_id, created_at desc, id desc);
create index automation_runs_contact_idx on public.automation_runs (contact_id);

alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;

create policy automations_member_read on public.automations for select
  using (public.is_workspace_member(workspace_id));
create policy automations_manager_write on public.automations for all
  using (public.is_workspace_manager(workspace_id))
  with check (public.is_workspace_manager(workspace_id));
create policy automation_runs_manager_read on public.automation_runs for select
  using (public.is_workspace_manager(workspace_id));

revoke all on public.automations, public.automation_runs from anon, authenticated;
grant select, insert, update, delete on public.automations to authenticated;
grant select on public.automation_runs to authenticated;
grant all on public.automations, public.automation_runs to service_role;
