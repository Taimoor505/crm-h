import type { Db } from '../db';
import { ApiError } from '../http';

/** The partner the signed-in user administers, or 403. Super admins may pass X-Partner-Id. */
export async function partnerOf(tx: Db, userId: string, req: Request): Promise<string> {
  const [u] = await tx<{ partner_admin_of: string | null; super: boolean }[]>`
    select partner_admin_of, exists (select 1 from public.platform_admins where user_id = ${userId}) as super
      from public.users where id = ${userId}`;
  const asked = req.headers.get('x-partner-id');
  if (u?.super && asked && /^[0-9a-f-]{36}$/i.test(asked)) return asked;
  if (!u?.partner_admin_of) throw new ApiError(403, 'forbidden', 'Partner admins only');
  return u.partner_admin_of;
}
