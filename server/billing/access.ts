import type { Tx } from '../db';
import { notify } from '../notifications/service';
import { ARCHIVE_DAYS, controlledWorkspaceIds, today, type Subscription } from './core';

async function owners(tx: Tx, workspaceIds: string[]) {
  if (workspaceIds.length === 0) return [];
  return tx<{ workspace_id: string; user_id: string }[]>`
    select workspace_id, user_id from public.memberships
     where workspace_id = any(${workspaceIds}::uuid[]) and status = 'active' and role in ('owner', 'manager')`;
}

/**
 * Scheduler job (hourly): unpaid invoices past their due date (issue + 7
 * days) make the subscription's workspaces read-only; 30 days after issue
 * they're archived (data kept, reads and export still work). Suspended
 * workspaces (admin action) are left alone. Owners and managers are told.
 */
export async function enforceBilling(tx: Tx): Promise<{ overdue: number; read_only: number; archived: number }> {
  const d = await today(tx);
  const overdue = await tx`
    update public.partner_invoices set status = 'overdue'
     where status = 'issued' and due_date < ${d}::date
    returning id`;

  const toReadOnly = await tx<(Subscription & { invoice_number: string })[]>`
    select distinct on (s.id) s.*, i.number as invoice_number
      from public.subscriptions s
      join public.partner_invoices i on i.subscription_id = s.id and i.status = 'overdue'
     where s.status in ('trialing', 'active')
     order by s.id, i.issue_date`;
  for (const s of toReadOnly) {
    await tx`update public.subscriptions set status = 'read_only', updated_at = now() where id = ${s.id}`;
    const ids = await controlledWorkspaceIds(tx, s);
    await tx`update public.workspaces set status = 'read_only' where id = any(${ids}::uuid[]) and status = 'active'`;
    for (const o of await owners(tx, ids)) {
      await notify(tx, {
        workspaceId: o.workspace_id, userId: o.user_id, type: 'billing.read_only', priority: 'urgent',
        title: 'Your CRM is read-only: invoice unpaid',
        body: `Invoice ${s.invoice_number} is overdue. Pay it to keep adding leads and follow-ups.`,
        dedupeKey: `billing.read_only:${s.id}:${s.invoice_number}`,
      });
    }
  }

  const toArchive = await tx<(Subscription & { invoice_number: string })[]>`
    select distinct on (s.id) s.*, i.number as invoice_number
      from public.subscriptions s
      join public.partner_invoices i on i.subscription_id = s.id and i.status = 'overdue'
     where s.status in ('trialing', 'active', 'read_only')
       and i.issue_date <= ${d}::date - ${ARCHIVE_DAYS}::int
     order by s.id, i.issue_date`;
  for (const s of toArchive) {
    await tx`update public.subscriptions set status = 'archived', updated_at = now() where id = ${s.id}`;
    const ids = await controlledWorkspaceIds(tx, s);
    await tx`update public.workspaces set status = 'archived'
              where id = any(${ids}::uuid[]) and status in ('active', 'read_only')`;
    for (const o of await owners(tx, ids)) {
      await notify(tx, {
        workspaceId: o.workspace_id, userId: o.user_id, type: 'billing.archived', priority: 'urgent',
        title: 'Your CRM has been archived: invoice unpaid for 30 days',
        body: 'Your data is safe and can still be exported. Pay the invoice to restore access.',
        dedupeKey: `billing.archived:${s.id}:${s.invoice_number}`,
      });
    }
  }
  // Workspaces created after their subscription was restricted follow it too
  // (one statement; only workspaces still 'active' are touched).
  await tx`
    update public.workspaces w set status = s.status
      from public.subscriptions s
     where s.status in ('read_only', 'archived') and w.status = 'active'
       and w.id in (select id from public.subscription_workspaces(s.id))`;
  return { overdue: overdue.count, read_only: toReadOnly.length, archived: toArchive.length };
}

/**
 * After a payment: if the subscription has no overdue invoices left, it and
 * its workspaces become active again (also from archived; data was kept).
 */
export async function restoreAccess(tx: Tx, subscriptionId: string): Promise<boolean> {
  const [s] = await tx<Subscription[]>`select * from public.subscriptions where id = ${subscriptionId} for update`;
  if (!s || !['read_only', 'archived'].includes(s.status)) return false;
  const [stillOverdue] = await tx`
    select 1 from public.partner_invoices where subscription_id = ${s.id} and status = 'overdue'`;
  if (stillOverdue) return false;
  const trialing = !!s.trial_ends_at && new Date(s.trial_ends_at) > new Date();
  await tx`update public.subscriptions set status = ${trialing ? 'trialing' : 'active'}, updated_at = now()
            where id = ${s.id}`;
  const ids = await controlledWorkspaceIds(tx, s);
  await tx`update public.workspaces set status = 'active'
            where id = any(${ids}::uuid[]) and status in ('read_only', 'archived')`;
  return true;
}

/** Admin: suspend (all workspaces blocked, even reads) or lift a suspension. */
export async function setSuspended(tx: Tx, partnerId: string, suspended: boolean): Promise<{ workspaces: number }> {
  if (suspended) {
    const w = await tx`update public.workspaces set status = 'suspended'
                        where partner_id = ${partnerId} and status <> 'suspended'`;
    await tx`update public.subscriptions set status = 'suspended', updated_at = now()
              where partner_id = ${partnerId} and status in ('trialing', 'active', 'read_only')`;
    return { workspaces: w.count };
  }
  const w = await tx`update public.workspaces set status = 'active' where partner_id = ${partnerId} and status = 'suspended'`;
  const subs = await tx`
    update public.subscriptions set status = case when trial_ends_at > now() then 'trialing' else 'active' end,
           updated_at = now()
     where partner_id = ${partnerId} and status = 'suspended'`;
  // Anything still unpaid goes straight back to read-only / archived.
  if (subs.count) await enforceBilling(tx);
  return { workspaces: w.count };
}


/** Admin: suspend or lift one workspace (e.g. a direct customer) and its own subscription. */
export async function setWorkspaceSuspended(tx: Tx, workspaceId: string, suspended: boolean): Promise<boolean> {
  const w = suspended
    ? await tx`update public.workspaces set status = 'suspended' where id = ${workspaceId} and status <> 'suspended'`
    : await tx`update public.workspaces set status = 'active' where id = ${workspaceId} and status = 'suspended'`;
  if (suspended) {
    await tx`update public.subscriptions set status = 'suspended', updated_at = now()
              where workspace_id = ${workspaceId} and status in ('trialing', 'active', 'read_only')`;
  } else {
    await tx`update public.subscriptions
                set status = case when trial_ends_at > now() then 'trialing' else 'active' end, updated_at = now()
              where workspace_id = ${workspaceId} and status = 'suspended'`;
    await enforceBilling(tx);
  }
  return w.count > 0;
}
