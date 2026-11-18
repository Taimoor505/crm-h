import { z } from 'zod';
import { json, readJson } from '@/server/http';
import { adminRoute } from '@/server/billing/context';
import { reviewPayment } from '@/server/billing/payments';

const schema = z.object({
  /** false rejects the payment (e.g. screenshot doesn't match the bank statement). */
  approve: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional(),
});

// POST /admin/payments/:id/confirm (super-admins)
export const POST = adminRoute<{ id: string }>(async ({ req, tx, params, userId }) => {
  const body = await readJson(req, schema);
  const result = await reviewPayment(tx, { paymentId: params.id, adminId: userId, approve: body.approve, notes: body.notes });
  return json({ data: { payment_id: params.id, ...result } });
});
