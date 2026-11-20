import { elevate } from '@/server/db';
import { ApiError, json, userRoute } from '@/server/http';

// GET /workspaces/:id/members: everyone in the workspace (names for owners, pickers, reports).
export const GET = userRoute<{ id: string }>({ allowWhenReadOnly: true }, async ({ params, tx, workspace, isManager }) => {
  if (params.id !== workspace.id) throw new ApiError(400, 'workspace_mismatch', 'URL workspace does not match X-Workspace-Id');
  await elevate(tx);
  const rows = await tx<{ id: string; user_id: string; workspace_id: string; role: string; status: string; created_at: Date;
    name: string; phone: string | null; email: string }[]>`
    select m.id, m.user_id, m.workspace_id, m.role, m.status, m.created_at, u.name, u.phone, u.email
      from public.memberships m join public.users u on u.id = m.user_id
     where m.workspace_id = ${workspace.id} ${isManager ? tx`` : tx`and m.status = 'active'`}
     order by case m.role when 'owner' then 0 when 'manager' then 1 else 2 end, u.name`;
  return json({
    data: rows.map((r) => ({
      id: r.id, user_id: r.user_id, workspace_id: r.workspace_id, role: r.role, status: r.status,
      created_at: r.created_at.toISOString(),
      user: { id: r.user_id, name: r.name, phone: r.phone, email: r.email, locale: 'en' },
    })),
  });
});
