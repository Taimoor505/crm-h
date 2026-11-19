'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertCircle, Bell, CalendarClock, Trophy, UserPlus } from 'lucide-react';
import type { AppNotification } from '@/lib/api/types';
import { useMarkRead } from '@/hooks/queries/work';
import { RelativeTime } from './values';
import { cn } from '@/lib/utils';

const ICONS: Record<string, typeof Bell> = {
  'lead.assigned': UserPlus,
  'lead.reenquired': UserPlus,
  'lead.untouched': AlertCircle,
  'lead.unassigned': UserPlus,
  'task.assigned': CalendarClock,
  'task.reminder': CalendarClock,
  'task.overdue': CalendarClock,
  'deal.won': Trophy,
};

/** Where a notification leads: the lead, the deal's lead, or the follow-ups list. */
export function notificationHref(n: AppNotification): string {
  if (n.data.contact_id) return `/contacts/${n.data.contact_id}`;
  if (n.data.task_id) return '/follow-ups';
  if (n.type.startsWith('billing.')) return '/settings/billing';
  if (n.type.startsWith('deal.')) return '/pipeline';
  return '/notifications';
}

export function NotificationList({ items, onNavigate, compact }: { items: AppNotification[]; onNavigate?: () => void; compact?: boolean }) {
  const t = useTranslations('bell');
  const router = useRouter();
  const markRead = useMarkRead();

  return (
    <ul className="stagger divide-y divide-gray-100">
      {items.map((n) => {
        const Icon = ICONS[n.type] ?? Bell;
        const unread = !n.read_at;
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => {
                if (unread) markRead.mutate({ ids: [n.id] });
                onNavigate?.();
                router.push(notificationHref(n));
              }}
              className={cn('flex w-full items-start gap-3 px-4 text-start hover:bg-gray-50', compact ? 'py-2.5' : 'py-3.5', unread && 'bg-brand-surface/40')}
            >
              <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full', n.priority === 'urgent' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700')} aria-hidden="true">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block text-sm', unread ? 'font-semibold text-gray-900' : 'text-gray-800')}>{n.title}</span>
                {n.body && <span className="block truncate text-xs text-gray-600">{n.body}</span>}
                <span className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                  <RelativeTime iso={n.created_at} />
                  {n.priority === 'urgent' && <span className="font-medium text-red-700">{t('urgent')}</span>}
                </span>
              </span>
              {unread && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
