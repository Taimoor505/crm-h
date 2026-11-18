import { z } from 'zod';
import {
  ApiError, decodeCursor, encodeCursor, json, limitSchema, readJson, readQuery, userRoute,
} from '@/server/http';
import { createTask, TASK_TYPES, type Task } from '@/server/tasks/service';
import { dueCondition, taskSelect } from '@/server/tasks/queries';

const listSchema = z.object({
  /** 'me', a user id, or 'all' (managers). Agents always get their own. */
  assigned_to: z.union([z.enum(['me', 'all']), z.uuid()]).optional(),
  status: z.enum(['open', 'done', 'cancelled', 'all']).default('open'),
  due: z.enum(['today', 'overdue', 'upcoming']).optional(),
  contact_id: z.uuid().optional(),
  deal_id: z.uuid().optional(),
  limit: limitSchema,
  cursor: z.string().optional(),
});

// GET /tasks
export const GET = userRoute({}, async ({ req, tx, workspace, userId, isManager }) => {
  const q = readQuery(req, listSchema);
  const assignedTo = !isManager ? userId : q.assigned_to === 'me' ? userId : q.assigned_to === 'all' ? null : q.assigned_to ?? null;
  const status = q.due ? 'open' : q.status;
  const cursor = decodeCursor<{ d: string; id: string }>(q.cursor);

  const where = tx`and`.join([
    tx`t.workspace_id = ${workspace.id}`,
    assignedTo && tx`t.assigned_to = ${assignedTo}`,
    status !== 'all' && tx`t.status = ${status}`,
    q.due && dueCondition(tx, q.due, workspace.timezone),
    q.contact_id && tx`t.contact_id = ${q.contact_id}`,
    q.deal_id && tx`t.deal_id = ${q.deal_id}`,
    cursor && tx`(t.due_at, t.id) > (${cursor.d}::timestamptz, ${cursor.id}::uuid)`,
  ]);

  const rows = await tx<(Task & { contact: unknown; is_overdue: boolean; due_at_text: string })[]>`
    select ${taskSelect(tx)}, t.due_at::text as due_at_text
      from public.tasks t
      left join public.contacts c on c.id = t.contact_id
     where ${where}
     order by t.due_at, t.id
     limit ${q.limit + 1}`;

  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return json({
    data: page.map(({ due_at_text: _t, ...task }) => task),
    // Postgres text keeps microseconds, so the cursor never skips or repeats a row.
    next_cursor: rows.length > q.limit && last ? encodeCursor({ d: last.due_at_text, id: last.id }) : null,
  });
});

const createSchema = z.object({
  contact_id: z.uuid().nullable().optional(),
  deal_id: z.uuid().nullable().optional(),
  assigned_to: z.uuid().optional(),
  type: z.enum(TASK_TYPES),
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(5000).optional(),
  due_at: z.iso.datetime({ offset: true }),
});

// POST /tasks
export const POST = userRoute({}, async ({ req, tx, workspace, userId, isManager }) => {
  const body = await readJson(req, createSchema);
  const assignedTo = body.assigned_to ?? userId;
  if (assignedTo !== userId && !isManager) {
    throw new ApiError(403, 'forbidden', 'Agents can only create tasks for themselves');
  }
  const task = await createTask(tx, {
    workspaceId: workspace.id,
    contactId: body.contact_id,
    dealId: body.deal_id,
    assignedTo,
    createdBy: userId,
    type: body.type,
    title: body.title,
    notes: body.notes,
    dueAt: body.due_at,
  });
  return json({ data: task }, 201);
});
