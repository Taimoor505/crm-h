import { z } from 'zod';
import type { Db } from '../db';
import { ApiError } from '../http';

/**
 * Report filters. Dates are calendar days in the workspace timezone, `to`
 * inclusive; default is the last 30 days. Agents always get their own data.
 */
export const reportFilters = z
  .object({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    pipeline_id: z.uuid().optional(),
    source: z.string().trim().min(1).max(40).optional(),
    agent_id: z.uuid().optional(),
  })
  .refine((f) => !f.from || !f.to || f.from <= f.to, { message: '`from` must not be after `to`', path: ['from'] })
  .refine((f) => !f.from || !f.to || (Date.parse(f.to) - Date.parse(f.from)) / 86400_000 <= 731, {
    message: 'Range can be at most 2 years', path: ['to'],
  });
export type ReportFilters = z.infer<typeof reportFilters>;

export interface ReportCtx {
  tx: Db;
  workspaceId: string;
  timezone: string;
  filters: ReportFilters;
}

/** Resolves the date range to UTC bounds (as SQL fragments) plus the echoed dates. */
async function range(c: ReportCtx) {
  const [r] = await c.tx<{ from: string; to: string }[]>`
    select coalesce(${c.filters.from ?? null}::date, (now() at time zone ${c.timezone})::date - 29)::text as from,
           coalesce(${c.filters.to ?? null}::date, (now() at time zone ${c.timezone})::date)::text as to`;
  const start = c.tx`(${r.from}::date::timestamp at time zone ${c.timezone})`;
  const end = c.tx`((${r.to}::date + 1)::timestamp at time zone ${c.timezone})`;
  return { start, end, from: r.from, to: r.to };
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

/** Leads by source and by day: new leads plus re-enquiries, from the timeline. */
export async function sourcesReport(c: ReportCtx) {
  const { tx, workspaceId, timezone, filters: f } = c;
  const r = await range(c);
  const base = tx`
    from public.activities a
    join public.contacts ct on ct.id = a.contact_id
    where a.workspace_id = ${workspaceId} and a.type = 'system'
      and a.meta ->> 'kind' in ('lead_received', 're_enquiry')
      and a.created_at >= ${r.start} and a.created_at < ${r.end}
      ${f.source ? tx`and coalesce(a.meta ->> 'source_label', ct.source) = ${f.source}` : tx``}
      ${f.agent_id ? tx`and ct.owner_id = ${f.agent_id}` : tx``}`;
  const bySource = await tx<{ source: string; leads: number; new: number; reenquiries: number }[]>`
    select coalesce(a.meta ->> 'source_label', ct.source, 'unknown') as source,
           count(*)::int as leads,
           count(*) filter (where a.meta ->> 'kind' = 'lead_received')::int as new,
           count(*) filter (where a.meta ->> 'kind' = 're_enquiry')::int as reenquiries
    ${base}
    group by 1 order by leads desc, source`;
  const byDay = await tx<{ day: string; source: string; leads: number }[]>`
    select to_char(a.created_at at time zone ${timezone}, 'YYYY-MM-DD') as day,
           coalesce(a.meta ->> 'source_label', ct.source, 'unknown') as source,
           count(*)::int as leads
    ${base}
    group by 1, 2 order by 1, 2`;
  return {
    from: r.from, to: r.to,
    total: bySource.reduce((s, x) => s + x.leads, 0),
    by_source: bySource,
    by_day: byDay,
  };
}

/** Speed to lead: time from a lead's creation to its first call/WhatsApp/note, per agent. */
export async function speedToLeadReport(c: ReportCtx) {
  const { tx, workspaceId, filters: f } = c;
  const r = await range(c);
  const rows = await tx<{ agent_id: string | null; agent_name: string | null; leads: number; responded: number;
    median_seconds: number | null; p90_seconds: number | null; within_5_min: number; within_1_hour: number }[]>`
    select ct.owner_id as agent_id, u.name as agent_name,
           count(*)::int as leads,
           count(ct.first_response_at)::int as responded,
           percentile_cont(0.5) within group (order by extract(epoch from ct.first_response_at - ct.created_at))::float as median_seconds,
           percentile_cont(0.9) within group (order by extract(epoch from ct.first_response_at - ct.created_at))::float as p90_seconds,
           count(*) filter (where ct.first_response_at - ct.created_at <= interval '5 minutes')::int as within_5_min,
           count(*) filter (where ct.first_response_at - ct.created_at <= interval '1 hour')::int as within_1_hour
      from public.contacts ct
      left join public.users u on u.id = ct.owner_id
     where ct.workspace_id = ${workspaceId} and ct.deleted_at is null and ct.last_enquiry_at is not null
       and ct.created_at >= ${r.start} and ct.created_at < ${r.end}
       ${f.source ? tx`and ct.source = ${f.source}` : tx``}
       ${f.agent_id ? tx`and ct.owner_id = ${f.agent_id}` : tx``}
     group by grouping sets ((ct.owner_id, u.name), ())
     order by grouping(ct.owner_id, u.name), median_seconds nulls last`;
  const shape = (x: (typeof rows)[number]) => ({
    ...x,
    median_seconds: x.median_seconds === null ? null : Math.round(x.median_seconds),
    p90_seconds: x.p90_seconds === null ? null : Math.round(x.p90_seconds),
    response_rate_pct: pct(x.responded, x.leads),
    within_5_min_pct: pct(x.within_5_min, x.leads),
    within_1_hour_pct: pct(x.within_1_hour, x.leads),
  });
  // The grand total (grouping set ()) is the last row.
  const overall = rows.length ? rows[rows.length - 1] : null;
  return {
    from: r.from, to: r.to,
    overall: overall ? (({ agent_id: _a, agent_name: _n, ...o }) => o)(shape(overall)) : null,
    by_agent: rows.slice(0, -1).map(shape),
  };
}

/**
 * Funnel for one pipeline over deals created in the range. A deal "reached" a
 * stage if it is in it now, passed through it (stage_change activities with
 * meta.to_stage_id), or was won. Lost deals count up to the furthest open
 * stage they reached.
 */
export async function funnelReport(c: ReportCtx) {
  const { tx, workspaceId, filters: f } = c;
  const r = await range(c);
  const [pipeline] = f.pipeline_id
    ? await tx<{ id: string; name: string }[]>`select id, name from public.pipelines where id = ${f.pipeline_id} and workspace_id = ${workspaceId}`
    : await tx<{ id: string; name: string }[]>`select id, name from public.pipelines where workspace_id = ${workspaceId} order by position, name limit 1`;
  if (!pipeline) throw new ApiError(404, 'pipeline_not_found', 'Pipeline not found');

  const stages = await tx<{ id: string; name: string; kind: string; position: number; reached: number; current: number }[]>`
    with cohort as (
      select d.id, s.kind as current_kind, s.position as current_pos, d.stage_id
        from public.deals d
        join public.stages s on s.id = d.stage_id
        left join public.contacts ct on ct.id = d.contact_id
       where d.workspace_id = ${workspaceId} and d.pipeline_id = ${pipeline.id} and d.deleted_at is null
         and d.created_at >= ${r.start} and d.created_at < ${r.end}
         ${f.agent_id ? tx`and d.owner_id = ${f.agent_id}` : tx``}
         ${f.source ? tx`and ct.source = ${f.source}` : tx``}
    ),
    furthest as (
      select co.id, co.current_kind, co.stage_id,
             greatest(
               case when co.current_kind = 'open' then co.current_pos end,
               (select max(hs.position) from public.activities a
                  join public.stages hs on hs.id = (a.meta ->> 'to_stage_id')::uuid and hs.kind = 'open'
                 where a.deal_id = co.id and a.type = 'stage_change')
             ) as max_open_pos
        from cohort co
    )
    select s.id, s.name, s.kind, s.position,
           case s.kind
             when 'open' then (select count(*) from furthest fu
                                where fu.current_kind = 'won' or coalesce(fu.max_open_pos, -1) >= s.position
                                   or (fu.current_kind = 'lost' and fu.max_open_pos is null
                                       and s.position = (select min(position) from public.stages where pipeline_id = ${pipeline.id} and kind = 'open')))
             else (select count(*) from furthest fu where fu.stage_id = s.id)
           end::int as reached,
           (select count(*) from furthest fu where fu.stage_id = s.id)::int as current
      from public.stages s
     where s.pipeline_id = ${pipeline.id}
     order by s.position`;

  const total = await tx<{ n: number }[]>`
    select count(*)::int as n from public.deals d left join public.contacts ct on ct.id = d.contact_id
     where d.workspace_id = ${workspaceId} and d.pipeline_id = ${pipeline.id} and d.deleted_at is null
       and d.created_at >= ${r.start} and d.created_at < ${r.end}
       ${f.agent_id ? tx`and d.owner_id = ${f.agent_id}` : tx``}
       ${f.source ? tx`and ct.source = ${f.source}` : tx``}`;
  const won = stages.filter((s) => s.kind === 'won').reduce((a, s) => a + s.current, 0);
  const lost = stages.filter((s) => s.kind === 'lost').reduce((a, s) => a + s.current, 0);
  let prev: number | null = null;
  return {
    from: r.from, to: r.to,
    pipeline,
    deals: total[0].n,
    won, lost,
    open: total[0].n - won - lost,
    win_rate_pct: pct(won, won + lost),
    stages: stages.map((s) => {
      const conversion = s.kind === 'open' || s.kind === 'won' ? pct(s.reached, prev ?? s.reached) : null;
      if (s.kind !== 'lost') prev = s.reached;
      return { ...s, conversion_from_previous_pct: conversion };
    }),
  };
}

/** Per agent: assigned, contacted, follow-ups done, overdue now, deals won. */
export async function agentsReport(c: ReportCtx) {
  const { tx, workspaceId, filters: f } = c;
  const r = await range(c);
  const rows = await tx<{ agent_id: string; agent_name: string | null; role: string; assigned: number; contacted: number;
    follow_ups_done: number; overdue: number; deals_won: number; won_value_pkr: number }[]>`
    select m.user_id as agent_id, u.name as agent_name, m.role,
      (select count(*) from public.activities a
        where a.workspace_id = ${workspaceId} and a.type = 'assignment' and a.meta ->> 'to' = m.user_id::text
          and a.created_at >= ${r.start} and a.created_at < ${r.end})::int as assigned,
      (select count(*) from public.contacts ct
        where ct.workspace_id = ${workspaceId} and ct.owner_id = m.user_id
          and ct.first_response_at >= ${r.start} and ct.first_response_at < ${r.end})::int as contacted,
      (select count(*) from public.tasks t
        where t.workspace_id = ${workspaceId} and t.status = 'done' and t.assigned_to = m.user_id
          and t.completed_at >= ${r.start} and t.completed_at < ${r.end})::int as follow_ups_done,
      (select count(*) from public.tasks t
        where t.workspace_id = ${workspaceId} and t.status = 'open' and t.assigned_to = m.user_id
          and t.due_at < now())::int as overdue,
      (select count(*) from public.deals d join public.stages s on s.id = d.stage_id
        where d.workspace_id = ${workspaceId} and d.owner_id = m.user_id and s.kind = 'won' and d.deleted_at is null
          and d.stage_entered_at >= ${r.start} and d.stage_entered_at < ${r.end}
          ${f.pipeline_id ? tx`and d.pipeline_id = ${f.pipeline_id}` : tx``})::int as deals_won,
      (select coalesce(sum(d.value_pkr), 0) from public.deals d join public.stages s on s.id = d.stage_id
        where d.workspace_id = ${workspaceId} and d.owner_id = m.user_id and s.kind = 'won' and d.deleted_at is null
          and d.stage_entered_at >= ${r.start} and d.stage_entered_at < ${r.end}
          ${f.pipeline_id ? tx`and d.pipeline_id = ${f.pipeline_id}` : tx``})::float as won_value_pkr
    from public.memberships m
    join public.users u on u.id = m.user_id
    where m.workspace_id = ${workspaceId} and m.status = 'active'
      ${f.agent_id ? tx`and m.user_id = ${f.agent_id}` : tx``}
    order by deals_won desc, assigned desc, u.name`;
  return { from: r.from, to: r.to, agents: rows };
}

/** Won deal value (PKR) by month of winning, workspace time. */
export async function wonValueReport(c: ReportCtx) {
  const { tx, workspaceId, timezone, filters: f } = c;
  const r = await range(c);
  const months = await tx<{ month: string; deals: number; value_pkr: number }[]>`
    select to_char(d.stage_entered_at at time zone ${timezone}, 'YYYY-MM') as month,
           count(*)::int as deals, coalesce(sum(d.value_pkr), 0)::float as value_pkr
      from public.deals d
      join public.stages s on s.id = d.stage_id
      left join public.contacts ct on ct.id = d.contact_id
     where d.workspace_id = ${workspaceId} and d.deleted_at is null and s.kind = 'won'
       and d.stage_entered_at >= ${r.start} and d.stage_entered_at < ${r.end}
       ${f.pipeline_id ? tx`and d.pipeline_id = ${f.pipeline_id}` : tx``}
       ${f.agent_id ? tx`and d.owner_id = ${f.agent_id}` : tx``}
       ${f.source ? tx`and ct.source = ${f.source}` : tx``}
     group by 1 order by 1`;
  return {
    from: r.from, to: r.to, currency: 'PKR',
    total_value_pkr: months.reduce((s, m) => s + m.value_pkr, 0),
    total_deals: months.reduce((s, m) => s + m.deals, 0),
    months,
  };
}

/** Why deals were lost, by count and value. */
export async function lostReasonsReport(c: ReportCtx) {
  const { tx, workspaceId, filters: f } = c;
  const r = await range(c);
  const reasons = await tx<{ reason: string; deals: number; value_pkr: number }[]>`
    select coalesce(nullif(trim(d.lost_reason), ''), 'Not specified') as reason,
           count(*)::int as deals, coalesce(sum(d.value_pkr), 0)::float as value_pkr
      from public.deals d
      join public.stages s on s.id = d.stage_id
      left join public.contacts ct on ct.id = d.contact_id
     where d.workspace_id = ${workspaceId} and d.deleted_at is null and s.kind = 'lost'
       and d.stage_entered_at >= ${r.start} and d.stage_entered_at < ${r.end}
       ${f.pipeline_id ? tx`and d.pipeline_id = ${f.pipeline_id}` : tx``}
       ${f.agent_id ? tx`and d.owner_id = ${f.agent_id}` : tx``}
       ${f.source ? tx`and ct.source = ${f.source}` : tx``}
     group by 1 order by deals desc, reason`;
  const total = reasons.reduce((s, x) => s + x.deals, 0);
  return {
    from: r.from, to: r.to, total_deals: total,
    reasons: reasons.map((x) => ({ ...x, share_pct: pct(x.deals, total) })),
  };
}

export const REPORTS = {
  'sources': sourcesReport,
  'speed-to-lead': speedToLeadReport,
  'funnel': funnelReport,
  'agents': agentsReport,
  'won-value': wonValueReport,
  'lost-reasons': lostReasonsReport,
} as const;
