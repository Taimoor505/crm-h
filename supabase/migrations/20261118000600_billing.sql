-- =============================================================================
-- Plans, subscriptions and partner billing (Huzaifa)
--
-- The billing unit is a subscription. A partner's subscription covers all of
-- its client workspaces; a direct customer (house partner) has a subscription
-- for its one workspace (workspace_id set). Prices are per client workspace.
-- Money is PKR, numeric(12,2). Billing dates are in Asia/Karachi.
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

-- Super-admins (platform staff): see all partners, confirm payments.
create table public.platform_admins (
  user_id uuid primary key references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  -- Set for a direct customer billed for one workspace; NULL = all of the partner's workspaces.
  workspace_id uuid references public.workspaces (id),
  plan_id text not null references public.plans (id),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'read_only', 'archived', 'suspended', 'cancelled')),
  period_start date not null,
  period_end date not null,                    -- exclusive
  trial_ends_at timestamptz,
  -- Plan changes take effect at period_end (no mid-period refunds).
  pending_plan_id text references public.plans (id),
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);
create unique index subscriptions_one_current
  on public.subscriptions (partner_id, coalesce(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status not in ('cancelled', 'archived');
create unique index subscriptions_one_current_per_workspace
  on public.subscriptions (workspace_id) where workspace_id is not null and status not in ('cancelled', 'archived');

-- One free first month per real-world customer. identity_key is a normalised
-- NTN, CNIC or owner phone, so registering a new brand name doesn't reset it.
create table public.billing_trials (
  identity_key text primary key,
  subscription_id uuid not null unique references public.subscriptions (id),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  max_workspaces int not null default 5
);

create sequence public.partner_invoice_seq;

create table public.partner_invoices (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  workspace_id uuid references public.workspaces (id),
  subscription_id uuid not null references public.subscriptions (id),
  number text not null unique,
  period_start date not null,                  -- the billing month (first day)
  period_end date not null,
  issue_date date not null,
  due_date date not null,
  status text not null default 'issued' check (status in ('issued', 'paid', 'overdue', 'void')),
  subtotal_pkr numeric(12, 2) not null default 0,
  total_pkr numeric(12, 2) not null default 0,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  -- One invoice per subscription per month: makes the billing run idempotent.
  unique (subscription_id, period_start)
);
create index partner_invoices_partner_idx on public.partner_invoices (partner_id, issue_date desc);
create index partner_invoices_open_idx on public.partner_invoices (due_date) where status in ('issued', 'overdue');

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.partner_invoices (id) on delete cascade,
  workspace_id uuid references public.workspaces (id),
  kind text not null
    check (kind in ('subscription', 'commission', 'whatsapp_passthrough', 'adjustment')),
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price_pkr numeric(12, 2) not null,
  amount_pkr numeric(12, 2) not null,
  -- Service period this line pays for (subscription lines).
  service_start date,
  service_end date
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);
create index invoice_lines_workspace_idx on public.invoice_lines (workspace_id, service_start, service_end)
  where kind = 'subscription';

-- Every (subscription, month) the billing run processed, with or without an invoice.
create table public.billing_runs (
  subscription_id uuid not null references public.subscriptions (id),
  period_start date not null,
  invoice_id uuid references public.partner_invoices (id),
  summary jsonb not null default '{}',
  created_at timestamptz not null default now(),
  primary key (subscription_id, period_start)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  subscription_id uuid references public.subscriptions (id),
  invoice_id uuid references public.partner_invoices (id),
  amount_pkr numeric(12, 2) not null check (amount_pkr > 0),
  method text not null check (method in ('bank_transfer', 'jazzcash', 'easypaisa', 'card')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reference text,
  proof_url text,                              -- storage path of the uploaded screenshot
  submitted_by uuid references public.users (id),
  confirmed_by uuid references public.users (id),
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index payments_partner_idx on public.payments (partner_id, created_at desc);
create index payments_pending_idx on public.payments (created_at) where status = 'pending';

-- Commission plan: what the partner collected from each client per month,
-- reported by the partner, invoiced by the billing run, settled on payment.
create table public.commission_ledger (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  workspace_id uuid not null references public.workspaces (id),
  period date not null,                          -- first day of the month
  amount_collected_pkr numeric(12, 2) not null default 0,
  rate numeric(5, 4) not null,
  commission_pkr numeric(12, 2) not null,
  floor_applied boolean not null default false,
  status text not null default 'reported' check (status in ('reported', 'invoiced', 'settled')),
  invoice_id uuid references public.partner_invoices (id),
  reported_by uuid references public.users (id),
  reported_at timestamptz,
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
alter table public.platform_admins enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_trials enable row level security;
alter table public.partner_invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.billing_runs enable row level security;
alter table public.payments enable row level security;
alter table public.commission_ledger enable row level security;
alter table public.usage_counters enable row level security;

-- Anyone signed in can see the plan list. Everything else goes through the
-- billing API, which authorises the partner admin / owner / super-admin and
-- then uses the service role.
create policy plans_read on public.plans for select to authenticated using (is_active);

revoke all on public.plans, public.platform_admins, public.subscriptions, public.billing_trials,
  public.partner_invoices, public.invoice_lines, public.billing_runs, public.payments,
  public.commission_ledger, public.usage_counters from anon, authenticated;
grant select on public.plans to authenticated;
grant all on public.plans, public.platform_admins, public.subscriptions, public.billing_trials,
  public.partner_invoices, public.invoice_lines, public.billing_runs, public.payments,
  public.commission_ledger, public.usage_counters to service_role;
grant usage, select on sequence public.partner_invoice_seq to service_role;
