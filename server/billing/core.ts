import type { Db } from '../db';

/** Billing calendar: months, issue and due dates are in this timezone. */
export const BILLING_TZ = process.env.BILLING_TIMEZONE ?? 'Asia/Karachi';
export const DUE_DAYS = 7;          // unpaid this long after issue → read-only
export const ARCHIVE_DAYS = 30;     // unpaid this long after issue → archived

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface Plan {
  id: string;
  name: string;
  billing_type: 'commission' | 'prepaid';
  period_months: number;
  price_per_period_pkr: string | null;
  commission_rate: string | null;
  commission_min_pkr: string | null;
}

export interface Subscription {
  id: string;
  partner_id: string;
  workspace_id: string | null;
  plan_id: string;
  status: 'trialing' | 'active' | 'read_only' | 'archived' | 'suspended' | 'cancelled';
  period_start: string;   // YYYY-MM-DD
  period_end: string;
  trial_ends_at: Date | null;
  pending_plan_id: string | null;
  created_at: Date;
}

/** Price per workspace per month: prepaid price spread over its period, or the commission floor. */
export function monthlyRate(plan: Plan): number {
  return plan.billing_type === 'prepaid'
    ? Number(plan.price_per_period_pkr) / plan.period_months
    : Number(plan.commission_min_pkr ?? 0);
}

export async function today(tx: Db): Promise<string> {
  const [r] = await tx<{ d: string }[]>`select (now() at time zone ${BILLING_TZ})::date::text as d`;
  return r.d;
}

export async function monthStart(tx: Db, of?: string): Promise<string> {
  const [r] = await tx<{ d: string }[]>`
    select date_trunc('month', coalesce(${of ?? null}::date, (now() at time zone ${BILLING_TZ})::date))::date::text as d`;
  return r.d;
}

export async function addMonths(tx: Db, date: string, months: number): Promise<string> {
  const [r] = await tx<{ d: string }[]>`select (${date}::date + make_interval(months => ${months}))::date::text as d`;
  return r.d;
}

/** Start of a calendar date in the billing timezone, as a timestamp. */
export async function dateStartTs(tx: Db, date: string): Promise<Date> {
  const [r] = await tx<{ t: Date }[]>`select (${date}::date::timestamp at time zone ${BILLING_TZ}) as t`;
  return r.t;
}

/**
 * Client workspaces a subscription pays for: its one workspace (direct
 * customer), or all of the partner's workspaces that don't have their own
 * subscription. Archived workspaces are not billed.
 */
export function coveredWorkspacesSql(tx: Db, sub: Pick<Subscription, 'id' | 'partner_id' | 'workspace_id'>) {
  return sub.workspace_id
    ? tx`select w.id, w.name, w.status, w.created_at from public.workspaces w
          where w.id = ${sub.workspace_id} and w.status <> 'archived'`
    : tx`select w.id, w.name, w.status, w.created_at from public.workspaces w
          where w.partner_id = ${sub.partner_id} and w.status <> 'archived'
            and not exists (select 1 from public.subscriptions s2
                             where s2.workspace_id = w.id and s2.id <> ${sub.id}
                               and s2.status not in ('cancelled', 'archived'))`;
}

export async function coveredWorkspaces(tx: Db, sub: Pick<Subscription, 'id' | 'partner_id' | 'workspace_id'>) {
  return tx<{ id: string; name: string; status: string; created_at: Date }[]>`
    select * from (${coveredWorkspacesSql(tx, sub)}) cw order by created_at, id`;
}

/** Workspace ids a subscription controls access for (incl. archived, for restore). */
export async function controlledWorkspaceIds(tx: Db, sub: Pick<Subscription, 'id' | 'partner_id' | 'workspace_id'>): Promise<string[]> {
  const rows = sub.workspace_id
    ? await tx<{ id: string }[]>`select id from public.workspaces where id = ${sub.workspace_id}`
    : await tx<{ id: string }[]>`
        select w.id from public.workspaces w
         where w.partner_id = ${sub.partner_id}
           and not exists (select 1 from public.subscriptions s2
                            where s2.workspace_id = w.id and s2.id <> ${sub.id}
                              and s2.status not in ('cancelled', 'archived'))`;
  return rows.map((r) => r.id);
}

export function monthLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function pkr(n: number): string {
  return `Rs. ${n.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}
