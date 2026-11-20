'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CalendarCheck, ChevronRight, Timer, UserPlus } from 'lucide-react';
import { useHomeSummary, useReport } from '@/hooks/queries/work';
import { useAllDeals, useMemberNames, usePipelines } from '@/hooks/queries/crm';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { useSession } from '@/lib/auth/SessionProvider';
import { usePermissions } from '@/lib/permissions';
import { dayKey, formatDate, formatDuration, formatMoneyValue, formatNumber, formatWeekday, zonedParts } from '@/lib/format';
import type { HomeSummary, Task } from '@/lib/api/types';
import { Section } from '@/components/layout/PageHeader';
import { SourceBadge, Avatar } from '@/components/crm/badges';
import { RelativeTime, TimeText } from '@/components/crm/values';
import { CallButton, DoneButton, WhatsAppButton } from '@/components/crm/ContactActions';
import { CardSkeleton, EmptyState, ErrorState, ListSkeleton } from '@/components/crm/states';
import { cn, firstName } from '@/lib/utils';
import { Suspense } from 'react';
import { SampleDataBanner } from '@/components/crm/SampleDataBanner';
import { Segmented } from '@/components/motion/Segmented';
import { CountUp } from '@/components/motion/CountUp';

export default function HomePage() {
  const t = useTranslations('home');
  const { me } = useSession();
  const { can } = usePermissions();
  const s = useWorkspaceSettings();
  const team = can('home.team');
  const [scope, setScope] = useState<'me' | 'team'>(team ? 'team' : 'me');
  const summary = useHomeSummary(team ? scope : 'me');

  const hour = zonedParts(new Date(), s.timezone).hour;
  const greeting = hour < 12 ? 'greetingMorning' : hour < 18 ? 'greetingAfternoon' : 'greetingEvening';

  return (
    <div className="space-y-5 lg:space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-[22px] font-bold tracking-tight lg:text-[28px]">{t(greeting, { name: firstName(me?.user.name) || '' })}</h1>
          <p className="mt-1 text-sm text-gray-600">{formatWeekday(new Date(), s)}, {formatDate(new Date(), s)}</p>
        </div>
        {team && (
          <Segmented
            ariaLabel={t('scope')}
            value={scope}
            onChange={setScope}
            options={[
              { value: 'me', label: t('mine') },
              { value: 'team', label: t('team') },
            ]}
          />
        )}
      </div>

      <Suspense>
        <SampleDataBanner />
      </Suspense>

      {summary.isError ? (
        <ErrorState onRetry={() => summary.refetch()} />
      ) : (
        <>
          <Kpis data={summary.data} />
          <div className="grid items-stretch gap-4 lg:grid-cols-2 lg:gap-6">
            <FollowUpsBlock data={summary.data} loading={summary.isLoading} />
            <NewLeadsBlock data={summary.data} loading={summary.isLoading} />
          </div>
          <PipelineSnapshot />
          {team && <TeamToday />}
        </>
      )}
    </div>
  );
}

