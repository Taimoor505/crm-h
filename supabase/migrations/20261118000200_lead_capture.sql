-- =============================================================================
-- Lead capture (Huzaifa)
-- =============================================================================

-- Columns added to Taimoor's contacts table (agreed contract, see docs).
alter table public.contacts
  add column first_response_at timestamptz,   -- first call / WhatsApp / note by a user
  add column last_response_at timestamptz,
  add column last_enquiry_at timestamptz,     -- latest time this person enquired (new or re-enquiry)
  add column assigned_at timestamptz,         -- when owner_id was last set
  add column auto_reassign_count int not null default 0;

create index contacts_awaiting_response_idx on public.contacts (workspace_id, assigned_at)
  where first_response_at is null and deleted_at is null;

create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type text not null
    check (type in ('website_form', 'webhook', 'meta_leadgen', 'whatsapp', 'manual', 'import')),
  name text not null,
  -- Value written to contacts.source and used by "by source" assignment, e.g. 'facebook'.
  source_label text not null,
  -- Public identifier used in /hooks/leads/:key. Not a secret.
  public_key text not null unique,
  -- HMAC / shared secret for type = 'webhook'. Never returned by list endpoints.
  secret text,
  -- Field mapping: { name, phone, email, notes, custom: { field_key: path } }.
  mapping jsonb not null default '{}',
  -- Per-type settings: allowed_origins, redirect_url, default_tags, meta page/form ids.
  settings jsonb not null default '{}',
  is_active boolean not null default true,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lead_sources_workspace_idx on public.lead_sources (workspace_id);

-- Raw payloads, kept 30 days for debugging (purged by the scheduler).
create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  lead_source_id uuid references public.lead_sources (id) on delete set null,
  received_at timestamptz not null default now(),
  payload jsonb not null,
  headers jsonb not null default '{}',
  ip text,
  status text not null default 'received'
    check (status in ('received', 'created', 'reenquiry', 'rejected', 'failed')),
  contact_id uuid references public.contacts (id) on delete set null,
  error text
);
create index lead_events_workspace_idx on public.lead_events (workspace_id, received_at desc);
create index lead_events_received_idx on public.lead_events (received_at);
-- Meta retries webhooks: one row per lead per source, even under concurrent deliveries.
create unique index lead_events_meta_leadgen_key on public.lead_events (lead_source_id, (payload ->> 'leadgen_id'))
  where payload ? 'leadgen_id';

-- ---------------------------------------------------------------------------
-- First-response tracking. Runs on every activity insert so it works no
-- matter which endpoint logged the call, WhatsApp or note (Taimoor's or mine).
-- Activities with meta.counts_as_response = false (e.g. the note typed during
-- quick-add) are context, not a response, and are ignored.
-- ---------------------------------------------------------------------------
create or replace function public.track_first_response() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.contact_id is null or new.actor_id is null then
    return new;
  end if;
  if coalesce((new.meta ->> 'counts_as_response')::boolean, true) = false then
    return new;
  end if;
  if new.type in ('call', 'whatsapp', 'note')
     or (new.type = 'task'
         and new.meta ->> 'action' = 'completed'
         and new.meta ->> 'task_type' in ('call', 'whatsapp', 'meeting', 'site_visit')) then
    update public.contacts
       set first_response_at = coalesce(first_response_at, new.created_at),
           last_response_at = greatest(coalesce(last_response_at, new.created_at), new.created_at),
           last_activity_at = greatest(coalesce(last_activity_at, new.created_at), new.created_at)
     where id = new.contact_id;
  end if;
  return new;
end $$;

create trigger activities_track_first_response
  after insert on public.activities
  for each row execute function public.track_first_response();

alter table public.lead_sources enable row level security;
alter table public.lead_events enable row level security;

-- Lead sources and raw payloads are configuration: managers and owners only.
create policy lead_sources_manager_all on public.lead_sources for all
  using (public.is_workspace_manager(workspace_id))
  with check (public.is_workspace_manager(workspace_id));

create policy lead_events_manager_read on public.lead_events for select
  using (public.is_workspace_manager(workspace_id));

-- The secret column is never readable through the authenticated role: revoke
-- the table-level SELECT (Supabase grants it by default) and grant columns.
revoke all on public.lead_sources from anon, authenticated;
grant select (id, workspace_id, type, name, source_label, public_key, mapping, settings,
              is_active, created_by, created_at, updated_at)
  on public.lead_sources to authenticated;
grant insert, update, delete on public.lead_sources to authenticated;
grant all on public.lead_sources to service_role;
revoke all on public.lead_events from anon, authenticated;
grant select on public.lead_events to authenticated;
grant all on public.lead_events to service_role;
