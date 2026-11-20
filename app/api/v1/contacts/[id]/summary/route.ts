import { json, userRoute } from '@/server/http';
import { visibleContact } from '@/server/core/crm';

const iso = (v: Date | null) => (v ? v.toISOString() : null);

// GET /contacts/:id/summary: activity counts, follow-up status and deal totals for the lead header.
export const GET = userRoute<{ id: string }>({ allowWhenReadOnly: true }, async ({ params, tx, workspace, userId, isManager }) => {
  const c = await visibleContact(tx, workspace.id, params.id, userId, isManager);
  const [a] = await tx<{ calls: number; notes: number; whatsapp: number; stage_changes: number; total: number }[]>`
    select count(*) filter (where type = 'call')::int as calls,
           count(*) filter (where type = 'note')::int as notes,
           count(*) filter (where type = 'whatsapp')::int as whatsapp,
           count(*) filter (where type = 'stage_change')::int as stage_changes,
           count(*)::int as total
      from public.activities where contact_id = ${c.id} and workspace_id = ${workspace.id}`;
  const [f] = await tx<{ open: number; overdue: number; done: number; next_due_at: Date | null }[]>`
    select count(*) filter (where status = 'open')::int as open,
           count(*) filter (where status = 'open' and due_at < now())::int as overdue,
           count(*) filter (where status = 'done')::int as done,
           min(due_at) filter (where status = 'open') as next_due_at
      from public.tasks where contact_id = ${c.id} and workspace_id = ${workspace.id}`;
  const [d] = await tx<{ open_count: number; open_value: string; won_count: number; won_value: string; lost_count: number; currency: string | null; oldest_open_stage_at: Date | null }[]>`
    select count(*) filter (where s.kind = 'open')::int as open_count,
           coalesce(sum(d.value_minor) filter (where s.kind = 'open'), 0) as open_value,
           count(*) filter (where s.kind = 'won')::int as won_count,
           coalesce(sum(d.value_minor) filter (where s.kind = 'won'), 0) as won_value,
           count(*) filter (where s.kind = 'lost')::int as lost_count,
           max(d.currency) as currency,
           min(d.stage_entered_at) filter (where s.kind = 'open') as oldest_open_stage_at
      from public.deals d join public.stages s on s.id = d.stage_id
     where d.contact_id = ${c.id} and d.workspace_id = ${workspace.id} and d.deleted_at is null`;
  const [w] = await tx<{ currency: string }[]>`select currency from public.workspaces where id = ${workspace.id}`;
  return json({
    data: {
      activity: a,
      follow_ups: { ...f, next_due_at: iso(f.next_due_at) },
      deals: {
        open_count: d.open_count, open_value_minor: Number(d.open_value), won_count: d.won_count,
        won_value_minor: Number(d.won_value), lost_count: d.lost_count, currency: d.currency ?? w.currency,
        oldest_open_stage_at: iso(d.oldest_open_stage_at),
      },
      contact: {
        created_at: iso(c.created_at), last_activity_at: iso(c.last_activity_at), first_response_at: iso(c.first_response_at),
        last_response_at: iso(c.last_response_at), last_enquiry_at: iso(c.last_enquiry_at), status: c.status,
      },
    },
  });
});