function Kpis({ data }: { data?: HomeSummary }) {
  const t = useTranslations('home');
  const s = useWorkspaceSettings();
  if (!data) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <CardSkeleton key={i} className="h-[104px] rounded-2xl" />
        ))}
      </div>
    );
  }
  const num = (n: number) => formatNumber(n, s);
  const items = [
    { label: t('overdue'), value: <CountUp value={data.tasks.overdue} format={num} />, icon: AlertTriangle, chip: data.tasks.overdue > 0 ? 'bg-red-50 text-red-700' : 'bg-brand-surface text-brand-ink', tone: data.tasks.overdue > 0 ? 'text-red-700' : 'text-gray-900', href: '/follow-ups?tab=overdue' },
    { label: t('dueToday'), value: <CountUp value={data.tasks.due_today} format={num} />, icon: CalendarCheck, chip: 'bg-brand-surface text-brand-ink', tone: 'text-gray-900', href: '/follow-ups' },
    { label: t('newToday'), value: <CountUp value={data.leads.new_today} format={num} />, icon: UserPlus, chip: 'bg-brand-surface text-brand-ink', tone: 'text-gray-900', href: '/leads' },
    { label: t('speedToLead'), value: formatDuration(data.speed_to_lead_today.median_seconds, s), icon: Timer, chip: 'bg-brand-surface text-brand-ink', tone: 'text-gray-900', href: '/reports', hint: t('speedHint') },
  ];
  return (
    <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {items.map((k) => (
        <Link key={k.label} href={k.href} title={k.hint} className="lift flex min-h-[104px] flex-col justify-between rounded-2xl border bg-card p-4 shadow-card">
          <span className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-gray-600 lg:text-sm">{k.label}</span>
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', k.chip)} aria-hidden="true">
              <k.icon className="size-4" />
            </span>
          </span>
          <span className={cn('font-heading text-[28px] leading-none font-bold tracking-tight tabular-nums', k.tone)}>{k.value}</span>
        </Link>
      ))}
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const t = useTranslations('home');
  const name = task.contact?.name ?? task.title;
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      {task.contact_id && <Avatar name={name} seed={task.contact_id} />}
      <Link href={task.contact_id ? `/contacts/${task.contact_id}` : '/follow-ups'} className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{task.title}</p>
        <p className="flex items-center gap-1.5 text-xs">
          {task.is_overdue ? (
            <span className="font-semibold text-red-700">
              {t('overdueBy')} · <RelativeTime iso={task.due_at} />
            </span>
          ) : (
            <TimeText iso={task.due_at} className="text-gray-600" />
          )}
        </p>
      </Link>
      <div className="flex shrink-0 gap-1.5">
        {task.contact?.phone_e164 && task.contact_id && (
          <>
            <CallButton contactId={task.contact_id} name={name} phone={task.contact.phone_e164} taskId={task.id} />
            <WhatsAppButton contactId={task.contact_id} name={name} phone={task.contact.phone_e164} />
          </>
        )}
        <DoneButton task={task} />
      </div>
    </li>
  );
}

