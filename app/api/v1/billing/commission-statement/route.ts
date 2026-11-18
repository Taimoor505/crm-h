import { z } from 'zod';
import { json, readQuery } from '@/server/http';
import { billingRoute } from '@/server/billing/context';
import { coveredWorkspaces, monthStart, round2 } from '@/server/billing/core';
import { currentSubscription } from '@/server/billing/subscriptions';

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() });

/**
 * GET /billing/commission-statement?month=YYYY-MM (default: last month).
 * Per client workspace: collected retail, rate, commission (with the monthly
 * floor) and status (reported / invoiced / settled). Months not yet invoiced
 * are estimated from what has been reported so far.
 */
export const GET = billingRoute(async ({ req, tx, account }) => {
  const q = readQuery(req, schema);
  const month = q.month ? `${q.month}-01` : (await tx<{ d: string }[]>`
    select ((${await monthStart(tx)}::date) - interval '1 month')::date::text as d`)[0].d;
  const sub = await currentSubscription(tx, account);
  const [plan] = await tx<{ id: string; commission_rate: string | null; commission_min_pkr: string | null }[]>`
    select id, commission_rate, commission_min_pkr from public.plans where id = 'commission'`;
  const rate = Number(plan.commission_rate);
  const floor = Number(plan.commission_min_pkr);
  const workspaces = sub ? await coveredWorkspaces(tx, sub) : [];
  const ledger = await tx<{ workspace_id: string; amount_collected_pkr: string; rate: string; commission_pkr: string;
    floor_applied: boolean; status: string; invoice_id: string | null }[]>`
    select workspace_id, amount_collected_pkr, rate, commission_pkr, floor_applied, status, invoice_id
      from public.commission_ledger
     where partner_id = ${account.partnerId} and period = ${month}
       and workspace_id = any(${workspaces.map((w) => w.id)}::uuid[])`;

  const rows = workspaces.map((w) => {
    const l = ledger.find((x) => x.workspace_id === w.id);
    const collected = Number(l?.amount_collected_pkr ?? 0);
    const share = round2(collected * rate);
    const commission = l && l.status !== 'reported' ? Number(l.commission_pkr) : Math.max(share, floor);
    return {
      workspace_id: w.id,
      workspace_name: w.name,
      amount_collected_pkr: collected,
      rate,
      commission_pkr: commission,
      floor_applied: share < floor,
      status: l?.status ?? 'not_reported',
      invoice_id: l?.invoice_id ?? null,
    };
  });
  return json({
    data: {
      month: month.slice(0, 7),
      plan: sub?.plan_id ?? null,
      applies: sub?.plan_id === 'commission',
      rate,
      monthly_minimum_pkr: floor,
      workspaces: rows,
      total_collected_pkr: round2(rows.reduce((s, r) => s + r.amount_collected_pkr, 0)),
      total_commission_pkr: round2(rows.reduce((s, r) => s + r.commission_pkr, 0)),
    },
    currency: 'PKR',
  });
});
