import type { Db } from '../db';
import type { Contact } from '../core/contacts';
import { logActivity } from '../core/contacts';
import { notify, notifyManagers } from '../notifications/service';

export type AssignmentMode = 'manual' | 'round_robin' | 'by_source';

export interface AssignmentRules {
  workspace_id: string;
  mode: AssignmentMode;
  agent_ids: string[];
  source_map: Record<string, string[]>;
  fallback: 'round_robin' | 'unassigned';
  reassign_after_minutes: number | null;
  max_auto_reassigns: number;
  rr_state: Record<string, string>;
  updated_at?: Date | null;
}

export function defaultRules(workspaceId: string): AssignmentRules {
  return {
    workspace_id: workspaceId,
    mode: 'manual',
    agent_ids: [],
    source_map: {},
    fallback: 'round_robin',
    reassign_after_minutes: null,
    max_auto_reassigns: 2,
    rr_state: {},
    updated_at: null,
  };
}

/** Loads rules; with lock=true the row is locked so concurrent leads rotate correctly. */
export async function getRules(tx: Db, workspaceId: string, lock = false): Promise<AssignmentRules> {
  const rows = lock
    ? await tx<AssignmentRules[]>`select * from public.assignment_rules where workspace_id = ${workspaceId} for update`
    : await tx<AssignmentRules[]>`select * from public.assignment_rules where workspace_id = ${workspaceId}`;
  return rows[0] ?? defaultRules(workspaceId);
}

/** Of `candidateIds`, those who are active members and not marked unavailable. */
export async function eligibleUsers(tx: Db, workspaceId: string, candidateIds: string[]): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await tx<{ user_id: string }[]>`
    select m.user_id
      from public.memberships m
      left join public.agent_availability a
        on a.workspace_id = m.workspace_id and a.user_id = m.user_id
     where m.workspace_id = ${workspaceId}
       and m.status = 'active'
       and m.user_id = any(${candidateIds}::uuid[])
       and coalesce(a.available, true)`;
  return new Set(rows.map((r) => r.user_id));
}

/**
 * Next user after `last` in the configured order, skipping anyone not eligible
 * or excluded. Rotation keeps its place even when someone is temporarily off.
 */
export function nextInRotation(
  order: string[],
  last: string | undefined,
  eligible: Set<string>,
  exclude: Set<string> = new Set(),
): string | null {
  const n = order.length;
  if (n === 0) return null;
  const start = last ? order.indexOf(last) : -1;
  for (let i = 1; i <= n; i++) {
    const candidate = order[(((start + i) % n) + n) % n];
    if (eligible.has(candidate) && !exclude.has(candidate)) return candidate;
  }
  return null;
}

export interface Choice {
  userId: string;
  rule: 'round_robin' | 'by_source';
  rotationKey: string;
}

/**
 * Picks an assignee per the workspace rules and records the rotation position.
 * Returns null in manual mode or when nobody eligible is configured.
 * `rules` must have been loaded with lock=true in this transaction.
 */
export async function chooseAssignee(
  tx: Db,
  rules: AssignmentRules,
  lead: { sourceLabel?: string | null; leadSourceId?: string | null },
  exclude: string[] = [],
): Promise<Choice | null> {
  if (rules.mode === 'manual') return null;
  const excluded = new Set(exclude.filter(Boolean));

  const attempts: { order: string[]; key: string; rule: Choice['rule'] }[] = [];
  if (rules.mode === 'by_source') {
    for (const k of [lead.leadSourceId, lead.sourceLabel]) {
      if (k && rules.source_map[k]?.length) {
        attempts.push({ order: rules.source_map[k], key: `source:${k}`, rule: 'by_source' });
        break;
      }
    }
    if (rules.fallback === 'round_robin') attempts.push({ order: rules.agent_ids, key: '_pool', rule: 'round_robin' });
  } else {
    attempts.push({ order: rules.agent_ids, key: '_pool', rule: 'round_robin' });
  }

  for (const a of attempts) {
    const eligible = await eligibleUsers(tx, rules.workspace_id, a.order);
    const userId = nextInRotation(a.order, rules.rr_state[a.key], eligible, excluded);
    if (userId) {
      rules.rr_state = { ...rules.rr_state, [a.key]: userId };
      await tx`
        update public.assignment_rules
           set rr_state = jsonb_set(rr_state, ${[a.key]}::text[], to_jsonb(${userId}::text))
         where workspace_id = ${rules.workspace_id}`;
      return { userId, rule: a.rule, rotationKey: a.key };
    }
  }
  return null;
}

