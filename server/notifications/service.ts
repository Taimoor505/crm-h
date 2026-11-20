import { asService, jsonb, type Db } from '../db';

export interface NewNotification {
  workspaceId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
  priority?: 'normal' | 'urgent';
  dedupeKey?: string | null;
}

/**
 * Creates an in-app notification (and its delivery-log row). Works from a user
 * transaction too, via the SECURITY DEFINER create_notification() function.
 * Push and agent-WhatsApp channels hook in here in weeks 6-8.
 */
export async function notify(tx: Db, n: NewNotification): Promise<string | null> {
  const [row] = await asService(tx, () => tx<{ id: string | null }[]>`
    select public.create_notification(
      ${n.workspaceId}, ${n.userId}, ${n.type}, ${n.title}, ${n.body ?? null},
      ${jsonb(tx, n.data ?? {})}::jsonb, ${n.priority ?? 'normal'}, ${n.dedupeKey ?? null}
    ) as id`);
  return row?.id ?? null;
}

/** Notifies every active owner/manager of the workspace. */
export async function notifyManagers(
  tx: Db,
  n: Omit<NewNotification, 'userId'>,
  exceptUserId?: string | null,
): Promise<void> {
  const managers = await tx<{ user_id: string }[]>`
    select user_id from public.memberships
     where workspace_id = ${n.workspaceId} and status = 'active' and role in ('owner', 'manager')`;
  for (const m of managers) {
    if (m.user_id === exceptUserId) continue;
    await notify(tx, { ...n, userId: m.user_id });
  }
}
