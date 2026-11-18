import { z } from 'zod';
import { ApiError, json, readQuery, userRoute } from '@/server/http';
import { todayBounds } from '@/server/tasks/queries';

const schema = z.object({
  /** 'me' = my leads and tasks (default). 'team' = whole workspace (managers). */
  scope: z.enum(['me', 'team']).default('me'),
});

/**
 * GET /home/summary: everything the home screen needs in one round trip.
 * Agents only ever see their own numbers (also enforced by RLS).
 */
export const GET = userRoute({}, async ({ req, tx, workspace, userId, isManager }) => {
  const { scope } = readQuery(req, schema);
  if (scope === 'team' && !isManager) throw new ApiError(403, 'forbidden', 'Team view is for managers');
  const mine = scope === 'me';
  const { start, end } = todayBounds(tx, workspace.timezone);
  const taskScope = mine ? tx`and t.assigned_to = ${userId}` : tx``;
  const leadScope = mine ? tx`and c.owner_id = ${userId}` : tx``;

  const [tasks] = await tx<{ overdue: number; due_today: number; upcoming: number }[]>`
    select
      count(*) filter (where t.due_at < now())::int as overdue,
      count(*) filter (where t.due_at >= now() and t.due_at < ${end})::int as due_today,
      count(*) filter (where t.due_at >= ${end})::int as upcoming
    from public.tasks t
    where t.workspace_id = ${workspace.id} and t.status = 'open' ${taskScope}`;

  const nextTasks = await tx`
    select t.id, t.type, t.title, t.due_at, t.assigned_to, t.contact_id,
           c.name as contact_name, c.phone_e164 as contact_phone,
           t.due_at < now() as is_overdue
      from public.tasks t
      left join public.contacts c on c.id = t.contact_id
     where t.workspace_id = ${workspace.id} and t.status = 'open' and t.due_at < ${end} ${taskScope}
     order by t.due_at
     limit 10`;

  const [leads] = await tx<{ new_today: number; awaiting_first_response: number; unassigned: number }[]>`
    select
      count(*) filter (where c.last_enquiry_at >= ${start})::int as new_today,
      count(*) filter (where c.owner_id is not null and c.last_enquiry_at is not null
                         and (c.last_response_at is null or c.last_response_at < c.last_enquiry_at))::int
        as awaiting_first_response,
      count(*) filter (where c.owner_id is null and c.last_enquiry_at is not null)::int as unassigned
    from public.contacts c
    where c.workspace_id = ${workspace.id} and c.deleted_at is null
      and c.last_enquiry_at > now() - interval '30 days' ${leadScope}`;

  const recentLeads = await tx`
    select c.id, c.name, c.phone_e164, c.source, c.owner_id, c.last_enquiry_at, c.first_response_at,
           (c.last_response_at is null or c.last_response_at < c.last_enquiry_at) as awaiting_response
      from public.contacts c
     where c.workspace_id = ${workspace.id} and c.deleted_at is null and c.last_enquiry_at is not null
       ${leadScope}
     order by c.last_enquiry_at desc
     limit 5`;

  // Speed to lead today: median minutes from enquiry to first response.
  const [speed] = await tx<{ median_seconds: number | null; responded: number }[]>`
    select
      percentile_cont(0.5) within group (
        order by extract(epoch from (c.first_response_at - c.created_at)))::float as median_seconds,
      count(*)::int as responded
    from public.contacts c
    where c.workspace_id = ${workspace.id} and c.deleted_at is null
      and c.created_at >= ${start} and c.first_response_at is not null ${leadScope}`;

  const [notif] = await tx<{ unread: number }[]>`
    select count(*)::int as unread from public.notifications
     where user_id = ${userId} and workspace_id = ${workspace.id} and read_at is null`;

  const [me] = await tx<{ available: boolean }[]>`
    select coalesce((select available from public.agent_availability
                      where workspace_id = ${workspace.id} and user_id = ${userId}), true) as available`;

  return json({
    data: {
      scope,
      timezone: workspace.timezone,
      generated_at: new Date().toISOString(),
      me: { user_id: userId, role: workspace.role, available: me.available },
      tasks: { ...tasks, next: nextTasks },
      leads: { ...leads, unassigned: isManager ? leads.unassigned : null, recent: recentLeads },
      speed_to_lead_today: {
        median_seconds: speed.median_seconds === null ? null : Math.round(speed.median_seconds),
        responded: speed.responded,
      },
      notifications: { unread: notif.unread },
    },
  });
});
