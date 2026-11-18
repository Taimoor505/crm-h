import type { Tx } from '../db';
import { jsonb } from '../db';
import {
  addMonths, BILLING_TZ, coveredWorkspaces, dateStartTs, DUE_DAYS, monthLabel, monthStart, monthlyRate, pkr,
  round2, today, type Plan, type Subscription,
} from './core';

interface Line {
  workspace_id: string | null;
  kind: 'subscription' | 'commission' | 'whatsapp_passthrough' | 'adjustment';
  description: string;
  quantity: number;
  unit_price_pkr: number;
  amount_pkr: number;
  service_start?: string | null;
  service_end?: string | null;
}

export interface BillResult {
  subscription_id: string;
  status: 'billed' | 'nothing_due' | 'already_billed' | 'skipped';
  invoice_id?: string | null;
  total_pkr?: number;
  lines?: number;
}

async function plan(tx: Tx, id: string): Promise<Plan> {
  const [p] = await tx<Plan[]>`select * from public.plans where id = ${id}`;
  return p;
}

/**
 * Bills one subscription for one month (`month` = first day, billing tz).
 * Idempotent via billing_runs. In order:
 *  1. trial ended → first paid period starts this month;
 *     a pending plan change applies when the paid period has ended;
 *  2. prepaid plans: each workspace not yet paid for this month gets a line
 *     for the rest of the current period (whole period at its start);
 *  3. commission plan: last month's collections × rate, with the monthly
 *     floor, per workspace (in arrears, skipped while that month was trial);
 *  4. WhatsApp pass-through: last month's messages at cost, every plan;
 *  5. trial: the first 5 workspaces are free; extras are billed monthly.
 */
