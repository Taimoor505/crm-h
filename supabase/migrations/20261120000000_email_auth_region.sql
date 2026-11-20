-- Real email + password sign-in (Supabase Auth), multi-country workspaces
-- (brief section 3 and 12), money as minor units + currency, and the columns
-- the frontend reads that Taimoor's sandbox kept in memory.

-- ---------------------------------------------------------------- users
-- Users now sign up with email. Phone is optional and the UI language is
-- English only, so the old 'en'/'ur' locale check goes.
alter table public.users alter column phone drop not null;
alter table public.users alter column name set default '';
alter table public.users alter column email set default '';
alter table public.users drop constraint if exists users_locale_check;

-- Every Supabase Auth user gets a public.users row with the same id.
create or replace function app.handle_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function app.handle_auth_user();

revoke all on function app.handle_auth_user() from public, anon, authenticated;

insert into public.users (id, email, name)
select au.id, coalesce(au.email, ''), split_part(coalesce(au.email, ''), '@', 1)
  from auth.users au
 where not exists (select 1 from public.users u where u.id = au.id);

-- ---------------------------------------------------------------- workspaces
alter table public.workspaces drop constraint if exists workspaces_locale_check;
alter table public.workspaces alter column locale set default 'en-US';
alter table public.workspaces alter column timezone set default 'America/New_York';
alter table public.workspaces
  add column if not exists country text not null default 'US',
  add column if not exists currency text not null default 'USD',
  add column if not exists date_format text not null default 'dd MMM yyyy',
  add column if not exists time_format text not null default '12h' check (time_format in ('12h', '24h')),
  add column if not exists week_starts_on smallint not null default 0 check (week_starts_on in (0, 1, 6)),
  add column if not exists area_unit text not null default 'sqft' check (area_unit in ('sqft', 'sqm')),
  add column if not exists default_phone_country text not null default 'US',
  add column if not exists business_phone text,
  add column if not exists has_samples boolean not null default false;

update public.workspaces
   set country = 'PK', currency = 'PKR', locale = 'en-PK', default_phone_country = 'PK', week_starts_on = 1
 where locale in ('en', 'ur') and timezone = 'Asia/Karachi';
update public.workspaces set locale = 'en-US' where locale in ('en', 'ur');

-- ---------------------------------------------------------------- partners
-- A house partner so self-serve sign-ups have somewhere to live.
insert into public.partners (name, slug, is_house, default_branding)
select 'Hub to Hub', 'house', true,
       '{"appName":"Hub CRM","primaryColor":"#4F46E5","accentColor":"#4F46E5","font":"Plus Jakarta Sans"}'::jsonb
 where not exists (select 1 from public.partners where is_house);

-- ---------------------------------------------------------------- contacts and deals
alter table public.contacts alter column status set default 'new';
alter table public.contacts add column if not exists is_sample boolean not null default false;

do $$ begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'deals' and column_name = 'value_pkr') then
    alter table public.deals rename column value_pkr to value_minor;
    -- value_pkr held whole rupees; value_minor holds paisa/cents.
    update public.deals set value_minor = value_minor * 100;
  end if;
end $$;
alter table public.deals
  add column if not exists currency text not null default 'USD',
  add column if not exists won_reason text,
  add column if not exists is_sample boolean not null default false;

create index if not exists deals_ws_stage_idx on public.deals (workspace_id, stage_id) where deleted_at is null;
create index if not exists contacts_ws_created_idx on public.contacts (workspace_id, created_at desc, id desc) where deleted_at is null;

-- ---------------------------------------------------------------- pipelines
alter table public.pipelines
  add column if not exists won_reasons text[] not null default '{"Best price","Fast response","Referral trust"}',
  add column if not exists lost_reasons text[] not null default '{"Price too high","Chose a competitor","No response","Not ready yet"}';

-- ---------------------------------------------------------------- custom fields, imports
alter table public.custom_field_defs alter column label_ur set default '';
alter table public.custom_field_defs drop constraint if exists custom_field_defs_type_check;
alter table public.custom_field_defs add constraint custom_field_defs_type_check
  check (type in ('text', 'number', 'money', 'date', 'select', 'multiselect', 'phone', 'area', 'boolean', 'email', 'url'));
alter table public.imports alter column file_url set default '';

-- ---------------------------------------------------------------- branding assets
-- Logos and favicons are public (they show on the sign-in page).
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('branding', 'branding', true, 1048576,
            array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp', 'image/x-icon'])
    on conflict (id) do nothing;
  end if;
end $$;

-- ---------------------------------------------------------------- WhatsApp inbox
-- Meta retries webhooks: one row per WhatsApp message id.
create unique index if not exists messages_wa_message_id_key on public.messages (workspace_id, wa_message_id) where wa_message_id is not null;
create unique index if not exists whatsapp_accounts_phone_number_id_key on public.whatsapp_accounts (phone_number_id);
alter table public.whatsapp_accounts alter column token_ref set default '';
create index if not exists conversations_ws_last_idx on public.conversations (workspace_id, last_message_at desc);
