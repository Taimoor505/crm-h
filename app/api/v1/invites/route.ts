import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { gotrue } from '@/server/identity/gotrue';
import { callbackUrl } from '@/server/identity/routes';

const schema = z.object({
  name: z.string().trim().max(80).default(''),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  role: z.enum(['owner', 'manager', 'agent']).default('agent'),
});

/**
 * POST /invites (owner/manager): adds someone by email. New people get a
 * Supabase invite email with a link to set their password; people who
 * already have an account are added straight away.
 */
export const POST = userRoute({ managerOnly: true }, async ({ req, tx, workspace, userId }) => {
  const b = await readJson(req, schema);
  if (b.role === 'owner' && workspace.role !== 'owner') throw new ApiError(403, 'forbidden', 'Only owners can add another owner');
  await elevate(tx);
  let [user] = await tx<{ id: string }[]>`select id from public.users where lower(email) = ${b.email}`;
  let invited = false;
  if (!user) {
    const r = await gotrue().invite(b.email, b.name, callbackUrl(req, '/set-password'));
    [user] = await tx<{ id: string }[]>`
      insert into public.users (id, email, name) values (${r.userId}, ${b.email}, ${b.name})
      on conflict (id) do update set name = coalesce(nullif(public.users.name, ''), excluded.name)
      returning id`;
    invited = true;
  }
  const [existing] = await tx<{ id: string; status: string }[]>`
    select id, status from public.memberships where workspace_id = ${workspace.id} and user_id = ${user.id}`;
  if (existing && existing.status === 'active') throw new ApiError(409, 'already_member', 'Already a member of this workspace');
  const [membership] = existing
    ? await tx`update public.memberships set status = 'active', role = ${b.role} where id = ${existing.id} returning *`
    : await tx`insert into public.memberships (workspace_id, user_id, role) values (${workspace.id}, ${user.id}, ${b.role}) returning *`;
  await tx`
    insert into public.activities (workspace_id, type, actor_id, body, meta)
    values (${workspace.id}, 'system', ${userId}, ${`Added ${b.email} as ${b.role}`}, ${tx.json({ kind: 'member_added', user_id: user.id })})`;
  return json({ membership, invited }, 201);
});
