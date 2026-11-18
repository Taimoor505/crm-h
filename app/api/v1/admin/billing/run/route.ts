import { z } from 'zod';
import { json, readJson } from '@/server/http';
import { adminRoute } from '@/server/billing/context';
import { runMonthlyBilling } from '@/server/billing/run';
import { enforceBilling } from '@/server/billing/access';

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() });

/**
 * POST /admin/billing/run (super-admins): run the monthly billing now (it
 * also runs on its own on the 1st). Safe to repeat: accounts already billed
 * for that month are skipped. Then applies the read-only/archive rules.
 */
export const POST = adminRoute(async ({ req, tx }) => {
  const body = await readJson(req, schema);
  const run = await runMonthlyBilling(tx, body.month ? `${body.month}-01` : undefined);
  const enforcement = await enforceBilling(tx);
  return json({ data: { ...run, enforcement } });
});
