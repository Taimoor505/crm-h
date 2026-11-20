import { z } from 'zod';
import { elevate } from '@/server/db';
import { json, readQuery, userRoute } from '@/server/http';
import { normalizePhone } from '@/server/core/phone';
import { loadWorkspace } from '@/server/core/workspaces';

// GET /contacts/check-duplicate?phone=&country=: live check while typing a new lead.
export const GET = userRoute({ allowWhenReadOnly: true }, async ({ req, tx, workspace, userId, isManager }) => {
  const q = readQuery(req, z.object({ phone: z.string().max(30).default(''), country: z.string().length(2).optional() }));
  const ws = await loadWorkspace(tx, workspace.id);
  const e164 = normalizePhone(q.phone, q.country ?? ws.default_phone_country);
  await elevate(tx);
  const [c] = e164
    ? await tx<{ id: string; name: string; phone_e164: string; owner_id: string | null; status: string }[]>`
        select id, name, phone_e164, owner_id, status from public.contacts
         where workspace_id = ${workspace.id} and phone_e164 = ${e164} and deleted_at is null`
    : [];
  // Agents learn a duplicate exists and who owns it, but not someone else's lead details.
  const visible = c && (isManager || c.owner_id === userId);
  return json({
    input: q.phone,
    normalized_e164: e164,
    duplicate_found: Boolean(c),
    existing_contact: c ? (visible ? c : { id: c.id, name: null, phone_e164: c.phone_e164, owner_id: c.owner_id, status: c.status }) : null,
  });
});
