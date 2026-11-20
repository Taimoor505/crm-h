'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowDownUp, Download, Target, Timer, Trophy, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useReport } from '@/hooks/queries/work';
import { useMembers, usePipelines } from '@/hooks/queries/crm';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { usePermissions } from '@/lib/permissions';
import { dayKey, formatDate, formatDuration, formatMoneyValue, formatNumber, formatPercent, zonedParts } from '@/lib/format';
import type { ReportFilters } from '@/lib/api/types';
import { PageHeader, Section } from '@/components/layout/PageHeader';
import { CardSkeleton, EmptyState, ErrorState } from '@/components/crm/states';
import { Chip } from '@/components/crm/DuePicker';
import { Avatar } from '@/components/crm/badges';
import { cn, downloadText, humanize, toCsv } from '@/lib/utils';

// Charts load on demand so the page shell renders immediately.
const load = <K extends keyof typeof import('@/components/crm/ReportVisuals')>(k: K, h: string) =>
  dynamic(() => import('@/components/crm/ReportVisuals').then((m) => m[k] as never), { ssr: false, loading: () => <CardSkeleton className={h} /> });
const StackedTrend = load('StackedTrend', 'h-60') as typeof import('@/components/crm/ReportVisuals').StackedTrend;
const Donut = load('Donut', 'h-44') as typeof import('@/components/crm/ReportVisuals').Donut;
const Funnel = load('Funnel', 'h-44') as typeof import('@/components/crm/ReportVisuals').Funnel;
const SegmentBar = load('SegmentBar', 'h-40') as typeof import('@/components/crm/ReportVisuals').SegmentBar;
const Columns = load('Columns', 'h-64') as typeof import('@/components/crm/ReportVisuals').Columns;
const RankedShares = load('RankedShares', 'h-40') as typeof import('@/components/crm/ReportVisuals').RankedShares;
const Sparkline = load('Sparkline', 'h-8') as typeof import('@/components/crm/ReportVisuals').Sparkline;

type Preset = 'today' | 'last7' | 'thisMonth' | 'lastMonth' | 'custom';

/** Report ranges are workspace-local dates (yyyy-mm-dd), inclusive. */
function rangeFor(preset: Preset, tz: string): { from: string; to: string } {
  const now = new Date();
  const today = dayKey(now, tz);
  const p = zonedParts(now, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'last7':
      return { from: dayKey(new Date(now.getTime() - 6 * 86400_000), tz), to: today };
    case 'thisMonth':
      return { from: `${p.year}-${pad(p.month)}-01`, to: today };
    case 'lastMonth': {
      const y = p.month === 1 ? p.year - 1 : p.year;
      const m = p.month === 1 ? 12 : p.month - 1;
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
    }
    default:
      return { from: dayKey(new Date(now.getTime() - 29 * 86400_000), tz), to: today };
  }
}

type SortKey = 'agent_name' | 'assigned' | 'contacted' | 'follow_ups_done' | 'overdue' | 'deals_won' | 'won_value';

