-- =============================================================================
-- Notifications (Huzaifa)
-- In-app rows now; push and agent-WhatsApp delivery arrive in weeks 6-8 and
-- write to notification_deliveries (the send log).
-- =============================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null,                 -- e.g. lead.assigned, lead.reassigned, task.assigned
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  title text not null,
  body text,
  data jsonb not null default '{}',   -- ids for deep links: contact_id, task_id, ...
  read_at timestamptz,
  dedupe_key text,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('in_app', 'push', 'whatsapp')),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'failed', 'skipped')),
  provider_ref text,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_deliveries_notification_idx
  on public.notification_deliveries (notification_id);

-- Lets a signed-in user's transaction notify a colleague (e.g. a manager
-- assigning a lead) without granting INSERT on other users' notifications.
create or replace function public.create_notification(
  p_workspace_id uuid,
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_data jsonb default '{}',
  p_priority text default 'normal',
  p_dedupe_key text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if auth.uid() is not null and not public.is_workspace_member(p_workspace_id) then
    raise exception 'not a member of workspace %', p_workspace_id using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships m
                 where m.workspace_id = p_workspace_id and m.user_id = p_user_id
                   and m.status = 'active') then
    return null;  -- recipient left the workspace: drop silently
  end if;

  insert into public.notifications
    (workspace_id, user_id, type, title, body, data, priority, dedupe_key)
  values
    (p_workspace_id, p_user_id, p_type, p_title, p_body, coalesce(p_data, '{}'),
     coalesce(p_priority, 'normal'), p_dedupe_key)
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.notification_deliveries (notification_id, channel, status)
    values (v_id, 'in_app', 'delivered');
  end if;
  return v_id;
end $$;

alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;

create policy notifications_own_read on public.notifications for select
  using (user_id = auth.uid());
create policy notifications_own_update on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_deliveries_own_read on public.notification_deliveries for select
  using (exists (select 1 from public.notifications n where n.id = notification_id));

revoke all on public.notifications, public.notification_deliveries from anon, authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select on public.notification_deliveries to authenticated;
grant all on public.notifications, public.notification_deliveries to service_role;
grant execute on function public.create_notification(uuid, uuid, text, text, text, jsonb, text, text)
  to authenticated, service_role;