export type AssignReason = 'new_lead' | 'reenquiry' | 'manual' | 'auto_reassign' | 'self';

const urgentReasons: AssignReason[] = ['new_lead', 'reenquiry', 'auto_reassign'];

export function contactLabel(c: Pick<Contact, 'name' | 'phone_e164' | 'email'>): string {
  return c.name || c.phone_e164 || c.email || 'Unnamed lead';
}

/**
 * Sets the contact owner, writes an `assignment` activity and notifies the new
 * owner (unless they assigned it to themselves).
 */
export async function assignContact(
  tx: Db,
  args: {
    contact: Contact;
    toUserId: string | null;
    actorId: string | null;
    reason: AssignReason;
    rule?: string | null;
    sourceName?: string | null;
  },
): Promise<void> {
  const { contact, toUserId, actorId, reason } = args;
  await tx`
    update public.contacts
       set owner_id = ${toUserId}, assigned_at = ${toUserId ? new Date().toISOString() : null}::timestamptz,
           updated_at = now()
     where id = ${contact.id}`;

  await logActivity(tx, {
    workspaceId: contact.workspace_id,
    contactId: contact.id,
    type: 'assignment',
    actorId,
    body: toUserId ? null : 'Unassigned',
    meta: { from: contact.owner_id, to: toUserId, reason, rule: args.rule ?? null },
  });

  if (toUserId && toUserId !== actorId) {
    const label = contactLabel(contact);
    const titles: Record<AssignReason, string> = {
      new_lead: `New lead: ${label}`,
      reenquiry: `Lead enquired again: ${label}`,
      auto_reassign: `Lead reassigned to you: ${label}`,
      manual: `Lead assigned to you: ${label}`,
      self: `Lead assigned to you: ${label}`,
    };
    await notify(tx, {
      workspaceId: contact.workspace_id,
      userId: toUserId,
      type: 'lead.assigned',
      title: titles[reason],
      body: args.sourceName ? `via ${args.sourceName}` : null,
      data: { contact_id: contact.id, reason },
      priority: urgentReasons.includes(reason) ? 'urgent' : 'normal',
    });
  }
}

/**
 * Routes a new lead or a re-enquiry. A re-enquiry stays with its current owner
 * when they're still active and available (their untouched clock restarts);
 * otherwise the rules pick someone. With nobody to pick, managers are told.
 */
export async function routeLead(
  tx: Db,
  args: {
    contact: Contact;
    isReenquiry: boolean;
    sourceLabel?: string | null;
    sourceName?: string | null;
    leadSourceId?: string | null;
  },
): Promise<string | null> {
  const { contact, isReenquiry } = args;
  let ownerUnavailable = false;

  if (isReenquiry && contact.owner_id) {
    const eligible = await eligibleUsers(tx, contact.workspace_id, [contact.owner_id]);
    ownerUnavailable = !eligible.has(contact.owner_id);
    if (!ownerUnavailable) {
      await tx`update public.contacts set assigned_at = now() where id = ${contact.id}`;
      await notify(tx, {
        workspaceId: contact.workspace_id,
        userId: contact.owner_id,
        type: 'lead.reenquired',
        title: `Lead enquired again: ${contactLabel(contact)}`,
        body: args.sourceName ? `via ${args.sourceName}` : null,
        data: { contact_id: contact.id },
        priority: 'urgent',
      });
      return contact.owner_id;
    }
  }

  const rules = await getRules(tx, contact.workspace_id, true);
  const choice = await chooseAssignee(tx, rules, {
    sourceLabel: args.sourceLabel,
    leadSourceId: args.leadSourceId,
  });

  if (choice) {
    await assignContact(tx, {
      contact,
      toUserId: choice.userId,
      actorId: null,
      reason: isReenquiry ? 'reenquiry' : 'new_lead',
      rule: choice.rule,
      sourceName: args.sourceName,
    });
    return choice.userId;
  }

  if (!contact.owner_id || ownerUnavailable) {
    await notifyManagers(tx, {
      workspaceId: contact.workspace_id,
      type: 'lead.unassigned',
      title: `${isReenquiry ? 'Lead enquired again' : 'New lead'}, needs an owner: ${contactLabel(contact)}`,
      body: args.sourceName ? `via ${args.sourceName}` : null,
      data: { contact_id: contact.id },
      priority: 'urgent',
    });
  }
  return contact.owner_id;
}
