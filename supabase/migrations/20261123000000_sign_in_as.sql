-- =============================================================================
-- "Sign in as": a workspace owner works as one of their managers or agents.
--
-- The owner keeps their own Supabase session. Each API request carries the
-- session id below (header x-sign-in-as); server/http.ts checks it and runs the
-- request as the teammate, so RLS applies exactly as it would for them.
-- Only the server writes these rows (service_role); owners can read them.
-- =============================================================================

create table if not exists public.sign_in_as_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  ended_at timestamptz,
  end_reason text check (end_reason in ('returned', 'expired', 'replaced')),
  ip text,
  user_agent text,
  check (owner_id <> target_user_id)
);

create index if not exists sign_in_as_sessions_owner_idx on public.sign_in_as_sessions (owner_id, workspace_id) where ended_at is null;
create index if not exists sign_in_as_sessions_ws_idx on public.sign_in_as_sessions (workspace_id, started_at desc);

alter table public.sign_in_as_sessions enable row level security;

drop policy if exists sign_in_as_sessions_owner_read on public.sign_in_as_sessions;
create policy sign_in_as_sessions_owner_read on public.sign_in_as_sessions
  for select to authenticated using (public.workspace_role(workspace_id) = 'owner');

revoke insert, update, delete on public.sign_in_as_sessions from anon, authenticated;
grant select on public.sign_in_as_sessions to authenticated;
grant all on public.sign_in_as_sessions to service_role;

-- Timeline attribution: while signed in as someone, the server sets
-- app.signed_in_as_by for the transaction, and every activity written in it
-- records the owner who really did it (meta.signed_in_as_by).
create or replace function public.tag_signed_in_as() returns trigger
language plpgsql set search_path = '' as $$
declare
  by_id text := nullif(current_setting('app.signed_in_as_by', true), '');
begin
  if by_id is not null then
    new.meta := coalesce(new.meta, '{}'::jsonb) || jsonb_build_object('signed_in_as_by', by_id);
  end if;
  return new;
end
$$;

revoke execute on function public.tag_signed_in_as() from public, anon, authenticated;

drop trigger if exists activities_tag_signed_in_as on public.activities;
create trigger activities_tag_signed_in_as
  before insert on public.activities
  for each row execute function public.tag_signed_in_as();

-- API request log: who was really acting.
alter table public.api_request_logs add column if not exists signed_in_as_by uuid;
