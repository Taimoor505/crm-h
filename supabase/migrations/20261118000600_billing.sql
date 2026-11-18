-- =============================================================================
-- Plans, subscriptions and partner billing (Huzaifa)
--
-- Tables only for now (weeks 1-2). The billing run, payment confirmation and
-- read-only/archive rules land in weeks 11-12. Billing is per client
-- workspace, charged to the partner; direct customers sit under the house
-- partner and use the same tables. Money is PKR, numeric(12,2).
-- =============================================================================

create table public.plans (
  id text primary key,                         -- commission | monthly | quarterly | annual
  name text not null,
  billing_type text not null check (billing_type in ('commission', 'prepaid')),
  period_months int not null check (period_months in (1, 3, 12)),
  -- prepaid: price per client workspace per billing period
  price_per_period_pkr numeric(12, 2),
  -- commission: share of collected retail, with a monthly floor per workspace
  commission_rate numeric(5, 4),
  commission_min_pkr numeric(12, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (billing_type = 'prepaid' and price_per_period_pkr is not null and commission_rate is null)
    or (billing_type = 'commission' and commission_rate is not null and price_per_period_pkr is null)
  )
);

-- Starting prices from the brief (to be validated with pilot partners).
insert into public.plans
  (id, name, billing_type, period_months, price_per_period_pkr, commission_rate, commission_min_pkr)
values
  ('commission', 'Commission only', 'commission', 1, null, 0.3000, 300.00),
  ('monthly', 'Monthly', 'prepaid', 1, 1500.00, null, null),
  ('quarterly', 'Quarterly', 'prepaid', 3, 3600.00, null, null),
  ('annual', 'Annual (full advance)', 'prepaid', 12, 10800.00, null, null);

-- One free month per real-world partner. identity_key is a normalised NTN,
-- CNIC or owner phone, so registering a new brand name doesn't reset it.
create table public.partner_trials (
  identity_key text primary key,
  partner_id uuid not null unique references public.partners (id),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  max_workspaces int not null default 5
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  plan_id text not null references public.plans (id),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'read_only', 'archived', 'cancelled')),
  period_start date not null,
  period_end date not null,
  trial_ends_at timestamptz,
  -- Plan changes take effect at period_end (no mid-period refunds).
  pending_plan_id text references public.plans (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);
create unique index subscriptions_one_current_per_partner
  on public.subscriptions (partner_id) where status not in ('cancelled', 'archived');

create table public.partner_invoices (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  subscription_id uuid references public.subscriptions (id),
  number text not null unique,
  period_start date not null,
  period_end date not null,
  issue_date date not null default current_date,
  due_date date not null,
  status text not null default 'issued'
    check (status in ('draft', 'issued', 'paid', 'overdue', 'void')),
  subtotal_pkr numeric(12, 2) not null default 0,
  total_pkr numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  -- One invoice per partner per period: makes the billing run idempotent.
  unique (partner_id, period_start)
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.partner_invoices (id) on delete cascade,
  workspace_id uuid references public.workspaces (id),
  kind text not null
    check (kind in ('subscription', 'commission', 'whatsapp_passthrough', 'adjustment')),
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price_pkr numeric(12, 2) not null,
  amount_pkr numeric(12, 2) not null
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  invoice_id uuid references public.partner_invoices (id),
  amount_pkr numeric(12, 2) not null check (amount_pkr > 0),
  method text not null check (method in ('bank_transfer', 'jazzcash', 'easypaisa', 'card')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reference text,
  proof_url text,
  submitted_by uuid references public.users (id),
  confirmed_by uuid references public.users (id),
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index payments_partner_idx on public.payments (partner_id, created_at desc);

create table public.commission_ledger (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  workspace_id uuid not null references public.workspaces (id),
  period date not null,                          -- first day of the month
  amount_collected_pkr numeric(12, 2) not null default 0,
  rate numeric(5, 4) not null,
  commission_pkr numeric(12, 2) not null,
  floor_applied boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'settled')),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, period)
);

create table public.usage_counters (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  period date not null,                          -- first day of the month
  whatsapp_sent int not null default 0,
  whatsapp_cost_pkr numeric(12, 2) not null default 0,
  active_users int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, period)
);

alter table public.plans enable row level security;
alter table public.partner_trials enable row level security;
alter table public.subscriptions enable row level security;
alter table public.partner_invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments enable row level security;
alter table public.commission_ledger enable row level security;
alter table public.usage_counters enable row level security;

-- Anyone signed in can see the plan list. Everything else goes through the
-- billing API (service role) until the partner-admin role exists in the core
-- schema; policies for partner admins get added then.
create policy plans_read on public.plans for select to authenticated using (is_active);

revoke all on public.plans, public.partner_trials, public.subscriptions, public.partner_invoices,
  public.invoice_lines, public.payments, public.commission_ledger, public.usage_counters
  from anon, authenticated;
grant select on public.plans to authenticated;
grant all on public.plans, public.partner_trials, public.subscriptions, public.partner_invoices,
  public.invoice_lines, public.payments, public.commission_ledger, public.usage_counters
  to service_role;
