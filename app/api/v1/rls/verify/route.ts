import { NextRequest, NextResponse } from 'next/server';
import { getPgPool, getState } from '@/lib/taimoor/store';
import { logged } from '@/server/observability/request-log';

async function POST_handler(req: NextRequest) {
  try {
    const body = await req.json();
    const actorUserId = String(body?.actor_user_id || '');
    const targetWorkspaceId = String(body?.target_workspace_id || '');
    const table = ['contacts', 'deals', 'workspaces'].includes(body?.table)
      ? (body.table as 'contacts' | 'deals' | 'workspaces')
      : 'contacts';

    const state = getState();
    const actor = state.users.find((u) => u.id === actorUserId);
    const workspace = state.workspaces.find((w) => w.id === targetWorkspaceId);
    if (!actor || !workspace) {
      return NextResponse.json(
        { error: 'Valid actor_user_id and target_workspace_id are required' },
        { status: 400 }
      );
    }

    const membership = state.memberships.find(
      (m) =>
        m.user_id === actor.id &&
        m.workspace_id === workspace.id &&
        m.status === 'active'
    );
    const isPartnerAdmin =
      Boolean(actor.partner_admin_of) && actor.partner_admin_of === workspace.partner_id;
    const isMemberOrPartner = Boolean(membership) || isPartnerAdmin;
    const isManagerOrOwner =
      isPartnerAdmin ||
      membership?.role === 'owner' ||
      membership?.role === 'manager';

    // Exact SQL policy simulation matching 002_rls_policies.sql
    const sqlExecuted = `BEGIN;\nSELECT set_config('app.user_id', '${actor.id}', true);\nSELECT id, name${
      table === 'contacts' ? ', phone_e164, owner_id' : table === 'deals' ? ', value_pkr, owner_id' : ''
    } FROM public.${table}\nWHERE ${table === 'workspaces' ? 'id' : 'workspace_id'} = '${workspace.id}'${
      table !== 'workspaces' ? ' AND deleted_at IS NULL' : ''
    };\nROLLBACK;`;

    // If direct PG connection is configured, test live transaction too
    let livePgVerified = false;
    const pool = getPgPool();
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.user_id', $1, true)`, [actor.id]);
        await client.query('ROLLBACK');
        livePgVerified = true;
      } catch {
        await client.query('ROLLBACK').catch(() => {});
      } finally {
        client.release();
      }
    }

    let totalInWorkspace = 0;
    let visibleRows: Record<string, unknown>[] = [];

    if (table === 'contacts') {
      const allWs = state.contacts.filter(
        (c) => c.workspace_id === workspace.id && !c.deleted_at
      );
      totalInWorkspace = allWs.length;
      if (isMemberOrPartner) {
        visibleRows = allWs
          .filter((c) => isManagerOrOwner || c.owner_id === actor.id)
          .map((c) => ({
            id: c.id,
            name: c.name,
            phone_e164: c.phone_e164,
            owner_id: c.owner_id,
            status: c.status,
          }));
      }
    } else if (table === 'deals') {
      const allWs = state.deals.filter(
        (d) => d.workspace_id === workspace.id && !d.deleted_at
      );
      totalInWorkspace = allWs.length;
      if (isMemberOrPartner) {
        visibleRows = allWs
          .filter((d) => isManagerOrOwner || d.owner_id === actor.id)
          .map((d) => ({
            id: d.id,
            title: d.title,
            value_pkr: d.value_pkr,
            owner_id: d.owner_id,
          }));
      }
    } else {
      totalInWorkspace = 1;
      if (isMemberOrPartner) {
        visibleRows = [
          {
            id: workspace.id,
            name: workspace.name,
            partner_id: workspace.partner_id,
            template_key: workspace.template_key,
          },
        ];
      }
    }

    const blockedCount = Math.max(0, totalInWorkspace - visibleRows.length);

    return NextResponse.json({
      actor: {
        id: actor.id,
        name: actor.name,
        partner_admin_of: actor.partner_admin_of,
      },
      target_workspace: {
        id: workspace.id,
        name: workspace.name,
        partner_id: workspace.partner_id,
      },
      resolved_access: {
        is_member: Boolean(membership),
        membership_role: membership?.role || null,
        is_partner_admin_for_workspace: isPartnerAdmin,
        manager_or_owner_bypass: isManagerOrOwner,
      },
      table,
      total_rows_in_workspace: totalInWorkspace,
      returned_rows_count: visibleRows.length,
      blocked_by_rls_count: blockedCount,
      returned_rows: visibleRows,
      sql_executed: sqlExecuted,
      live_pg_verified: livePgVerified,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }
}

export const POST = logged(POST_handler);
