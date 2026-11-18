import type { Tx } from '../db';
import { ApiError } from '../http';
import { restoreAccess } from './access';

/**
 * Super-admin confirms (or rejects) an uploaded payment. When the confirmed
 * payments cover the invoice it's marked paid, its commission rows settled,
 * and access is restored if nothing else is overdue.
 */
export async function reviewPayment(
  tx: Tx,
  args: { paymentId: string; adminId: string; approve: boolean; notes?: string | null },
) {
  const [p] = await tx<{ id: string; status: string; invoice_id: string | null; subscription_id: string | null }[]>`
    select id, status, invoice_id, subscription_id from public.payments where id = ${args.paymentId} for update`;
  if (!p) throw new ApiError(404, 'not_found', 'Payment not found');
  if (p.status !== 'pending') throw new ApiError(409, 'already_reviewed', `Payment is already ${p.status}`);

  await tx`
    update public.payments
       set status = ${args.approve ? 'confirmed' : 'rejected'}, confirmed_by = ${args.adminId},
           confirmed_at = now(), notes = coalesce(${args.notes ?? null}, notes)
     where id = ${p.id}`;
  if (!args.approve) return { status: 'rejected' as const, invoice_paid: false, access_restored: false };

  let invoicePaid = false;
  if (p.invoice_id) {
    const [inv] = await tx<{ paid: boolean }[]>`
      update public.partner_invoices i
         set status = 'paid', paid_at = now()
       where i.id = ${p.invoice_id} and i.status in ('issued', 'overdue')
         and (select coalesce(sum(amount_pkr), 0) from public.payments
               where invoice_id = i.id and status = 'confirmed') >= i.total_pkr
      returning true as paid`;
    invoicePaid = !!inv;
    if (invoicePaid) {
      await tx`update public.commission_ledger set status = 'settled', settled_at = now()
                where invoice_id = ${p.invoice_id}`;
    }
  }
  const restored = p.subscription_id ? await restoreAccess(tx, p.subscription_id) : false;
  return { status: 'confirmed' as const, invoice_paid: invoicePaid, access_restored: restored };
}
