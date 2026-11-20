'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, CalendarClock, CheckCircle2, MessageCircle, NotebookPen, Phone, Sparkles, TrendingUp } from 'lucide-react';
import type { ContactSummary } from '@/lib/api/types';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { daysSince, formatMoneyValue, formatNumber, formatRelative } from '@/lib/format';
import { CardSkeleton } from './states';
import { cn } from '@/lib/utils';

export type NextActionKind = 'respond' | 'overdue' | 'stuck' | 'noFollowUp' | 'noDeal' | 'quiet' | 'good';

/** Picks the single most useful next step for this lead. */
export function nextBestAction(s: ContactSummary, tz: string): { kind: NextActionKind; days?: number } {
  const closed = s.contact.status === 'won' || s.contact.status === 'lost' || s.contact.status === 'cold';
  if (!s.contact.first_response_at && !closed) return { kind: 'respond' };
  if (s.follow_ups.overdue > 0) return { kind: 'overdue' };
  if (s.deals.open_count > 0 && s.deals.oldest_open_stage_at) {
    const days = daysSince(s.deals.oldest_open_stage_at, tz);
    if (days >= 14) return { kind: 'stuck', days };
  }
  if (s.follow_ups.open === 0 && !closed) return { kind: 'noFollowUp' };
  if (s.deals.open_count + s.deals.won_count === 0 && ['contacted', 'qualified'].includes(s.contact.status)) return { kind: 'noDeal' };
  if (s.contact.last_activity_at) {
    const days = daysSince(s.contact.last_activity_at, tz);
    if (days >= 7 && !closed) return { kind: 'quiet', days };
  }
  return { kind: 'good' };
}

const TONE: Record<NextActionKind, string> = {
  respond: 'border-red-200 bg-red-50 text-red-900',
  overdue: 'border-amber-200 bg-amber-50 text-amber-950',
  stuck: 'border-amber-200 bg-amber-50 text-amber-950',
  noFollowUp: 'border-brand/20 bg-brand-surface text-brand-ink',
  noDeal: 'border-brand/20 bg-brand-surface text-brand-ink',
  quiet: 'border-brand/20 bg-brand-surface text-brand-ink',
  good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
};

/** "Next best action" banner. `action` renders the button for the chosen kind (or nothing). */
export function NextBestAction({ summary, action }: { summary: ContactSummary | undefined; action: (kind: NextActionKind) => ReactNode }) {
  const t = useTranslations('contact');
  const s = useWorkspaceSettings();
  if (!summary) return <CardSkeleton className="h-16 rounded-2xl" />;
  const nba = nextBestAction(summary, s.timezone);
  const Icon = nba.kind === 'respond' || nba.kind === 'overdue' || nba.kind === 'stuck' ? AlertTriangle : nba.kind === 'good' ? CheckCircle2 : Sparkles;
  const text = {
    respond: t('nbaRespond', { time: formatRelative(summary.contact.last_enquiry_at ?? summary.contact.created_at, s) }),
    overdue: t('nbaOverdue', { count: summary.follow_ups.overdue }),
    stuck: t('nbaStuck', { days: nba.days ?? 0 }),
    noFollowUp: t('nbaNoFollowUp'),
    noDeal: t('nbaNoDeal'),
    quiet: t('nbaQuiet', { days: nba.days ?? 0 }),
    good: t('nbaGood', { time: summary.follow_ups.next_due_at ? formatRelative(summary.follow_ups.next_due_at, s) : '—' }),
  }[nba.kind];
  return (
    <section aria-label={t('nbaTitle')} className={cn('flex flex-wrap items-center gap-3 rounded-2xl border p-3.5 lg:p-4', TONE[nba.kind])}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/70 shadow-card" aria-hidden="true">
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold tracking-wider uppercase opacity-75">{t('nbaTitle')}</p>
        <p className="text-sm font-medium">{text}</p>
      </div>
      {action(nba.kind)}
    </section>
  );
}

/** Activity counts and deal totals for the lead. */
export function LeadStats({ summary }: { summary: ContactSummary | undefined }) {
  const t = useTranslations('contact');
  const s = useWorkspaceSettings();
  if (!summary) return <CardSkeleton className="h-24 rounded-2xl" />;
  const stats = [
    { label: t('statCalls'), value: summary.activity.calls, icon: Phone, tone: 'bg-sky-50 text-sky-700' },
    { label: t('statWhatsapp'), value: summary.activity.whatsapp, icon: MessageCircle, tone: 'bg-emerald-50 text-emerald-700' },
    { label: t('statNotes'), value: summary.activity.notes, icon: NotebookPen, tone: 'bg-violet-50 text-violet-700' },
    { label: t('statFollowUps'), value: summary.follow_ups.done, icon: CalendarClock, tone: 'bg-amber-50 text-amber-800' },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_minmax(0,18rem)]">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((x) => (
          <li key={x.label} className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-card">
            <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl', x.tone)} aria-hidden="true">
              <x.icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-heading text-xl leading-none font-bold tabular-nums text-gray-900">{formatNumber(x.value, s)}</p>
              <p className="mt-1 truncate text-xs text-gray-600">{x.label}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-card">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-surface text-brand-ink" aria-hidden="true">
          <TrendingUp className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-600">{t('pipelineValue')}</p>
          <p className="font-heading text-xl leading-tight font-bold tabular-nums text-gray-900">{formatMoneyValue(summary.deals.open_value, s, { compact: true })}</p>
          <p className="truncate text-xs text-gray-600">
            {t('dealsSummary', { open: summary.deals.open_count, won: summary.deals.won_count })}
            {summary.deals.won_count > 0 && <> · <span className="font-semibold text-emerald-700">{formatMoneyValue(summary.deals.won_value, s, { compact: true })}</span></>}
          </p>
        </div>
      </div>
    </div>
  );
}