export async function billSubscription(tx: Tx, subscriptionId: string, month: string): Promise<BillResult> {
  const [sub] = await tx<Subscription[]>`
    select *, period_start::text as period_start, period_end::text as period_end
      from public.subscriptions where id = ${subscriptionId} for update`;
  if (!sub) return { subscription_id: subscriptionId, status: 'skipped' };
  const [already] = await tx`select 1 from public.billing_runs where subscription_id = ${sub.id} and period_start = ${month}`;
  if (already) return { subscription_id: sub.id, status: 'already_billed' };
  if (!['trialing', 'active', 'read_only'].includes(sub.status)) return { subscription_id: sub.id, status: 'skipped' };

  const monthEnd = await addMonths(tx, month, 1);
  const prevMonth = await addMonths(tx, month, -1);
  const monthTs = await dateStartTs(tx, month);
  const prevMonthTs = await dateStartTs(tx, prevMonth);
  const [trial] = await tx<{ ends_at: Date; max_workspaces: number }[]>`
    select ends_at, max_workspaces from public.billing_trials where subscription_id = ${sub.id}`;

  let status = sub.status;
  let planId = sub.plan_id;
  let pendingPlanId = sub.pending_plan_id;
  let periodStart = sub.period_start;
  let periodEnd = sub.period_end;
  const trialActive = status === 'trialing' && !!trial && trial.ends_at > monthTs;

  if (status === 'trialing' && !trialActive) {
    status = 'active';
    if (pendingPlanId) { planId = pendingPlanId; pendingPlanId = null; }
    periodStart = month;
    periodEnd = await addMonths(tx, month, (await plan(tx, planId)).period_months);
  } else if (status !== 'trialing' && periodEnd <= month) {
    if (pendingPlanId) { planId = pendingPlanId; pendingPlanId = null; }
    periodStart = month;
    periodEnd = await addMonths(tx, month, (await plan(tx, planId)).period_months);
  }
  const p = await plan(tx, planId);
  const workspaces = await coveredWorkspaces(tx, sub);
  const lines: Line[] = [];

  if (trialActive) {
    const extras = workspaces.slice(trial.max_workspaces);
    for (const w of extras) {
      const rate = round2(monthlyRate(p));
      lines.push({
        workspace_id: w.id, kind: 'subscription',
        description: `${w.name}: beyond the ${trial.max_workspaces} free trial workspaces, ${monthLabel(month)}`,
        quantity: 1, unit_price_pkr: rate, amount_pkr: rate, service_start: month, service_end: monthEnd,
      });
    }
  } else if (p.billing_type === 'prepaid') {
    const [{ months_left }] = await tx<{ months_left: number }[]>`
      select ((extract(year from age(${periodEnd}::date, ${month}::date)) * 12)
              + extract(month from age(${periodEnd}::date, ${month}::date)))::int as months_left`;
    for (const w of workspaces) {
      const [paid] = await tx`
        select 1 from public.invoice_lines l join public.partner_invoices i on i.id = l.invoice_id
         where l.workspace_id = ${w.id} and l.kind = 'subscription' and i.status <> 'void'
           and l.service_start <= ${month}::date and l.service_end > ${month}::date`;
      if (paid) continue;
      const full = periodStart === month;
      const amount = full ? Number(p.price_per_period_pkr) : round2(monthlyRate(p) * months_left);
      const lastMonth = await addMonths(tx, periodEnd, -1);
      lines.push({
        workspace_id: w.id, kind: 'subscription',
        description: `${w.name}: ${p.name} plan, ${monthLabel(month)}${lastMonth > month ? ` to ${monthLabel(lastMonth)}` : ''}`
          + (full ? '' : ` (joined mid-period, ${months_left} month${months_left === 1 ? '' : 's'})`),
        quantity: 1, unit_price_pkr: amount, amount_pkr: amount, service_start: month, service_end: periodEnd,
      });
    }
  } else {
    // Commission, in arrears for last month, unless last month was free trial
    // or the subscription didn't exist yet.
    const prevWasTrial = !!trial && trial.ends_at > prevMonthTs;
    const existedLastMonth = sub.created_at < monthTs;
    if (!prevWasTrial && existedLastMonth) {
      const rate = Number(p.commission_rate);
      const floor = Number(p.commission_min_pkr ?? 0);
      for (const w of workspaces) {
        const [row] = await tx<{ amount_collected_pkr: string; status: string }[]>`
          select amount_collected_pkr, status from public.commission_ledger
           where workspace_id = ${w.id} and period = ${prevMonth}`;
        if (row && row.status !== 'reported') continue;   // already invoiced elsewhere
        const collected = Number(row?.amount_collected_pkr ?? 0);
        const share = round2(collected * rate);
        const commission = Math.max(share, floor);
        await tx`
          insert into public.commission_ledger
            (partner_id, workspace_id, period, amount_collected_pkr, rate, commission_pkr, floor_applied, status)
          values (${sub.partner_id}, ${w.id}, ${prevMonth}, ${collected}, ${rate}, ${commission}, ${share < floor}, 'invoiced')
          on conflict (workspace_id, period) do update set
            rate = excluded.rate, commission_pkr = excluded.commission_pkr,
            floor_applied = excluded.floor_applied, status = 'invoiced'`;
        lines.push({
          workspace_id: w.id, kind: 'commission',
          description: `${w.name}: ${Math.round(rate * 100)}% of ${pkr(collected)} collected in ${monthLabel(prevMonth)}`
            + (share < floor ? ` (monthly minimum ${pkr(floor)})` : ''),
          quantity: 1, unit_price_pkr: commission, amount_pkr: commission,
        });
      }
    }
  }

  // WhatsApp at cost for last month, every plan (also during the trial).
  for (const w of workspaces) {
    const [u] = await tx<{ whatsapp_sent: number; whatsapp_cost_pkr: string }[]>`
      select whatsapp_sent, whatsapp_cost_pkr from public.usage_counters
       where workspace_id = ${w.id} and period = ${prevMonth}`;
    const cost = Number(u?.whatsapp_cost_pkr ?? 0);
    if (cost > 0) {
      lines.push({
        workspace_id: w.id, kind: 'whatsapp_passthrough',
        description: `${w.name}: ${u.whatsapp_sent} WhatsApp messages in ${monthLabel(prevMonth)} (at Meta's cost)`,
        quantity: u.whatsapp_sent, unit_price_pkr: round2(cost / Math.max(u.whatsapp_sent, 1)), amount_pkr: round2(cost),
      });
    }
    // Snapshot of active users for last month (for reporting).
    await tx`
      insert into public.usage_counters (workspace_id, period, active_users)
      select ${w.id}, ${prevMonth}, count(*) from public.memberships
       where workspace_id = ${w.id} and status = 'active'
      on conflict (workspace_id, period) do update set active_users = excluded.active_users, updated_at = now()`;
  }

  const total = round2(lines.reduce((s, l) => s + l.amount_pkr, 0));
  let invoiceId: string | null = null;
  if (total > 0) {
    const issue = await today(tx);
    const [inv] = await tx<{ id: string }[]>`
      insert into public.partner_invoices
        (partner_id, workspace_id, subscription_id, number, period_start, period_end, issue_date, due_date,
         subtotal_pkr, total_pkr)
      values (${sub.partner_id}, ${sub.workspace_id}, ${sub.id},
              'INV-' || to_char(${month}::date, 'YYYYMM') || '-' || lpad(nextval('public.partner_invoice_seq')::text, 5, '0'),
              ${month}, ${monthEnd}, ${issue}, ${issue}::date + ${DUE_DAYS}::int, ${total}, ${total})
      returning id`;
    invoiceId = inv.id;
    for (const l of lines) {
      await tx`
        insert into public.invoice_lines
          (invoice_id, workspace_id, kind, description, quantity, unit_price_pkr, amount_pkr, service_start, service_end)
        values (${inv.id}, ${l.workspace_id}, ${l.kind}, ${l.description}, ${l.quantity}, ${l.unit_price_pkr},
                ${l.amount_pkr}, ${l.service_start ?? null}, ${l.service_end ?? null})`;
    }
    await tx`update public.commission_ledger set invoice_id = ${inv.id}
              where workspace_id = any(${workspaces.map((w) => w.id)}::uuid[]) and period = ${prevMonth}
                and status = 'invoiced' and invoice_id is null`;
  }

  await tx`
    update public.subscriptions set
      status = ${status}, plan_id = ${planId}, pending_plan_id = ${pendingPlanId},
      period_start = ${periodStart}, period_end = ${periodEnd}, updated_at = now()
    where id = ${sub.id}`;
  await tx`
    insert into public.billing_runs (subscription_id, period_start, invoice_id, summary)
    values (${sub.id}, ${month}, ${invoiceId},
            ${jsonb(tx, { total_pkr: total, lines: lines.length, workspaces: workspaces.length, trial: trialActive, plan: planId })}::jsonb)`;
  return { subscription_id: sub.id, status: invoiceId ? 'billed' : 'nothing_due', invoice_id: invoiceId, total_pkr: total, lines: lines.length };
}

