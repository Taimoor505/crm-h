-- =============================================================================
-- Shared job queue, scheduler log and rate limiting (Huzaifa)
--
-- The queue is a plain Postgres table worked with FOR UPDATE SKIP LOCKED, so
-- the only infrastructure is Supabase itself. Taimoor's domain events
-- (contact.created, deal.stage_changed, ...) go on queue 'events' through
-- public.enqueue_job(), which is callable from inside any user transaction so
-- an event is only queued if the write that caused it commits.
-- =============================================================================

create table public.jobs (
  id bigserial primary key,
  queue text not null default 'default',
  name text not null,
  payload jsonb not null default '{}',
  workspace_id uuid references public.workspaces (id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed', 'dead')),
  run_at timestamptz not null default now(),
  attempts int not null default 0,
  max_attempts int not null default 5,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  -- Same key twice = enqueued once. Makes producers idempotent.
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index jobs_ready_idx on public.jobs (queue, run_at, id) where status = 'queued';
create index jobs_running_idx on public.jobs (locked_at) where status = 'running';

create or replace function public.enqueue_job(
  p_name text,
  p_payload jsonb default '{}',
  p_workspace_id uuid default null,
  p_run_at timestamptz default now(),
  p_dedupe_key text default null,
  p_queue text default null
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  -- A signed-in user may only enqueue for a workspace they belong to.
  if auth.uid() is not null and p_workspace_id is not null
     and not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of workspace %', p_workspace_id using errcode = '42501';
  end if;

  insert into public.jobs (queue, name, payload, workspace_id, run_at, dedupe_key)
  values (
    coalesce(p_queue, 'default'),
    p_name, coalesce(p_payload, '{}'), p_workspace_id, coalesce(p_run_at, now()), p_dedupe_key
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- One row per (scheduled job, time window). The primary key is what makes a
-- scheduler tick idempotent: two workers racing on the same minute insert the
-- same key and only one of them runs the job.
create table public.scheduler_runs (
  job_key text not null,
  window_start timestamptz not null,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  worker text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result jsonb,
  error text,
  primary key (job_key, window_start)
);

-- Fixed-window counters for public endpoints.
create table public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket, window_start)
);

alter table public.jobs enable row level security;
alter table public.scheduler_runs enable row level security;
alter table public.rate_limits enable row level security;
-- No policies: only service_role (worker, public hooks) touches these.
revoke all on public.jobs, public.scheduler_runs, public.rate_limits from anon, authenticated;
grant all on public.jobs, public.scheduler_runs, public.rate_limits to service_role;
grant usage, select on sequence public.jobs_id_seq to service_role;
grant execute on function public.enqueue_job(text, jsonb, uuid, timestamptz, text, text)
  to authenticated, service_role;
