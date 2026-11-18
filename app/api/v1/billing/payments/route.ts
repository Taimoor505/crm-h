import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { env } from '@/server/env';
import { ApiError, json } from '@/server/http';
import { storage } from '@/server/storage';
import { billingRoute } from '@/server/billing/context';

const schema = z.object({
  invoice_id: z.uuid(),
  amount_pkr: z.coerce.number().positive().max(100_000_000),
  method: z.enum(['bank_transfer', 'jazzcash', 'easypaisa', 'card']),
  reference: z.string().trim().max(100).optional(),
});

const PROOF_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'application/pdf': 'pdf',
};
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/**
 * POST /billing/payments (multipart): report a payment with a transfer
 * screenshot (`proof`, image or PDF up to 5 MB). A super-admin confirms it.
 */
export const POST = billingRoute(async ({ req, tx, account, userId }) => {
  if (!(req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    throw new ApiError(415, 'multipart_required', 'Send multipart/form-data with a `proof` file');
  }
  const form = await req.formData();
  const proof = form.get('proof');
  const body = schema.parse(Object.fromEntries([...form.entries()].filter(([k, v]) => k !== 'proof' && typeof v === 'string')));
  if (!(proof instanceof File) || proof.size === 0) throw new ApiError(422, 'proof_required', 'Attach the transfer screenshot as `proof`');
  const ext = PROOF_TYPES[proof.type];
  if (!ext) throw new ApiError(422, 'invalid_proof', 'Proof must be a JPG, PNG, WebP, HEIC image or a PDF');
  if (proof.size > MAX_PROOF_BYTES) throw new ApiError(413, 'too_large', 'Proof over 5 MB');

  const [inv] = await tx<{ id: string; status: string; subscription_id: string }[]>`
    select id, status, subscription_id from public.partner_invoices
     where id = ${body.invoice_id} and partner_id = ${account.partnerId}
       and workspace_id is not distinct from ${account.workspaceId}::uuid`;
  if (!inv) throw new ApiError(404, 'invoice_not_found', 'Invoice not found');
  if (inv.status === 'paid' || inv.status === 'void') throw new ApiError(409, 'invoice_closed', `Invoice is ${inv.status}`);

  const uploaded = await storage().upload(env.paymentProofsBucket, `${account.partnerId}/${randomUUID()}.${ext}`, proof, proof.type);
  const [payment] = await tx`
    insert into public.payments
      (partner_id, subscription_id, invoice_id, amount_pkr, method, reference, proof_url, submitted_by)
    values (${account.partnerId}, ${inv.subscription_id}, ${inv.id}, ${body.amount_pkr}, ${body.method},
            ${body.reference ?? null}, ${uploaded.path}, ${userId})
    returning id, invoice_id, amount_pkr::float as amount_pkr, method, status, reference, created_at`;
  return json({ data: payment }, 201);
});

// GET /billing/payments: payments reported by this account.
export const GET = billingRoute(async ({ tx, account }) => {
  const rows = await tx`
    select p.id, p.invoice_id, i.number as invoice_number, p.amount_pkr::float as amount_pkr, p.method,
           p.status, p.reference, p.notes, p.created_at, p.confirmed_at
      from public.payments p left join public.partner_invoices i on i.id = p.invoice_id
     where p.partner_id = ${account.partnerId}
       and (i.workspace_id is not distinct from ${account.workspaceId}::uuid)
     order by p.created_at desc
     limit 100`;
  return json({ data: rows });
});
