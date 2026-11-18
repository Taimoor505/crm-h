-- =============================================================================
-- Notification channels, settings, quiet hours (Huzaifa, weeks 6-8)
--
-- create_notification() now queues a 'notification.dispatch' job. The worker
-- reads the recipient's settings, writes one notification_deliveries row per
-- channel (push / whatsapp) and schedules it, deferring to 08:00 during quiet
-- hours (23:00-08:00 in the workspace timezone).
-- =============================================================================

create table public.notification_settings (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  -- Per event type overrides: { "lead.assigned": { "push": true, "whatsapp": false } }.
  -- Missing entries fall back to the defaults in server/notifications/events.ts.
  channels jsonb not null default '{}',
  quiet_hours boolean not null default true,
  -- Number for agent WhatsApp alerts. NULL = users.phone.
  whatsapp_number text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  disabled_at timestamptz          -- set when the push service says the subscription is gone
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id) where disabled_at is null;

-- Set when the "not contacted in 30 minutes" alert went out for the latest enquiry.
alter table public.contacts add column untouched_alerted_at timestamptz;

alter table public.notification_deliveries
  add column scheduled_for timestamptz,
  add column sent_at timestamptz;
create unique index notification_deliveries_one_per_channel
  on public.notification_deliveries (notification_id, channel);

-- When a message may go out: `at`, or 08:00 local if `at` falls in 23:00-08:00.
create or replace function public.quiet_hours_release(p_timezone text, p_at timestamptz default now())
returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when extract(hour from p_at at time zone p_timezone) >= 23 then
      (date_trunc('day', p_at at time zone p_timezone) + interval '1 day 8 hours') at time zone p_timezone
    when extract(hour from p_at at time zone p_timezone) < 8 then
      (date_trunc('day', p_at at time zone p_timezone) + interval '8 hours') at time zone p_timezone
    else p_at
  end
$$;

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
    return null;
  end if;

  insert into public.notifications
    (workspace_id, user_id, type, title, body, data, priority, dedupe_key)
  values
    (p_workspace_id, p_user_id, p_type, p_title, p_body, coalesce(p_data, '{}'),
     coalesce(p_priority, 'normal'), p_dedupe_key)
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.notification_deliveries (notification_id, channel, status, sent_at)
    values (v_id, 'in_app', 'delivered', now());
    -- Push / WhatsApp fan-out happens in the worker (needs settings + subscriptions).
    insert into public.jobs (name, payload, workspace_id, dedupe_key)
    values ('notification.dispatch', jsonb_build_object('notification_id', v_id), p_workspace_id,
            'notification.dispatch:' || v_id)
    on conflict (dedupe_key) do nothing;
  end if;
  return v_id;
end $$;

alter table public.notification_settings enable row level security;
alter table public.push_subscriptions enable row level security;

create policy notification_settings_own on public.notification_settings for all
  using (user_id = auth.uid() and public.is_workspace_member(workspace_id))
  with check (user_id = auth.uid() and public.is_workspace_member(workspace_id));

create policy push_subscriptions_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.notification_settings, public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.notification_settings, public.push_subscriptions
  to authenticated;
grant all on public.notification_settings, public.push_subscriptions to service_role;
grant execute on function public.quiet_hours_release(text, timestamptz) to authenticated, service_role;
