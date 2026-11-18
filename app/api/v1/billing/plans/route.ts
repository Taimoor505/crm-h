import { authRoute, json } from '@/server/http';

// GET /billing/plans: the four plans with their current prices (any signed-in user).
export const GET = authRoute(async ({ tx }) => {
  const plans = await tx`
    select id, name, billing_type, period_months,
           price_per_period_pkr::float as price_per_period_pkr,
           case when price_per_period_pkr is null then null
                else round(price_per_period_pkr / period_months, 2)::float end as price_per_month_pkr,
           commission_rate::float as commission_rate,
           commission_min_pkr::float as commission_min_pkr
      from public.plans
     where is_active
     order by period_months, id`;
  return json({
    data: plans,
    currency: 'PKR',
    notes: 'Per client workspace. First month free for new partners (up to 5 workspaces). WhatsApp messages billed at cost on every plan.',
  });
});
