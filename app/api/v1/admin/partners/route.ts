import { z } from 'zod';
import { json, readQuery } from '@/server/http';
import { adminRoute } from '@/server/billing/context';

const schema = z.object({
  status: z.enum(['trialing', 'active', 'read_only', 'archived', 'suspended', 'cancelled', 'none']).optional(),
  q: z.string().trim().max(100).optional(),
});

/**
 * GET /admin/partners (super-admins): every partner with its subscriptions,
 * client workspace count, outstanding balance and last payment.
 */
export const GET = adminRoute(async ({ req, tx }) => {
  const q = readQuery(req, schema);
  const rows = await tx`
    select p.id, p.name, p.is_house, p.status as partner_status, p.created_at,
           (select count(*) from public.workspaces w where w.partner_id = p.id and w.status <> 'archived')::int
             as workspaces,
           (select count(*) from public.workspaces w where w.partner_id = p.id and w.status = 'read_only')::int
             as read_only_workspaces,
           coalesce((select json_agg(json_build_object(
                'id', s.id, 'workspace_id', s.workspace_id, 'plan_id', s.plan_id, 'status', s.status,
                'period_start', s.period_start, 'period_end', s.period_end, 'trial_ends_at', s.trial_ends_at,
                'pending_plan_id', s.pending_plan_id) order by s.created_at desc)
              from public.subscriptions s where s.partner_id = p.id and s.status <> 'cancelled'), '[]') as subscriptions,
           (select coalesce(sum(i.total_pkr), 0) - coalesce(sum(pp.paid), 0)
              from public.partner_invoices i
              left join lateral (select sum(amount_pkr) as paid from public.payments
                                  where invoice_id = i.id and status = 'confirmed') pp on true
             where i.partner_id = p.id and i.status in ('issued', 'overdue'))::float as outstanding_pkr,
           (select count(*) from public.partner_invoices i where i.partner_id = p.id and i.status = 'overdue')::int
             as overdue_invoices,
           (select count(*) from public.payments x where x.partner_id = p.id and x.status = 'pending')::int
             as pending_payments,
           (select max(confirmed_at) from public.payments x where x.partner_id = p.id and x.status = 'confirmed')
             as last_payment_at
      from public.partners p
     where (${q.q ?? null}::text is null or p.name ilike '%' || ${q.q ?? null} || '%')
       and (${q.status ?? null}::text is null
            or (${q.status ?? null} = 'none' and not exists (select 1 from public.subscriptions s where s.partner_id = p.id))
            or exists (select 1 from public.subscriptions s where s.partner_id = p.id and s.status = ${q.status ?? null}))
     order by overdue_invoices desc, p.name
     limit 500`;
  return json({ data: rows });
});