function FollowUpsBlock({ data, loading }: { data?: HomeSummary; loading: boolean }) {
  const t = useTranslations('home');
  const c = useTranslations('common');
  return (
    <Section
      title={t('followUpsTitle')}
      action={
        <Link href="/follow-ups" className="inline-flex min-h-10 items-center text-sm font-medium text-brand-ink hover:underline">
          {c('seeAll')}
        </Link>
      }
    >
      {loading ? (
        <ListSkeleton rows={3} />
      ) : data && data.tasks.next.length ? (
        <ul className="stagger divide-y divide-gray-100 pb-2">
          {/* Five rows on each side keeps the two panels the same height. */}
          {data.tasks.next.slice(0, 5).map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={<CalendarCheck className="size-6" />} title={t('followUpsEmpty')} body={t('followUpsEmptyBody')} />
      )}
    </Section>
  );
}

function NewLeadsBlock({ data, loading }: { data?: HomeSummary; loading: boolean }) {
  const t = useTranslations('home');
  const c = useTranslations('common');
  return (
    <Section
      title={t('newLeadsTitle')}
      action={
        <Link href="/leads" className="inline-flex min-h-10 items-center text-sm font-medium text-brand-ink hover:underline">
          {c('seeAll')}
        </Link>
      }
    >
      {loading ? (
        <ListSkeleton rows={3} />
      ) : data && data.leads.recent.length ? (
        <>
          {data.leads.unassigned ? (
            <Link href="/leads?owner=none" className="press mx-5 mb-1 flex min-h-11 items-center justify-between rounded-[10px] bg-amber-50 px-4 text-sm font-medium text-amber-950">
              {t('unassignedCount', { count: data.leads.unassigned })}
              <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          ) : null}
          <ul className="stagger divide-y divide-gray-100 pb-2">
            {data.leads.recent.slice(0, 4).map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={l.name} seed={l.id} />
                <Link href={`/contacts/${l.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{l.name || l.phone_e164}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
                    <SourceBadge source={l.source} />
                    <RelativeTime iso={l.last_enquiry_at} warnAfterMinutes={l.awaiting_response ? 30 : undefined} />
                    {l.awaiting_response && <span className="sr-only">{t('awaiting')}</span>}
                  </p>
                </Link>
                <div className="flex shrink-0 gap-1.5">
                  <CallButton contactId={l.id} name={l.name ?? ''} phone={l.phone_e164} />
                  <WhatsAppButton contactId={l.id} name={l.name ?? ''} phone={l.phone_e164} />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <EmptyState icon={<UserPlus className="size-6" />} title={t('newLeadsEmpty')} body={t('newLeadsEmptyBody')} />
      )}
    </Section>
  );
}

function PipelineSnapshot() {
  const t = useTranslations('home');
  const s = useWorkspaceSettings();
  const pipelines = usePipelines();
  const deals = useAllDeals();
  const pipeline = pipelines.data?.[0];

  const stages = useMemo(() => {
    if (!pipeline) return [];
    return pipeline.stages
      .filter((st) => st.kind === 'open')
      .map((st) => {
        const inStage = (deals.data ?? []).filter((d) => d.stage_id === st.id);
        const minor = inStage.reduce((a, d) => a + (d.value?.amount_minor ?? 0), 0);
        const currency = inStage.find((d) => d.value)?.value?.currency ?? s.currency;
        return { ...st, count: inStage.length, value: { amount_minor: minor, currency } };
      });
  }, [pipeline, deals.data, s.currency]);

  return (
    <Section title={pipeline ? `${t('pipelineTitle')} · ${pipeline.name}` : t('pipelineTitle')}>
      {pipelines.isLoading || deals.isLoading ? (
        <div className="flex gap-3 overflow-hidden px-5 pb-5">
          {Array.from({ length: 4 }, (_, i) => (
            <CardSkeleton key={i} className="h-24 w-44 shrink-0 rounded-2xl" />
          ))}
        </div>
      ) : stages.length ? (
        <ul className="stagger scrollbar-none grid snap-x auto-cols-[minmax(11rem,1fr)] grid-flow-col gap-3 overflow-x-auto px-5 pb-5">
          {stages.map((st) => (
            <li key={st.id} className="snap-start">
              <Link href={`/pipeline?pipeline=${pipeline!.id}&stage=${st.id}`} className="lift block h-full rounded-2xl bg-brand-surface/70 p-4">
                <p className="truncate text-xs font-medium text-gray-700">{st.name}</p>
                <p className="mt-2 font-heading text-xl font-bold tracking-tight tabular-nums text-brand-ink">{formatMoneyValue(st.value, s, { compact: true })}</p>
                <p className="text-xs text-gray-600">{t('dealsCount', { count: st.count })}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={t('pipelineEmpty')} className="py-6" />
      )}
    </Section>
  );
}

function TeamToday() {
  const t = useTranslations('home');
  const s = useWorkspaceSettings();
  const today = dayKey(new Date(), s.timezone);
  const agents = useReport('agents', { from: today, to: today });
  const speed = useReport('speed-to-lead', { from: today, to: today });
  const names = useMemberNames();

  const rows = (agents.data?.agents ?? []).map((a) => {
    const sp = speed.data?.by_agent.find((x) => x.agent_id === a.agent_id);
    return { id: a.agent_id, name: a.agent_name ?? names(a.agent_id) ?? '', calls: a.contacted, done: a.follow_ups_done, untouched: sp ? sp.leads - sp.responded : 0 };
  });

  return (
    <Section title={t('teamTitle')}>
      {agents.isLoading ? (
        <ListSkeleton rows={3} />
      ) : rows.length ? (
        <div className="overflow-x-auto pb-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs text-gray-600">
                <th scope="col" className="px-5 py-2 text-start font-medium">{t('colAgent')}</th>
                <th scope="col" className="px-2 py-2 text-end font-medium">{t('colCalls')}</th>
                <th scope="col" className="px-2 py-2 text-end font-medium"><span className="sm:hidden">{t('colDoneShort')}</span><span className="hidden sm:inline">{t('colDone')}</span></th>
                <th scope="col" className="px-5 py-2 text-end font-medium"><span className="sm:hidden">{t('colUntouchedShort')}</span><span className="hidden sm:inline">{t('colUntouched')}</span></th>
              </tr>
            </thead>
            <tbody className="stagger divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <Avatar name={r.name} seed={r.id} size="sm" />
                      <span className="truncate font-medium">{r.name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-end tabular-nums">{formatNumber(r.calls, s)}</td>
                  <td className="px-2 py-2.5 text-end tabular-nums">{formatNumber(r.done, s)}</td>
                  <td className="px-5 py-3 text-end">
                    <span className={cn('tabular-nums', r.untouched >= 3 && 'rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700')} title={r.untouched >= 3 ? t('untouchedHigh', { count: r.untouched }) : undefined}>
                      {formatNumber(r.untouched, s)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title={t('teamEmpty')} className="py-6" />
      )}
    </Section>
  );
}
