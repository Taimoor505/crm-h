import { z } from 'zod';
import type { Db } from '../db';
import { ApiError } from '../http';
import { logActivity } from '../core/contacts';
import { notify } from '../notifications/service';

export const TASK_TYPES = ['call', 'whatsapp', 'meeting', 'site_visit', 'other'] as const;
export type TaskType = (typeof TASK_TYPES)[number];
export type TaskOrigin = 'manual' | 'call_outcome' | 'task_completion' | 'automation';

export interface Task {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  deal_id: string | null;
  assigned_to: string;
  created_by: string | null;
  type: TaskType;
  title: string;
  notes: string | null;
  due_at: Date;
  status: 'open' | 'done' | 'cancelled';
  completed_at: Date | null;
  completed_by: string | null;
  outcome: string | null;
  origin: TaskOrigin;
  parent_task_id: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Shape of "create the next follow-up" used by tasks/:id/complete and call logging. */
export const followUpSchema = z.object({
  type: z.enum(TASK_TYPES).default('call'),
  due_at: z.iso.datetime({ offset: true }),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(5000).optional(),
  assigned_to: z.uuid().optional(),
});
export type FollowUpInput = z.infer<typeof followUpSchema>;

const VERB: Record<TaskType, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  meeting: 'Meeting with',
  site_visit: 'Site visit with',
  other: 'Follow up with',
};

export async function createTask(
  tx: Db,
  t: {
    workspaceId: string;
    contactId?: string | null;
    dealId?: string | null;
    assignedTo: string;
    createdBy: string | null;
    type: TaskType;
    title?: string | null;
    notes?: string | null;
    dueAt: string | Date;
    origin?: TaskOrigin;
    parentTaskId?: string | null;
  },
): Promise<Task> {
  let title = t.title?.trim();
  if (t.contactId) {
    // Visible-contact check (RLS applies when running as the user).
    const [c] = await tx<{ name: string | null; phone_e164: string | null }[]>`
      select name, phone_e164 from public.contacts
       where id = ${t.contactId} and workspace_id = ${t.workspaceId} and deleted_at is null`;
    if (!c) throw new ApiError(404, 'contact_not_found', 'Contact not found');
    title ||= `${VERB[t.type]} ${c.name ?? c.phone_e164 ?? 'contact'}`;
  }
  title ||= VERB[t.type].replace(/ with$/, '');

  const [assignee] = await tx<{ user_id: string }[]>`
    select user_id from public.memberships
     where workspace_id = ${t.workspaceId} and user_id = ${t.assignedTo} and status = 'active'`;
  if (!assignee) throw new ApiError(422, 'invalid_assignee', 'Assignee is not an active member of this workspace');

  const [task] = await tx<Task[]>`
    insert into public.tasks
      (workspace_id, contact_id, deal_id, assigned_to, created_by, type, title, notes, due_at,
       origin, parent_task_id)
    values (${t.workspaceId}, ${t.contactId ?? null}, ${t.dealId ?? null}, ${t.assignedTo},
            ${t.createdBy}, ${t.type}, ${title}, ${t.notes ?? null},
            ${new Date(t.dueAt).toISOString()}::timestamptz, ${t.origin ?? 'manual'},
            ${t.parentTaskId ?? null})
    returning *`;

  if (task.contact_id || task.deal_id) {
    await logActivity(tx, {
      workspaceId: t.workspaceId,
      contactId: task.contact_id,
      dealId: task.deal_id,
      type: 'task',
      actorId: t.createdBy,
      body: `Follow-up scheduled: ${task.title}`,
      meta: { action: 'created', task_id: task.id, task_type: task.type, due_at: task.due_at, origin: task.origin },
    });
  }

  if (task.assigned_to !== t.createdBy) {
    await notify(tx, {
      workspaceId: t.workspaceId,
      userId: task.assigned_to,
      type: 'task.assigned',
      title: `New task: ${task.title}`,
      data: { task_id: task.id, contact_id: task.contact_id, due_at: task.due_at },
    });
  }
  return task;
}

/**
 * Marks a task done, logs it on the timeline (a completed call/WhatsApp/meeting
 * counts as a response to the lead) and optionally creates the next follow-up.
 */
export async function completeTask(
  tx: Db,
  args: { task: Task; actorId: string; outcome?: string | null; note?: string | null; next?: FollowUpInput | null },
): Promise<{ task: Task; next: Task | null }> {
  const { task, actorId } = args;
  if (task.status !== 'open') {
    throw new ApiError(409, 'task_not_open', `Task is already ${task.status}`);
  }
  const [done] = await tx<Task[]>`
    update public.tasks
       set status = 'done', completed_at = now(), completed_by = ${actorId},
           outcome = ${args.outcome ?? null}, updated_at = now()
     where id = ${task.id} and status = 'open'
    returning *`;
  if (!done) throw new ApiError(409, 'task_not_open', 'Task was completed by someone else');

  if (done.contact_id || done.deal_id) {
    await logActivity(tx, {
      workspaceId: done.workspace_id,
      contactId: done.contact_id,
      dealId: done.deal_id,
      type: 'task',
      actorId,
      body: [`Done: ${done.title}`, args.outcome ? `Outcome: ${args.outcome}` : null, args.note]
        .filter(Boolean)
        .join('\n'),
      meta: { action: 'completed', task_id: done.id, task_type: done.type, outcome: args.outcome ?? null },
    });
  }

  let next: Task | null = null;
  if (args.next) {
    next = await createTask(tx, {
      workspaceId: done.workspace_id,
      contactId: done.contact_id,
      dealId: done.deal_id,
      assignedTo: args.next.assigned_to ?? done.assigned_to,
      createdBy: actorId,
      type: args.next.type,
      title: args.next.title,
      notes: args.next.notes,
      dueAt: args.next.due_at,
      origin: 'task_completion',
      parentTaskId: done.id,
    });
  }
  return { task: done, next };
}

/**
 * For Taimoor's POST /contacts/:id/calls: when the request includes
 * `follow_up`, call this in the same transaction to create the next task.
 * The open call tasks on this contact assigned to the caller are left as-is;
 * the frontend completes them through /tasks/:id/complete.
 */
export async function createFollowUpFromCall(
  tx: Db,
  args: { workspaceId: string; contactId: string; actorId: string; followUp: FollowUpInput },
): Promise<Task> {
  return createTask(tx, {
    workspaceId: args.workspaceId,
    contactId: args.contactId,
    assignedTo: args.followUp.assigned_to ?? args.actorId,
    createdBy: args.actorId,
    type: args.followUp.type,
    title: args.followUp.title,
    notes: args.followUp.notes,
    dueAt: args.followUp.due_at,
    origin: 'call_outcome',
  });
}