/**
 * The monthly billing run (scheduler, hourly; does the work once a month).
 * Each subscription is billed in its own savepoint so one bad account doesn't
 * stop the rest; billing_runs makes repeats a no-op.
 */
export async function runMonthlyBilling(tx: Tx, month?: string) {
  const m = month ?? (await monthStart(tx));
  const monthEndTs = await dateStartTs(tx, await addMonths(tx, m, 1));
  const subs = await tx<{ id: string }[]>`
    select s.id from public.subscriptions s
     where s.status in ('trialing', 'active', 'read_only') and s.created_at < ${monthEndTs}
       and not exists (select 1 from public.billing_runs b where b.subscription_id = s.id and b.period_start = ${m})
     order by s.created_at`;
  const results: BillResult[] = [];
  let failed = 0;
  for (const s of subs) {
    try {
      results.push(await tx.savepoint((sp) => billSubscription(sp, s.id, m)));
    } catch (err) {
      failed++;
      console.error(`[billing] subscription ${s.id} failed for ${m}`, err);
    }
  }
  return {
    month: m,
    timezone: BILLING_TZ,
    invoices: results.filter((r) => r.status === 'billed').length,
    nothing_due: results.filter((r) => r.status === 'nothing_due').length,
    failed,
    total_pkr: round2(results.reduce((s, r) => s + (r.total_pkr ?? 0), 0)),
  };
}
