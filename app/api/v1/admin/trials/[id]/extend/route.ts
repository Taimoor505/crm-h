import { z } from 'zod';
import { ApiError, json, readJson } from '@/server/http';
import { adminRoute } from '@/server/billing/context';
import { BILLING_TZ } from '@/server/billing/core';

const schema = z.object({ days: z.number().int().min(1).max(90) });

/**
 * POST /admin/trials/:id/extend (super-admins): add days to a subscription's
 * free trial. :id is the subscription id. Only while it's still trialing.
 */
export const POST = adminRoute<{ id: string }>(async ({ req, tx, params }) => {
  const body = await readJson(req, schema);
  const [s] = await tx<{ trial_ends_at: Date; period_end: string }[]>`
    update public.subscriptions
       set trial_ends_at = trial_ends_at + make_interval(days => ${body.days}),
           period_end = ((trial_ends_at + make_interval(days => ${body.days})) at time zone ${BILLING_TZ})::date + 1,
           updated_at = now()
     where id = ${params.id} and status = 'trialing'
    returning trial_ends_at, period_end::text`;
  if (!s) throw new ApiError(409, 'not_trialing', 'Subscription not found or no longer in its trial');
  await tx`update public.billing_trials set ends_at = ${s.trial_ends_at} where subscription_id = ${params.id}`;
  return json({ data: { subscription_id: params.id, trial_ends_at: s.trial_ends_at } });
});
