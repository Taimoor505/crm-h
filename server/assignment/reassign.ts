import type { Db } from '../db';
import type { Contact } from '../core/contacts';
import { assignContact, chooseAssignee, contactLabel, getRules } from './engine';
import { notify } from '../notifications/service';

/**
 * Scheduler job: reassign fresh leads nobody has touched within the
 * workspace's reassign_after_minutes (off unless a manager sets it).
 *
 * Only leads that enquired in the last 24h are considered, so switching the
 * setting on doesn't reshuffle old contacts. Idempotent: a reassigned lead gets
 * a new assigned_at, so a second run in the same minute finds nothing to do.
 */
export async function reassignUntouchedLeads(tx: Db): Promise<{ reassigned: number; stuck: number }> {
  const candidates = await tx<(Contact & { reassign_after_minutes: number })[]>`
    select c.*, r.reassign_after_minutes
      from public.contacts c
      join public.assignment_rules r on r.workspace_id = c.workspace_id
      join public.workspaces w on w.id = c.workspace_id
     where r.reassign_after_minutes is not null
       and r.mode <> 'manual'
       and w.status = 'active'
       and c.deleted_at is null
       and c.owner_id is not null
       and c.assigned_at < now() - make_interval(mins => r.reassign_after_minutes)
       and c.last_enquiry_at > now() - interval '24 hours'
       and (c.last_response_at is null or c.last_response_at < c.assigned_at)
       and c.auto_reassign_count < r.max_auto_reassigns
     order by c.assigned_at
     limit 200
       for update of c skip locked`;

  let reassigned = 0;
  let stuck = 0;
  for (const c of candidates) {
    const rules = await getRules(tx, c.workspace_id, true);
    const choice = await chooseAssignee(tx, rules, { sourceLabel: c.source }, [c.owner_id!]);
    if (!choice) {
      stuck++;
      continue;
    }
    await assignContact(tx, {
      contact: c,
      toUserId: choice.userId,
      actorId: null,
      reason: 'auto_reassign',
      rule: choice.rule,
      sourceName: `no response in ${c.reassign_after_minutes} min`,
    });
    await tx`update public.contacts set auto_reassign_count = auto_reassign_count + 1 where id = ${c.id}`;
    await notify(tx, {
      workspaceId: c.workspace_id,
      userId: c.owner_id!,
      type: 'lead.reassigned_away',
      title: `Lead moved to a colleague: ${contactLabel(c)}`,
      body: `No response within ${c.reassign_after_minutes} minutes`,
      data: { contact_id: c.id, to: choice.userId },
    });
    reassigned++;
  }
  return { reassigned, stuck };
}
