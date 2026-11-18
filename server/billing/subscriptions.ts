import type { Tx } from '../db';
import { ApiError } from '../http';
import { normalizePhone } from '../core/phone';
import { addMonths, BILLING_TZ, coveredWorkspaces, monthStart, today, type Subscription } from './core';
import { billSubscription } from './run';

export interface BillingAccount {
  partnerId: string;
  /** Direct customer: the one workspace this account pays for. */
  workspaceId: string | null;
}

export async function currentSubscription(tx: Tx, a: BillingAccount): Promise<Subscription | null> {
  const [s] = await tx<Subscription[]>`
    select *, period_start::text as period_start, period_end::text as period_end
      from public.subscriptions
     where partner_id = ${a.partnerId} and workspace_id is not distinct from ${a.workspaceId}::uuid
       and status <> 'cancelled'
     order by (status = 'archived'), created_at desc
     limit 1`;
  return s ?? null;
}

/**
 * Normalises what identifies a real business for the one-free-month rule:
 * NTN (7 digits + check digit), CNIC (13 digits) or a phone number.
 */
export function identityKey(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (/^\d{13}$/.test(digits) && !digits.startsWith('92')) return `cnic:${digits}`;
  if (/^\d{7,8}$/.test(digits)) return `ntn:${digits}`;
  const phone = normalizePhone(raw);
  if (phone) return `phone:${phone}`;
  throw new ApiError(422, 'invalid_identity', 'identity must be an NTN, CNIC or phone number');
}

/**
 * Starts a subscription. With an unused identity (NTN / CNIC / phone) it
 * starts with one free month; otherwise it starts now and the first invoice
 * is issued immediately.
 */
export async function startSubscription(
  tx: Tx,
  a: BillingAccount,
  args: { planId: string; identity?: string | null; userId: string },
): Promise<{ subscription: Subscription; trial: boolean; invoice_id: string | null }> {
  const existing = await currentSubscription(tx, a);
  if (existing && existing.status !== 'archived') {
    throw new ApiError(409, 'subscription_exists', 'There is already a subscription; change its plan instead');
  }

  const key = args.identity ? identityKey(args.identity) : null;
  let trial = false;
  if (key) {
    const [claimed] = await tx`select 1 from public.billing_trials where identity_key = ${key}`;
    trial = !claimed;
  }

  const d = await today(tx);
  if (trial) {
    const [s] = await tx<Subscription[]>`
      insert into public.subscriptions
        (partner_id, workspace_id, plan_id, status, period_start, period_end, trial_ends_at, created_by)
      values (${a.partnerId}, ${a.workspaceId}, ${args.planId}, 'trialing', ${d},
              ((now() + interval '1 month') at time zone ${BILLING_TZ})::date + 1,
              now() + interval '1 month', ${args.userId})
      returning *, period_start::text as period_start, period_end::text as period_end`;
    await tx`insert into public.billing_trials (identity_key, subscription_id, ends_at)
             values (${key}, ${s.id}, ${s.trial_ends_at})`;
    return { subscription: s, trial: true, invoice_id: null };
  }

  const m = await monthStart(tx);
  const [p] = await tx<{ period_months: number }[]>`select period_months from public.plans where id = ${args.planId}`;
  const [s] = await tx<Subscription[]>`
    insert into public.subscriptions
      (partner_id, workspace_id, plan_id, status, period_start, period_end, created_by)
    values (${a.partnerId}, ${a.workspaceId}, ${args.planId}, 'active', ${m}, ${await addMonths(tx, m, p.period_months)},
            ${args.userId})
    returning *, period_start::text as period_start, period_end::text as period_end`;
  const bill = await billSubscription(tx, s.id, m);
  return { subscription: s, trial: false, invoice_id: bill.invoice_id ?? null };
}

/**
 * Plan change. During the trial it applies at once (nothing paid yet);
 * otherwise at the end of the paid period. Choosing the current plan cancels
 * a pending change.
 */
export async function changePlan(tx: Tx, sub: Subscription, planId: string): Promise<Subscription> {
  if (sub.status === 'archived' || sub.status === 'suspended') {
    throw new ApiError(409, 'subscription_inactive', `Subscription is ${sub.status}`);
  }
  const [s] = sub.status === 'trialing'
    ? await tx<Subscription[]>`
        update public.subscriptions set plan_id = ${planId}, pending_plan_id = null, updated_at = now()
         where id = ${sub.id} returning *, period_start::text as period_start, period_end::text as period_end`
    : await tx<Subscription[]>`
        update public.subscriptions
           set pending_plan_id = case when ${planId} = plan_id then null else ${planId} end, updated_at = now()
         where id = ${sub.id} returning *, period_start::text as period_start, period_end::text as period_end`;
  return s;
}

/** Everything the billing page needs. */
export async function subscriptionSummary(tx: Tx, a: BillingAccount) {
  const sub = await currentSubscription(tx, a);
  if (!sub) return { subscription: null };
  const workspaces = await coveredWorkspaces(tx, sub);
  const [trial] = await tx<{ ends_at: Date; max_workspaces: number }[]>`
    select ends_at, max_workspaces from public.billing_trials where subscription_id = ${sub.id}`;
  const [due] = await tx<{ outstanding: number; overdue: number }[]>`
    select coalesce(sum(i.total_pkr - coalesce(p.paid, 0)), 0)::float as outstanding,
           count(*) filter (where i.status = 'overdue')::int as overdue
      from public.partner_invoices i
      left join lateral (select sum(amount_pkr) as paid from public.payments
                          where invoice_id = i.id and status = 'confirmed') p on true
     where i.subscription_id = ${sub.id} and i.status in ('issued', 'overdue')`;
  return {
    subscription: sub,
    plan: (await tx`select * from public.plans where id = ${sub.plan_id}`)[0],
    pending_plan: sub.pending_plan_id ? (await tx`select * from public.plans where id = ${sub.pending_plan_id}`)[0] : null,
    pending_plan_effective: sub.pending_plan_id ? sub.period_end : null,
    trial: trial ? { ends_at: trial.ends_at, free_workspaces: trial.max_workspaces, active: sub.status === 'trialing' } : null,
    workspaces: { count: workspaces.length, items: workspaces },
    outstanding_pkr: due.outstanding,
    overdue_invoices: due.overdue,
  };
}
