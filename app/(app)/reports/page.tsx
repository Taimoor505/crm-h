'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowDownUp, Download } from 'lucide-react';
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

const HBarChart = dynamic(() => import('@/components/crm/ReportCharts').then((m) => m.HBarChart), { ssr: false, loading: () => <CardSkeleton className="h-40" /> });
const VBarChart = dynamic(() => import('@/components/crm/ReportCharts').then((m) => m.VBarChart), { ssr: false, loading: () => <CardSkeleton className="h-56" /> });

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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: t('kpiNewLeads'), value: sources.data ? formatNumber(sources.data.total, s) : null },
              { label: t('kpiWonValue'), value: won.data ? formatMoneyValue(won.data.total, s, { compact: true }) : null },
              { label: t('kpiConversion'), value: funnel.data ? formatPercent(funnel.data.win_rate_pct === null ? null : funnel.data.win_rate_pct / 100, s) : null },
              { label: t('kpiSpeed'), value: speed.data ? formatDuration(speed.data.overall?.median_seconds ?? null, s) : null },
            ].map((k) =>
              k.value === null ? (
                <CardSkeleton key={k.label} className="h-20" />
              ) : (
                <div key={k.label} className="rounded-2xl border bg-card p-3 shadow-card">
                  <p className="text-xs font-medium text-gray-600">{k.label}</p>
                  <p className="mt-1 font-heading text-2xl font-bold tabular-nums text-gray-900">{k.value}</p>
                </div>
              ),
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <Section title={t('bySource')}>
              <div className="px-2 pb-3">
                {sources.data?.by_source.length ? (
                  <HBarChart caption={t('bySource')} valueLabel={t('leads')} data={sources.data.by_source.map((x) => ({ label: humanize(x.source), value: x.leads, display: formatNumber(x.leads, s) }))} />
                ) : sources.data ? (
                  <EmptyState title={t('noData')} className="py-8" />
                ) : (
                  <CardSkeleton className="h-40" />
                )}
              </div>
            </Section>
            <Section title={funnel.data ? `${t('funnel')} · ${funnel.data.pipeline.name}` : t('funnel')}>
              <div className="px-2 pb-3">
                {funnel.data?.deals ? (
                  <HBarChart
                    caption={t('funnel')}
                    valueLabel={t('deals')}
                    shades
                    data={funnel.data.stages.filter((x) => x.kind !== 'lost').map((x) => ({ label: x.name, value: x.reached, display: t('funnelReached', { count: formatNumber(x.reached, s) }) }))}
                  />
                ) : funnel.data ? (
                  <EmptyState title={t('noData')} className="py-8" />
                ) : (
                  <CardSkeleton className="h-40" />
                )}
              </div>
            </Section>
            <Section title={t('speed')}>
              <div className="px-2 pb-3">
                {overall?.leads ? <HBarChart caption={t('speed')} valueLabel={t('leads')} data={speedBars} shades /> : speed.data ? <EmptyState title={t('noData')} className="py-8" /> : <CardSkeleton className="h-40" />}
              </div>
            </Section>
            <Section title={t('lostReasons')}>
              <div className="px-2 pb-3">
                {lost.data?.reasons.length ? (
                  <HBarChart
                    caption={t('lostReasons')}
                    valueLabel={t('deals')}
                    data={lost.data.reasons.map((x) => ({ label: x.reason, value: x.deals, display: `${formatNumber(x.deals, s)} · ${formatPercent(x.share_pct === null ? null : x.share_pct / 100, s)} · ${formatMoneyValue(x.value, s, { compact: true })}` }))}
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
                <VBarChart
                  caption={t('wonByMonth')}
                  valueLabel={t('value')}
                  tickFormatter={(v) => formatMoneyValue({ amount_minor: v, currency: won.data!.total.currency }, s, { compact: true })}
                  data={won.data.months.map((m) => ({ label: m.month, value: m.value.amount_minor, display: `${formatMoneyValue(m.value, s)} · ${formatNumber(m.deals, s)} ${t('deals')}` }))}
                />
              ) : won.data ? (
                <EmptyState title={t('noData')} className="py-8" />
              ) : (
                <CardSkeleton className="h-56" />
              )}
            </div>
          </Section>

          <Section title={t('agentsTable')}>
            {sortedAgents.length ? (
              <div className="overflow-x-auto pb-2">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-xs text-gray-600">
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
                      <tr key={a.agent_id}>
                        <td className="px-3 py-2.5">
                          <span className="flex items-center gap-2">
                            <Avatar name={a.agent_name} seed={a.agent_id} size="sm" />
                            <span className="font-medium">{a.agent_name}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-end tabular-nums">{formatNumber(a.assigned, s)}</td>
                        <td className="px-3 py-2.5 text-end tabular-nums">{formatNumber(a.contacted, s)}</td>
                        <td className="px-3 py-2.5 text-end tabular-nums">{formatNumber(a.follow_ups_done, s)}</td>
                        <td className={cn('px-3 py-2.5 text-end tabular-nums', a.overdue > 0 && 'font-semibold text-red-700')}>{formatNumber(a.overdue, s)}</td>
                        <td className="px-3 py-2.5 text-end tabular-nums">{formatNumber(a.deals_won, s)}</td>
                        <td className="px-3 py-2.5 text-end font-medium tabular-nums">{formatMoneyValue(a.won_value, s)}</td>
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
