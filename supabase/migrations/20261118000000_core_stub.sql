-- =============================================================================
-- CORE STUB (owned by Taimoor)
--
-- Minimal versions of Taimoor's core tables so lead capture, assignment and
-- tasks can be built and tested before his migrations land. Columns follow his
-- brief (section 4). When his real migrations arrive, they replace this file;
-- the only things my code relies on are listed in docs/huzaifa-backend.md
-- under "Contract with the core schema".
-- =============================================================================

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  is_house boolean not null default false,
  default_branding jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  name text not null,
  industry_template_id uuid,
  branding jsonb not null default '{}',
  locale text not null default 'en',
  timezone text not null default 'Asia/Karachi',
  status text not null default 'active'
    check (status in ('active', 'read_only', 'archived', 'suspended')),
  created_at timestamptz not null default now()
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  phone text,
  email text,
  locale text not null default 'en',
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'agent')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  unique (user_id, workspace_id)
);

-- Partner admins (white-label reseller staff). They manage billing and can
-- support their own client workspaces.
create table public.partner_members (
  partner_id uuid not null references public.partners (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  primary key (partner_id, user_id)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text,
  phone_e164 text,
  alt_phone text,
  email text,
  company_id uuid,
  source text,
  owner_id uuid references public.users (id),
  status text not null default 'new',
  tags text[] not null default '{}',
  custom jsonb not null default '{}',
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index contacts_workspace_phone_key on public.contacts (workspace_id, phone_e164);
create index contacts_workspace_owner_idx on public.contacts (workspace_id, owner_id);

create table public.pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  position int not null default 0
);

create table public.stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.pipelines (id) on delete cascade,
  name text not null,
  position int not null default 0,
  kind text not null default 'open' check (kind in ('open', 'won', 'lost'))
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  pipeline_id uuid not null references public.pipelines (id),
  stage_id uuid not null references public.stages (id),
  contact_id uuid references public.contacts (id),
  title text not null,
  value_pkr numeric(14, 2),
  owner_id uuid references public.users (id),
  expected_close date,
  lost_reason text,
  custom jsonb not null default '{}',
  stage_entered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  type text not null
    check (type in ('note', 'call', 'whatsapp', 'stage_change', 'assignment', 'task', 'system')),
  actor_id uuid references public.users (id),
  body text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index activities_contact_idx on public.activities (contact_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS helpers. SECURITY DEFINER so policies can read memberships without
-- recursing through memberships' own policy.
-- ---------------------------------------------------------------------------
create or replace function public.workspace_role(ws uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.memberships m
  where m.workspace_id = ws and m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function public.is_workspace_member(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.workspace_role(ws) is not null
$$;

create or replace function public.is_workspace_manager(ws uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.workspace_role(ws) in ('owner', 'manager'), false)
$$;

alter table public.partners enable row level security;
alter table public.workspaces enable row level security;
alter table public.users enable row level security;
alter table public.memberships enable row level security;
alter table public.partner_members enable row level security;
alter table public.contacts enable row level security;
alter table public.pipelines enable row level security;
alter table public.stages enable row level security;
alter table public.deals enable row level security;
alter table public.activities enable row level security;

create policy workspaces_member_read on public.workspaces for select
  using (public.is_workspace_member(id));

create policy partner_members_self_read on public.partner_members for select
  using (user_id = auth.uid());

create policy memberships_member_read on public.memberships for select
  using (public.is_workspace_member(workspace_id));

create policy users_self_or_colleague_read on public.users for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.memberships m
      where m.user_id = users.id and public.is_workspace_member(m.workspace_id)
    )
  );

-- Agents see only contacts they own; managers and owners see all.
create policy contacts_read on public.contacts for select
  using (
    public.is_workspace_member(workspace_id)
    and (public.is_workspace_manager(workspace_id) or owner_id = auth.uid())
  );
create policy contacts_insert on public.contacts for insert
  with check (
    public.is_workspace_member(workspace_id)
    and (public.is_workspace_manager(workspace_id) or owner_id = auth.uid())
  );
create policy contacts_update on public.contacts for update
  using (
    public.is_workspace_member(workspace_id)
    and (public.is_workspace_manager(workspace_id) or owner_id = auth.uid())
  );

create policy pipelines_read on public.pipelines for select
  using (public.is_workspace_member(workspace_id));
create policy stages_read on public.stages for select
  using (exists (select 1 from public.pipelines p where p.id = pipeline_id));

create policy deals_read on public.deals for select
  using (
    public.is_workspace_member(workspace_id)
    and (public.is_workspace_manager(workspace_id) or owner_id = auth.uid())
  );

create policy activities_read on public.activities for select
  using (
    public.is_workspace_member(workspace_id)
    and (
      public.is_workspace_manager(workspace_id)
      or actor_id = auth.uid()
      or exists (select 1 from public.contacts c where c.id = contact_id)
    )
  );
create policy activities_insert on public.activities for insert
  with check (public.is_workspace_member(workspace_id) and actor_id = auth.uid());

grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant execute on function public.workspace_role(uuid) to authenticated, service_role;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.is_workspace_manager(uuid) to authenticated, service_role;
