import type { Db } from '../db';
import { ApiError } from '../http';
import { dealSelect, type DealRow } from './crm';

/** A live deal the caller may see (agents: deals they own or on their leads). */
export async function visibleDeal(tx: Db, workspaceId: string, id: string, userId: string, isManager: boolean): Promise<DealRow> {
  const [d] = await tx<(DealRow & { contact_owner: string | null })[]>`
    ${dealSelect(tx)}
    where d.id = ${id} and d.workspace_id = ${workspaceId} and d.deleted_at is null`;
  if (!d) throw new ApiError(404, 'not_found', 'Deal not found');
  if (!isManager && d.owner_id !== userId) throw new ApiError(403, 'forbidden', 'This deal belongs to someone else');
  return d;
}

export async function reloadDeal(tx: Db, id: string): Promise<DealRow> {
  const [d] = await tx<DealRow[]>`${dealSelect(tx)} where d.id = ${id}`;
  return d;
}
