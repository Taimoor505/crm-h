import type { Db } from '../db';
import { notify, notifyManagers } from '../notifications/service';
import { contactLabel } from '../assignment/engine';

/** "3:45 PM" in the workspace's timezone. */
export function localTime(at: Date | string, timezone: string): string {
  return new Intl.DateTimeFormat('en-PK', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}

export const UNTOUCHED_LEAD_MINUTES = 30;

/**
 * Every minute: remind the assignee 15 minutes before a follow-up is due.
 * Idempotent through tasks.reminder_sent_at (cleared again on reschedule).
 */
export async function sendTaskReminders(tx: Db): Promise<{ reminded: number }> {
  const due = await tx<{ id: string; workspace_id: string; assigned_to: string; title: string; due_at: Date;
    contact_id: string | null; timezone: string }[]>`
    select t.id, t.workspace_id, t.assigned_to, t.title, t.due_at, t.contact_id, w.timezone
      from public.tasks t
      join public.workspaces w on w.id = t.workspace_id
     where t.status = 'open' and t.reminder_sent_at is null and w.status = 'active'
       and t.due_at > now() and t.due_at <= now() + interval '15 minutes'
     order by t.due_at
     limit 500
       for update of t skip locked`;
  for (const t of due) {
    await notify(tx, {
      workspaceId: t.workspace_id,
      userId: t.assigned_to,
      type: 'task.reminder',
      title: `Due at ${localTime(t.due_at, t.timezone)}: ${t.title}`,
      data: { task_id: t.id, contact_id: t.contact_id, due_at: t.due_at },
      dedupeKey: `task.reminder:${t.id}:${new Date(t.due_at).getTime()}`,
    });
    await tx`update public.tasks set reminder_sent_at = now() where id = ${t.id}`;
  }
  return { reminded: due.length };
}

/**
 * Every 5 minutes: tell the assignee a follow-up just went overdue (urgent, so
 * it can go to their WhatsApp). Tasks overdue for over 7 days are ignored, so
 * turning this on doesn't flood people about old tasks.
 */
export async function sendOverdueAlerts(tx: Db): Promise<{ alerted: number }> {
  const overdue = await tx<{ id: string; workspace_id: string; assigned_to: string; title: string; due_at: Date;
    contact_id: string | null; timezone: string }[]>`
    select t.id, t.workspace_id, t.assigned_to, t.title, t.due_at, t.contact_id, w.timezone
      from public.tasks t
      join public.workspaces w on w.id = t.workspace_id
     where t.status = 'open' and t.overdue_notified_at is null and w.status = 'active'
       and t.due_at < now() and t.due_at > now() - interval '7 days'
     order by t.due_at
     limit 500
       for update of t skip locked`;
  for (const t of overdue) {
    await notify(tx, {
      workspaceId: t.workspace_id,
      userId: t.assigned_to,
      type: 'task.overdue',
      title: `Overdue: ${t.title}`,
      body: `Was due at ${localTime(t.due_at, t.timezone)}`,
      data: { task_id: t.id, contact_id: t.contact_id, due_at: t.due_at },
      priority: 'urgent',
      dedupeKey: `task.overdue:${t.id}:${new Date(t.due_at).getTime()}`,
    });
    await tx`update public.tasks set overdue_notified_at = now() where id = ${t.id}`;
  }
  return { alerted: overdue.length };
}

/**
 * Every minute: a lead that enquired 30+ minutes ago and still has no call,
 * WhatsApp or note gets an alert to its owner and the managers, once per
 * enquiry (a re-enquiry can alert again).
 */
export async function sendUntouchedLeadAlerts(tx: Db): Promise<{ alerted: number }> {
  const leads = await tx<{ id: string; workspace_id: string; owner_id: string | null; name: string | null;
    phone_e164: string | null; email: string | null; last_enquiry_at: Date }[]>`
    select c.id, c.workspace_id, c.owner_id, c.name, c.phone_e164, c.email, c.last_enquiry_at
      from public.contacts c
      join public.workspaces w on w.id = c.workspace_id
     where w.status = 'active' and c.deleted_at is null
       and c.last_enquiry_at > now() - interval '24 hours'
       and c.last_enquiry_at <= now() - make_interval(mins => ${UNTOUCHED_LEAD_MINUTES})
       and (c.last_response_at is null or c.last_response_at < c.last_enquiry_at)
       and (c.untouched_alerted_at is null or c.untouched_alerted_at < c.last_enquiry_at)
     order by c.last_enquiry_at
     limit 500
       for update of c skip locked`;
  for (const c of leads) {
    const label = contactLabel(c);
    const key = `lead.untouched:${c.id}:${new Date(c.last_enquiry_at).getTime()}`;
    const n = {
      workspaceId: c.workspace_id,
      type: 'lead.untouched',
      title: `Not contacted for ${UNTOUCHED_LEAD_MINUTES} min: ${label}`,
      body: c.owner_id ? null : 'This lead has no owner yet',
      data: { contact_id: c.id },
      priority: 'urgent' as const,
      dedupeKey: key,
    };
    if (c.owner_id) await notify(tx, { ...n, userId: c.owner_id });
    await notifyManagers(tx, n, c.owner_id);
    await tx`update public.contacts set untouched_alerted_at = now() where id = ${c.id}`;
  }
  return { alerted: leads.length };
}

/**
 * Every 15 minutes: once a day after 09:00 workspace time, managers get one
 * digest of overdue follow-ups per agent. The notification dedupe key (one per
 * local date) makes repeats impossible.
 */
export async function sendOverdueDigests(tx: Db): Promise<{ digests: number }> {
  const rows = await tx<{ workspace_id: string; local_date: string; total: number; by_agent: { name: string; n: number }[] }[]>`
    select w.id as workspace_id,
           to_char(now() at time zone w.timezone, 'YYYY-MM-DD') as local_date,
           sum(x.n)::int as total,
           json_agg(json_build_object('name', coalesce(u.name, 'Unknown'), 'n', x.n) order by x.n desc) as by_agent
      from public.workspaces w
      join lateral (
        select t.assigned_to, count(*)::int as n
          from public.tasks t
         where t.workspace_id = w.id and t.status = 'open' and t.due_at < now()
         group by t.assigned_to) x on true
      join public.users u on u.id = x.assigned_to
     where w.status = 'active'
       and extract(hour from now() at time zone w.timezone) >= 9
     group by w.id, w.timezone`;
  let digests = 0;
  for (const r of rows) {
    const managers = await tx<{ user_id: string }[]>`
      select m.user_id from public.memberships m
       where m.workspace_id = ${r.workspace_id} and m.status = 'active' and m.role in ('owner', 'manager')
         and not exists (select 1 from public.notifications n
                          where n.user_id = m.user_id and n.dedupe_key = ${`digest.overdue:${r.workspace_id}:${r.local_date}`})`;
    for (const m of managers) {
      await notify(tx, {
        workspaceId: r.workspace_id,
        userId: m.user_id,
        type: 'digest.overdue',
        title: `${r.total} overdue follow-up${r.total === 1 ? '' : 's'} in your team`,
        body: r.by_agent.map((a) => `${a.name}: ${a.n}`).join(', '),
        data: { by_agent: r.by_agent },
        dedupeKey: `digest.overdue:${r.workspace_id}:${r.local_date}`,
      });
      digests++;
    }
  }
  return { digests };
}
