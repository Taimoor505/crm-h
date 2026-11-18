import { z } from 'zod';
import { ApiError, json, readJson } from '@/server/http';
import { billingRoute } from '@/server/billing/context';
import { coveredWorkspaces, monthStart, round2 } from '@/server/billing/core';
import { currentSubscription } from '@/server/billing/subscriptions';

const schema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  items: z.array(z.object({
    workspace_id: z.uuid(),
    amount_collected_pkr: z.number().min(0).max(1_000_000_000),
  })).min(1).max(500),
});

/**
 * PUT /billing/collections (commission plan): the partner reports what it
 * collected from each client in a month. Allowed for past or current months
 * until that month has been invoiced.
 */
export const PUT = billingRoute(async ({ req, tx, account, userId }) => {
  const body = await readJson(req, schema);
  const sub = await currentSubscription(tx, account);
  if (!sub || sub.plan_id !== 'commission') {
    throw new ApiError(409, 'not_commission_plan', 'Collections are only reported on the commission plan');
  }
  const month = `${body.month}-01`;
  if (month > (await monthStart(tx))) throw new ApiError(422, 'future_month', 'Cannot report a future month');

  const allowed = new Set((await coveredWorkspaces(tx, sub)).map((w) => w.id));
  const bad = body.items.filter((i) => !allowed.has(i.workspace_id)).map((i) => i.workspace_id);
  if (bad.length) throw new ApiError(422, 'invalid_workspaces', 'Not your client workspaces', { workspace_ids: bad });

  const [plan] = await tx<{ commission_rate: string; commission_min_pkr: string }[]>`
    select commission_rate, commission_min_pkr from public.plans where id = 'commission'`;
  const rate = Number(plan.commission_rate);
  const floor = Number(plan.commission_min_pkr);
  for (const i of body.items) {
    const share = round2(i.amount_collected_pkr * rate);
    const r = await tx`
      insert into public.commission_ledger
        (partner_id, workspace_id, period, amount_collected_pkr, rate, commission_pkr, floor_applied,
         status, reported_by, reported_at)
      values (${account.partnerId}, ${i.workspace_id}, ${month}, ${i.amount_collected_pkr}, ${rate},
              ${Math.max(share, floor)}, ${share < floor}, 'reported', ${userId}, now())
      on conflict (workspace_id, period) do update set
        amount_collected_pkr = excluded.amount_collected_pkr, rate = excluded.rate,
        commission_pkr = excluded.commission_pkr, floor_applied = excluded.floor_applied,
        reported_by = excluded.reported_by, reported_at = now()
      where public.commission_ledger.status = 'reported'`;
    if (r.count === 0) {
      throw new ApiError(409, 'already_invoiced', `${body.month} is already invoiced for workspace ${i.workspace_id}`);
    }
  }
  return json({ data: { month: body.month, reported: body.items.length } });
});
