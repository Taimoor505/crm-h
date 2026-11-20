'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, CalendarClock } from 'lucide-react';
import type { Deal, Stage } from '@/lib/api/types';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { daysSince, isOverdue } from '@/lib/format';
import { MoneyText, RelativeTime } from './values';
import { OwnerAvatar } from './badges';
import { cn } from '@/lib/utils';

/** Contact, value, owner, days in stage, next follow-up (brief §8.5). */
export function DealCard({
  deal, ownerName, nextStage, onMoveNext, dragging, className,
}: {
  deal: Deal;
  ownerName: string | null;
  nextStage?: Stage | null;
  onMoveNext?: () => void;
  dragging?: boolean;
  className?: string;
}) {
  const t = useTranslations('deal');
  const p = useTranslations('pipeline');
  const s = useWorkspaceSettings();
  const days = daysSince(deal.stage_entered_at, s.timezone);
  const overdue = deal.next_task_due_at ? isOverdue(deal.next_task_due_at) : false;

  return (
    <div className={cn('lift rounded-xl border bg-card p-3.5 shadow-card hover:border-gray-300', dragging && 'rotate-2 shadow-float ring-2 ring-brand', className)}>
      <div className="flex items-start justify-between gap-2">
        <Link href={`/contacts/${deal.contact_id}`} className="min-w-0 flex-1" onPointerDown={(e) => e.stopPropagation()}>
          <p className="truncate text-sm font-semibold text-gray-900 hover:underline">{deal.contact?.name ?? deal.title}</p>
          {deal.contact && <p className="truncate text-xs text-gray-600">{deal.title}</p>}
        </Link>
        <OwnerAvatar userId={deal.owner_id} name={ownerName} />
      </div>
      <MoneyText value={deal.value} className="mt-2.5 block font-heading text-lg font-bold tracking-tight text-gray-900" />
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
        <span className={cn('rounded-md px-1.5 py-0.5', days >= 14 ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-700')}>{t('daysInStage', { count: days })}</span>
        <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5', overdue ? 'bg-red-50 text-red-700' : deal.next_task_due_at ? 'bg-brand-surface text-brand-ink' : 'bg-amber-50 text-amber-800')}>
          <CalendarClock className="size-3" aria-hidden="true" />
          {deal.next_task_due_at ? (
            <>
              {overdue && <span>{p('overdue')} ·</span>}
              <RelativeTime iso={deal.next_task_due_at} />
            </>
          ) : (
            t('noFollowUp')
          )}
        </span>
      </div>
      {nextStage && onMoveNext && (
        <button
          type="button"
          onClick={onMoveNext}
          className="press mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-brand-surface text-sm font-semibold text-brand-ink hover:brightness-[0.97]"
        >
          {p('moveNext', { stage: nextStage.name })}
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
