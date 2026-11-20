-- Every API call (no bodies, sensitive query values masked) for the developer logs page,
-- and the results of live health checks for the status page.
create table if not exists public.api_request_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  request_id text not null,
  method text not null,
  route text not null,
  path text not null,
  status int not null,
  duration_ms int not null,
  user_id uuid,
  workspace_id uuid,
  error_code text,
  ip text,
  user_agent text,
  region text
);
create index if not exists api_request_logs_at_idx on public.api_request_logs (at desc);
create index if not exists api_request_logs_status_idx on public.api_request_logs (status, at desc) where status >= 400;
create index if not exists api_request_logs_ws_idx on public.api_request_logs (workspace_id, at desc);
create index if not exists api_request_logs_user_idx on public.api_request_logs (user_id, at desc);

create table if not exists public.status_checks (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  component text not null,
  state text not null check (state in ('up', 'degraded', 'down')),
  latency_ms int
);
create index if not exists status_checks_component_at_idx on public.status_checks (component, at desc);

-- Server-only (service_role); no policies.
alter table public.api_request_logs enable row level security;
alter table public.status_checks enable row level security;
revoke all on public.api_request_logs, public.status_checks from anon, authenticated;
