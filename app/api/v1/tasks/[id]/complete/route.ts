import { z } from 'zod';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { completeTask, followUpSchema, type Task } from '@/server/tasks/service';

const schema = z.object({
  /** Free text or a short code, e.g. "interested", "no_answer", "visit_booked". */
  outcome: z.string().trim().max(100).optional(),
  note: z.string().trim().max(5000).optional(),
  /** Create the next follow-up in the same request. */
  next: followUpSchema.optional(),
});

// POST /tasks/:id/complete
export const POST = userRoute<{ id: string }>({}, async ({ req, tx, workspace, userId, isManager, params }) => {
  const body = await readJson(req, schema);
  const [task] = await tx<Task[]>`
    select * from public.tasks where id = ${params.id} and workspace_id = ${workspace.id} for update`;
  if (!task) throw new ApiError(404, 'not_found', 'Task not found');
  if (!isManager && task.assigned_to !== userId) {
    throw new ApiError(403, 'forbidden', 'You can only complete tasks assigned to you');
  }
  if (body.next?.assigned_to && body.next.assigned_to !== userId && !isManager) {
    throw new ApiError(403, 'forbidden', 'Agents can only create follow-ups for themselves');
  }
  const result = await completeTask(tx, {
    task,
    actorId: userId,
    outcome: body.outcome,
    note: body.note,
    next: body.next ?? null,
  });
  return json({ data: result });
});