export default function ReportsPage() {
  const t = useTranslations('reports');
  const s = useWorkspaceSettings();
  const { can } = usePermissions();
  const team = can('reports.team');
  const members = useMembers();
  const pipelines = usePipelines();
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [custom, setCustom] = useState(() => rangeFor('custom', s.timezone));
  const [agentId, setAgentId] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'won_value', dir: -1 });

  const range = preset === 'custom' ? custom : rangeFor(preset, s.timezone);
  const filters: ReportFilters = { ...range, agent_id: team ? agentId || undefined : undefined, pipeline_id: pipelineId || undefined };

  const sources = useReport('sources', filters);
  const speed = useReport('speed-to-lead', filters);
  const funnel = useReport('funnel', filters);
  const agents = useReport('agents', filters);
  const won = useReport('won-value', filters);
  const lost = useReport('lost-reasons', filters);

  const sortedAgents = useMemo(() => {
    const rows = [...(agents.data?.agents ?? [])];
    return rows.sort((a, b) => {
      const av = sort.key === 'won_value' ? a.won_value.amount_minor : sort.key === 'agent_name' ? a.agent_name ?? '' : a[sort.key];
      const bv = sort.key === 'won_value' ? b.won_value.amount_minor : sort.key === 'agent_name' ? b.agent_name ?? '' : b[sort.key];
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
  }, [agents.data, sort]);

  function exportAll() {
    const rows: (string | number | null)[][] = [[t('rangeLabel', { from: range.from, to: range.to })], []];
    rows.push([t('bySource'), t('leads')], ...(sources.data?.by_source ?? []).map((x) => [humanize(x.source), x.leads]), []);
    rows.push([t('agentsTable'), t('colAssigned'), t('colContacted'), t('colFollowUps'), t('colOverdue'), t('colWon'), t('colWonValue')]);
    rows.push(...sortedAgents.map((a) => [a.agent_name, a.assigned, a.contacted, a.follow_ups_done, a.overdue, a.deals_won, formatMoneyValue(a.won_value, s)]), []);
    rows.push([t('lostReasons'), t('deals'), t('value')], ...(lost.data?.reasons ?? []).map((x) => [x.reason, x.deals, formatMoneyValue(x.value, s)]));
    downloadText(`report_${range.from}_${range.to}.csv`, toCsv(rows));
    toast.success(t('exported'));
  }

  // Trend by day, top 5 sources + Other (fixed colour order by size).
  const trend = useMemo(() => {
    const by = sources.data?.by_source ?? [];
    const top = by.slice(0, 5).map((x) => x.source);
    const series = top.map((k) => ({ key: k, label: humanize(k) }));
    if (by.length > 5) series.push({ key: '__other', label: t('other') });
    const days = new Map<string, Record<string, number | string>>();
    const start = new Date(`${range.from}T00:00:00Z`).getTime();
    const end = new Date(`${range.to}T00:00:00Z`).getTime();
    for (let d = start; d <= end && days.size < 400; d += 86400_000) {
      const key = new Date(d).toISOString().slice(0, 10);
      const row: Record<string, number | string> = { label: formatDate(key, { ...s, date_format: 'dd MMM' }) };
      for (const se of series) row[se.key] = 0;
      days.set(key, row);
    }
    for (const r of sources.data?.by_day ?? []) {
      const row = days.get(r.day);
      if (!row) continue;
      const k = top.includes(r.source) ? r.source : '__other';
      row[k] = Number(row[k] ?? 0) + r.leads;
    }
    return { series, days: [...days.values()] };
  }, [sources.data, range.from, range.to, s, t]);
  const dailyTotals = trend.days.map((d) => trend.series.reduce((a, se) => a + Number(d[se.key] ?? 0), 0));
  const sourceShares = useMemo(() => {
    const by = sources.data?.by_source ?? [];
    const top = by.slice(0, 5).map((x) => ({ label: x.source, value: x.leads, display: humanize(x.source) }));
    const rest = by.slice(5).reduce((a, x) => a + x.leads, 0);
    return rest ? [...top, { label: '__other', value: rest, display: t('other') }] : top;
  }, [sources.data, t]);
  const podium = useMemo(() => [...(agents.data?.agents ?? [])].filter((a) => a.won_value.amount_minor > 0 || a.deals_won > 0).sort((a, b) => b.won_value.amount_minor - a.won_value.amount_minor).slice(0, 3), [agents.data]);
  const maxWon = Math.max(0, ...(agents.data?.agents ?? []).map((a) => a.won_value.amount_minor));
  const formatMonth = (m: string) => formatDate(`${m}-01`, { ...s, date_format: 'MMM yyyy' });

  const anyError = [sources, speed, funnel, agents, won, lost].find((q) => q.isError);
  const overall = speed.data?.overall;
  const speedBars = overall
    ? [
        { label: t('within5'), value: overall.within_5_min, display: formatNumber(overall.within_5_min, s) },
        { label: t('within1h'), value: overall.within_1_hour - overall.within_5_min, display: formatNumber(overall.within_1_hour - overall.within_5_min, s) },
        { label: t('later'), value: overall.responded - overall.within_1_hour, display: formatNumber(overall.responded - overall.within_1_hour, s) },
        { label: t('noResponse'), value: overall.leads - overall.responded, display: formatNumber(overall.leads - overall.responded, s) },
      ]
    : [];

  const SortHeader = ({ k, label, end }: { k: SortKey; label: string; end?: boolean }) => (
    <th scope="col" aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={cn('px-3 py-2 font-medium', end ? 'text-end' : 'text-start')}>
      <button type="button" onClick={() => setSort((p) => ({ key: k, dir: p.key === k ? (p.dir === 1 ? -1 : 1) : -1 }))} aria-label={t('sortBy', { column: label })} className="inline-flex min-h-9 items-center gap-1 hover:text-gray-900">
        {label}
        <ArrowDownUp className="size-3" aria-hidden="true" />
      </button>
    </th>
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={`${formatDate(range.from, s)} – ${formatDate(range.to, s)}`}
        actions={
          <Button variant="outline" className="h-10" onClick={exportAll}>
            <Download className="size-4" aria-hidden="true" />
            {t('export')}
          </Button>
        }
      />

      <div className="space-y-3 rounded-2xl border bg-card p-3 shadow-card">
        <div role="group" aria-label={t('range')} className="scrollbar-none flex gap-2 overflow-x-auto">
          {(['today', 'last7', 'thisMonth', 'lastMonth', 'custom'] as const).map((p) => (
            <Chip key={p} selected={preset === p} onClick={() => setPreset(p)} className="shrink-0">
              {t(p)}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {preset === 'custom' && (
            <>
              <div className="space-y-1">
                <Label htmlFor="r-from">{t('from')}</Label>
                <Input id="r-from" type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="r-to">{t('to')}</Label>
                <Input id="r-to" type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="h-10" />
              </div>
            </>
          )}
          {team && (
            <div className="space-y-1">
              <Label htmlFor="r-agent">{t('agent')}</Label>
              <Select value={agentId || 'all'} onValueChange={(v) => setAgentId(v === 'all' ? '' : v)}>
                <SelectTrigger id="r-agent" className="h-10 min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allAgents')}</SelectItem>
                  {(members.data ?? []).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {(pipelines.data?.length ?? 0) > 1 && (
            <div className="space-y-1">
              <Label htmlFor="r-pipeline">{t('pipeline')}</Label>
              <Select value={pipelineId || pipelines.data![0].id} onValueChange={setPipelineId}>
                <SelectTrigger id="r-pipeline" className="h-10 min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.data!.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {!team && <p className="text-xs text-gray-600">{t('ownNumbers')}</p>}
      </div>

      {anyError ? (
        <ErrorState onRetry={() => anyError.refetch()} />
      ) : (
        <>
          <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            {[
              { label: t('kpiNewLeads'), value: sources.data ? formatNumber(sources.data.total, s) : null, hint: t('kpiNewLeadsHint'), icon: UserPlus, tile: 'from-sky-500 to-blue-600', spark: true },
              { label: t('kpiWonValue'), value: won.data ? formatMoneyValue(won.data.total, s, { compact: true }) : null, hint: won.data ? t('kpiWonValueHint', { count: won.data.total_deals }) : '', icon: Trophy, tile: 'from-emerald-500 to-teal-600' },
              { label: t('kpiConversion'), value: funnel.data ? formatPercent(funnel.data.win_rate_pct === null ? null : funnel.data.win_rate_pct / 100, s) : null, hint: t('kpiConversionHint'), icon: Target, tile: 'from-violet-500 to-indigo-600' },
              { label: t('kpiSpeed'), value: speed.data ? formatDuration(speed.data.overall?.median_seconds ?? null, s) : null, hint: t('kpiSpeedHint'), icon: Timer, tile: 'from-amber-400 to-orange-500' },
            ].map((k) =>
              k.value === null ? (
                <CardSkeleton key={k.label} className="h-[132px] rounded-2xl" />
              ) : (
                <div key={k.label} className="flex min-h-[132px] flex-col justify-between rounded-2xl border bg-card p-4 shadow-raised">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-gray-600 lg:text-sm">{k.label}</p>
                    <span className={cn('grid size-9 place-items-center rounded-xl bg-gradient-to-br text-white shadow-card', k.tile)} aria-hidden="true"><k.icon className="size-[18px]" /></span>
                  </div>
                  <p className="font-heading text-[28px] leading-none font-bold tracking-tight tabular-nums text-gray-900">{k.value}</p>
                  {k.spark && dailyTotals.length > 1 ? <Sparkline values={dailyTotals} className="h-8" /> : <p className="truncate text-xs text-gray-600">{k.hint}</p>}
                </div>
              ),
            )}
          </div>

          <Section title={t('trend')}>
            <div className="px-2 pb-4">
              {trend.days.length && sources.data?.total ? (
                <StackedTrend data={trend.days} series={trend.series} caption={t('trend')} />
              ) : sources.data ? (
                <EmptyState title={t('noData')} className="py-8" />
              ) : (
                <CardSkeleton className="h-60" />
              )}
            </div>
          </Section>

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <Section title={t('bySource')}>
              <div className="px-5 pb-5">
                {sources.data?.by_source.length ? (
                  <Donut caption={t('bySource')} centerValue={formatNumber(sources.data.total, s)} centerLabel={t('totalLeads')} data={sourceShares} />
                ) : sources.data ? (
                  <EmptyState title={t('noData')} className="py-8" />
                ) : (
                  <CardSkeleton className="h-44" />
                )}
              </div>
            </Section>
            <Section title={funnel.data ? `${t('funnel')} · ${funnel.data.pipeline.name}` : t('funnel')}>
              <div className="px-5 pb-5">
                {funnel.data?.deals ? (
                  <Funnel
                    caption={t('funnel')}
                    steps={funnel.data.stages.filter((x) => x.kind !== 'lost').map((x) => ({
                      name: x.name,
                      value: x.reached,
                      display: formatNumber(x.reached, s),
                      conversion: x.conversion_from_previous_pct === null ? null : t('funnelConversion', { pct: formatPercent(x.conversion_from_previous_pct / 100, s) }),
                    }))}
                  />
                ) : funnel.data ? (
                  <EmptyState title={t('noData')} className="py-8" />
                ) : (
                  <CardSkeleton className="h-44" />
                )}
              </div>
            </Section>
            <Section title={t('speed')}>
              <div className="space-y-4 px-5 pb-5">
                {overall?.leads ? (
                  <>
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-xs text-gray-600">{t('medianResponse')}</p>
                        <p className="font-heading text-3xl font-bold tracking-tight tabular-nums text-gray-900">{formatDuration(overall.median_seconds ?? null, s)}</p>
                      </div>
                      <p className="text-sm text-gray-600 tabular-nums">{t('responded', { count: formatNumber(overall.responded, s), total: formatNumber(overall.leads, s) })}</p>
                    </div>
                    <SegmentBar caption={t('speed')} segments={speedBars.map((b, i) => ({ ...b, muted: i === 3 }))} />
                  </>
                ) : speed.data ? (
                  <EmptyState title={t('noData')} className="py-8" />
                ) : (
                  <CardSkeleton className="h-40" />
                )}
              </div>
            </Section>
            <Section title={t('lostReasons')}>
              <div className="px-5 pb-5">
                {lost.data?.reasons.length ? (
                  <RankedShares
                    caption={t('lostReasons')}
                    rows={lost.data.reasons.map((x) => ({
                      label: x.reason,
                      share: (x.share_pct ?? 0) / 100,
                      primary: t('dealsOnMonth', { count: x.deals }),
                      secondary: `${formatPercent(x.share_pct === null ? null : x.share_pct / 100, s)} · ${formatMoneyValue(x.value, s, { compact: true })}`,
                    }))}
                  />
                ) : lost.data ? (
                  <EmptyState title={t('noData')} className="py-8" />
                ) : (
                  <CardSkeleton className="h-40" />
                )}
              </div>
            </Section>
          </div>

          <Section title={t('wonByMonth')}>
            <div className="px-2 pb-3">
              {won.data?.months.length ? (
                <Columns
                  caption={t('wonByMonth')}
                  tickFormatter={(v) => formatMoneyValue({ amount_minor: v, currency: won.data!.total.currency }, s, { compact: true })}
                  data={won.data.months.map((m) => ({
                    label: formatMonth(m.month),
                    value: m.value.amount_minor,
                    display: formatMoneyValue(m.value, s, { compact: true }),
                    note: t('dealsOnMonth', { count: m.deals }),
                  }))}
                />
              ) : won.data ? (
                <EmptyState title={t('noData')} className="py-8" />
              ) : (
                <CardSkeleton className="h-56" />
              )}
            </div>
          </Section>

          {podium.length > 0 && (
            <Section title={t('leaderboard')}>
              <ol className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
                {podium.map((a, i) => (
                  <li key={a.agent_id} className={cn('relative overflow-hidden rounded-2xl border p-4', i === 0 ? 'bg-gradient-to-br from-amber-50 to-white' : 'bg-gray-50/60')}>
                    <span className={cn('absolute end-3 top-3 grid size-8 place-items-center rounded-full font-heading text-sm font-bold text-white shadow-card', ['bg-amber-500', 'bg-gray-400', 'bg-orange-700'][i])} aria-hidden="true">{i + 1}</span>
                    <Avatar name={a.agent_name} seed={a.agent_id} size="lg" />
                    <p className="mt-3 truncate font-semibold text-gray-900">{a.agent_name}</p>
                    <p className="font-heading text-xl font-bold tracking-tight tabular-nums text-gray-900">{formatMoneyValue(a.won_value, s, { compact: true })}</p>
                    <p className="text-xs text-gray-600">{t('leaderWon', { count: a.deals_won })}</p>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <Section title={t('agentsTable')}>
            {sortedAgents.length ? (
              <div className="overflow-x-auto pb-2">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-gray-50/80 text-xs text-gray-600 uppercase">
                    <tr>
                      <SortHeader k="agent_name" label={t('colAgent')} />
                      <SortHeader k="assigned" label={t('colAssigned')} end />
                      <SortHeader k="contacted" label={t('colContacted')} end />
                      <SortHeader k="follow_ups_done" label={t('colFollowUps')} end />
                      <SortHeader k="overdue" label={t('colOverdue')} end />
                      <SortHeader k="deals_won" label={t('colWon')} end />
                      <SortHeader k="won_value" label={t('colWonValue')} end />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedAgents.map((a) => (
                      <tr key={a.agent_id} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2">
                            <Avatar name={a.agent_name} seed={a.agent_id} size="sm" />
                            <span className="font-medium">{a.agent_name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums">{formatNumber(a.assigned, s)}</td>
                        <td className="px-3 py-2.5 text-end tabular-nums">{formatNumber(a.contacted, s)}</td>
                        <td className="px-3 py-2.5 text-end tabular-nums">{formatNumber(a.follow_ups_done, s)}</td>
                        <td className="px-3 py-2.5 text-end">
                          <span className={cn('tabular-nums', a.overdue > 0 && 'rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700')}>{formatNumber(a.overdue, s)}</span>
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums">{formatNumber(a.deals_won, s)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-gray-100 sm:block" aria-hidden="true">
                              <div className="h-full rounded-full bg-brand" style={{ width: `${maxWon && a.won_value.amount_minor > 0 ? Math.max(3, (a.won_value.amount_minor / maxWon) * 100) : 0}%` }} />
                            </div>
                            <span className="font-semibold tabular-nums">{formatMoneyValue(a.won_value, s, { compact: true })}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : agents.data ? (
              <EmptyState title={t('noData')} className="py-8" />
            ) : (
              <CardSkeleton className="mx-4 mb-4 h-32" />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
