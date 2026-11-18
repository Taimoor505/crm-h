import { json } from '@/server/http';
import { billingRoute } from '@/server/billing/context';

// GET /billing/invoices: latest 36 invoices with lines and payments.
export const GET = billingRoute(async ({ tx, account }) => {
  const invoices = await tx`
    select i.id, i.number, i.period_start::text, i.period_end::text, i.issue_date::text, i.due_date::text,
           i.status, i.total_pkr::float as total_pkr, i.paid_at,
           coalesce((select sum(p.amount_pkr) from public.payments p
                      where p.invoice_id = i.id and p.status = 'confirmed'), 0)::float as paid_pkr,
           coalesce((select json_agg(json_build_object(
                       'workspace_id', l.workspace_id, 'kind', l.kind, 'description', l.description,
                       'quantity', l.quantity::float, 'unit_price_pkr', l.unit_price_pkr::float,
                       'amount_pkr', l.amount_pkr::float) order by l.kind, l.description)
                      from public.invoice_lines l where l.invoice_id = i.id), '[]') as lines,
           coalesce((select json_agg(json_build_object(
                       'id', p.id, 'amount_pkr', p.amount_pkr::float, 'method', p.method, 'status', p.status,
                       'created_at', p.created_at) order by p.created_at)
                      from public.payments p where p.invoice_id = i.id), '[]') as payments
      from public.partner_invoices i
     where i.partner_id = ${account.partnerId}
       and i.workspace_id is not distinct from ${account.workspaceId}::uuid
       and i.status <> 'void'
     order by i.issue_date desc, i.number desc
     limit 36`;
  return json({ data: invoices, currency: 'PKR' });
});
