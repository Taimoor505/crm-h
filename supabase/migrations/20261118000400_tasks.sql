-- =============================================================================
-- Tasks and follow-ups (Huzaifa)
-- =============================================================================

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  assigned_to uuid not null references public.users (id),
  created_by uuid references public.users (id),
  type text not null check (type in ('call', 'whatsapp', 'meeting', 'site_visit', 'other')),
  title text not null,
  notes text,
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  completed_at timestamptz,
  completed_by uuid references public.users (id),
  outcome text,
  -- Where the task came from, so "why do I have this task?" is answerable.
  origin text not null default 'manual'
    check (origin in ('manual', 'call_outcome', 'task_completion', 'automation')),
  parent_task_id uuid references public.tasks (id) on delete set null,
  -- Scheduler bookkeeping (reminders / overdue digests, weeks 6-8).
  reminder_sent_at timestamptz,
  overdue_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_completed_consistent check ((status = 'done') = (completed_at is not null))
);
create index tasks_assignee_open_idx on public.tasks (workspace_id, assigned_to, due_at)
  where status = 'open';
create index tasks_workspace_due_idx on public.tasks (workspace_id, due_at, id);
create index tasks_contact_idx on public.tasks (contact_id);
create index tasks_due_open_idx on public.tasks (due_at) where status = 'open';

alter table public.tasks enable row level security;

-- Agents see tasks assigned to them or that they created; managers see all.
create policy tasks_read on public.tasks for select
  using (
    public.is_workspace_member(workspace_id)
    and (public.is_workspace_manager(workspace_id)
         or assigned_to = auth.uid() or created_by = auth.uid())
  );

-- Agents may only create tasks for themselves, on contacts they can see.
create policy tasks_insert on public.tasks for insert
  with check (
    public.is_workspace_member(workspace_id)
    and created_by = auth.uid()
    and (public.is_workspace_manager(workspace_id) or assigned_to = auth.uid())
    and (contact_id is null or exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.workspace_id = tasks.workspace_id))
  );

create policy tasks_update on public.tasks for update
  using (
    public.is_workspace_member(workspace_id)
    and (public.is_workspace_manager(workspace_id) or assigned_to = auth.uid())
  )
  with check (
    public.is_workspace_member(workspace_id)
    and (public.is_workspace_manager(workspace_id) or assigned_to = auth.uid())
  );

grant select, insert, update on public.tasks to authenticated, service_role;
grant delete on public.tasks to service_role;
