import { z } from 'zod';
import { json, readQuery } from '@/server/http';
import { storage } from '@/server/storage';
import { adminRoute } from '@/server/billing/context';

const schema = z.object({ status: z.enum(['pending', 'confirmed', 'rejected']).default('pending') });

// GET /admin/payments?status=pending (super-admins): the confirmation queue, with proof links.
export const GET = adminRoute(async ({ req, tx }) => {
  const q = readQuery(req, schema);
  const rows = await tx<{ proof_url: string | null }[]>`
    select p.id, p.partner_id, pa.name as partner_name, p.invoice_id, i.number as invoice_number,
           i.total_pkr::float as invoice_total_pkr, p.amount_pkr::float as amount_pkr, p.method, p.reference,
           p.status, p.proof_url, p.notes, p.created_at, p.confirmed_at, u.name as submitted_by_name
      from public.payments p
      join public.partners pa on pa.id = p.partner_id
      left join public.partner_invoices i on i.id = p.invoice_id
      left join public.users u on u.id = p.submitted_by
     where p.status = ${q.status}
     order by p.created_at ${q.status === 'pending' ? tx`asc` : tx`desc`}
     limit 200`;
  const data = await Promise.all(rows.map(async (r) => ({
    ...r,
    proof_download_url: r.proof_url ? await storage().signedUrl(r.proof_url, 15 * 60).catch(() => null) : null,
  })));
  return json({ data });
});
