-- Google Calendar sync: one connection per user; one event per follow-up.
-- Tokens are encrypted by the API (AES-256-GCM); only the server reads them.
create table if not exists public.google_calendar_connections (
  user_id uuid primary key references public.users (id) on delete cascade,
  google_email text,
  refresh_token_ciphertext text not null,
  calendar_id text not null default 'primary',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text
);

create table if not exists public.task_calendar_events (
  task_id uuid primary key references public.tasks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  event_id text not null,
  synced_at timestamptz not null default now()
);
create index if not exists task_calendar_events_user_idx on public.task_calendar_events (user_id);

-- Server-only tables: RLS on, no policies (the API uses service_role).
alter table public.google_calendar_connections enable row level security;
alter table public.task_calendar_events enable row level security;
revoke all on public.google_calendar_connections, public.task_calendar_events from anon, authenticated;
