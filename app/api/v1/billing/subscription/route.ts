import { z } from 'zod';
import { ApiError, json, readJson } from '@/server/http';
import { billingRoute } from '@/server/billing/context';
import { changePlan, currentSubscription, startSubscription, subscriptionSummary } from '@/server/billing/subscriptions';

// GET /billing/subscription: plan, trial, pending change, workspaces, amount due.
export const GET = billingRoute(async ({ tx, account }) => json({ data: await subscriptionSummary(tx, account) }));

const schema = z.object({
  plan_id: z.enum(['commission', 'monthly', 'quarterly', 'annual']),
  /**
   * NTN, CNIC or owner phone. Needed for the free first month, which is given
   * once per real business (a new brand name doesn't reset it).
   */
  identity: z.string().trim().min(5).max(30).optional(),
});

/**
 * POST /billing/subscription: start a subscription (free month if eligible,
 * otherwise invoiced now), or change plan (at the end of the paid period;
 * immediately during the trial).
 */
export const POST = billingRoute(async ({ req, tx, account, userId }) => {
  const body = await readJson(req, schema);
  const [plan] = await tx`select 1 from public.plans where id = ${body.plan_id} and is_active`;
  if (!plan) throw new ApiError(422, 'invalid_plan', 'Plan is not available');

  const current = await currentSubscription(tx, account);
  if (current && current.status !== 'archived') {
    // (An archived account is refused by startSubscription: pay to restore.)
    await changePlan(tx, current, body.plan_id);
    return json({ data: await subscriptionSummary(tx, account), changed: true });
  }
  const started = await startSubscription(tx, account, { planId: body.plan_id, identity: body.identity, userId });
  return json(
    { data: await subscriptionSummary(tx, account), trial: started.trial, invoice_id: started.invoice_id },
    201,
  );
});
