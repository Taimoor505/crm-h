import { z } from 'zod';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { notify } from '@/server/notifications/service';
import { logActivity } from '@/server/core/contacts';
import { TASK_TYPES, type Task } from '@/server/tasks/service';

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    notes: z.string().max(5000).nullable().optional(),
    type: z.enum(TASK_TYPES).optional(),
    due_at: z.iso.datetime({ offset: true }).optional(),
    assigned_to: z.uuid().optional(),
    /** Cancel or reopen. Completing goes through POST /tasks/:id/complete. */
    status: z.enum(['open', 'cancelled']).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to update' });

// PATCH /tasks/:id
export const PATCH = userRoute<{ id: string }>({}, async ({ req, tx, workspace, userId, isManager, params }) => {
  const body = await readJson(req, patchSchema);
  const [task] = await tx<Task[]>`
    select * from public.tasks where id = ${params.id} and workspace_id = ${workspace.id} for update`;
  if (!task) throw new ApiError(404, 'not_found', 'Task not found');
  if (!isManager && task.assigned_to !== userId) {
    throw new ApiError(403, 'forbidden', 'You can only edit tasks assigned to you');
  }
  if (body.assigned_to && body.assigned_to !== task.assigned_to) {
    if (!isManager) throw new ApiError(403, 'forbidden', 'Only managers can reassign tasks');
    const [m] = await tx`select 1 from public.memberships
                          where workspace_id = ${workspace.id} and user_id = ${body.assigned_to} and status = 'active'`;
    if (!m) throw new ApiError(422, 'invalid_assignee', 'Assignee is not an active member of this workspace');
  }
  if (task.status === 'done' && body.status === 'open') {
    throw new ApiError(409, 'task_done', 'Completed tasks cannot be reopened; create a new follow-up');
  }

  const dueChanged = body.due_at && new Date(body.due_at).getTime() !== new Date(task.due_at).getTime();
  const [updated] = await tx<Task[]>`
    update public.tasks set
      title = coalesce(${body.title ?? null}, title),
      notes = ${body.notes === undefined ? task.notes : body.notes},
      type = coalesce(${body.type ?? null}, type),
      due_at = coalesce(${body.due_at ?? null}::timestamptz, due_at),
      assigned_to = coalesce(${body.assigned_to ?? null}::uuid, assigned_to),
      status = coalesce(${body.status ?? null}, status),
      -- Rescheduled tasks get their reminder again.
      reminder_sent_at = case when ${!!dueChanged}::boolean then null else reminder_sent_at end,
      overdue_notified_at = case when ${!!dueChanged}::boolean then null else overdue_notified_at end,
      updated_at = now()
    where id = ${task.id}
    returning *`;

  if (updated.assigned_to !== task.assigned_to && updated.assigned_to !== userId) {
    await notify(tx, {
      workspaceId: workspace.id,
      userId: updated.assigned_to,
      type: 'task.assigned',
      title: `New task: ${updated.title}`,
      data: { task_id: updated.id, contact_id: updated.contact_id, due_at: updated.due_at },
    });
  }
  if (updated.status === 'cancelled' && task.status !== 'cancelled' && (updated.contact_id || updated.deal_id)) {
    await logActivity(tx, {
      workspaceId: workspace.id,
      contactId: updated.contact_id,
      dealId: updated.deal_id,
      type: 'task',
      actorId: userId,
      body: `Cancelled: ${updated.title}`,
      meta: { action: 'cancelled', task_id: updated.id, task_type: updated.type },
    });
  }
  return json({ data: updated });
});
