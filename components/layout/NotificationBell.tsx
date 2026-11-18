'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMarkRead, useNotifications, useUnreadCount } from '@/hooks/queries/work';
import { NotificationList } from '@/components/crm/NotificationList';
import { EmptyState, ListSkeleton } from '@/components/crm/states';
import { useIsDesktop } from '@/hooks/use-media-query';

function BellIcon({ count }: { count: number }) {
  return (
    <span className="relative inline-flex">
      <Bell className="size-5" aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -end-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  );
}

/** Popover list on desktop; a link to /notifications on mobile (brief §8.8). */
export function NotificationBell() {
  const t = useTranslations('bell');
  const desktop = useIsDesktop();
  const { data: count = 0 } = useUnreadCount();
  const [open, setOpen] = useState(false);
  const label = `${t('label')}${count ? `, ${t('unread', { count })}` : ''}`;
  const btn = 'grid size-11 place-items-center rounded-full text-gray-700 hover:bg-gray-100';

  if (!desktop) {
    return (
      <Link href="/notifications" aria-label={label} className={btn}>
        <BellIcon count={count} />
      </Link>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className={btn}>
          <BellIcon count={count} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        {open && <BellPanel onNavigate={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  );
}

function BellPanel({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations('bell');
  const q = useNotifications(false);
  const markRead = useMarkRead();
  const items = q.data?.pages.flatMap((p) => p.data).slice(0, 8) ?? [];
  return (
    <div>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <p className="font-heading text-sm font-semibold">{t('title')}</p>
        <button type="button" onClick={() => markRead.mutate({ all: true })} className="text-xs font-medium text-brand-ink hover:underline">
          {t('markAllRead')}
        </button>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {q.isLoading ? <ListSkeleton rows={4} /> : items.length ? <NotificationList items={items} onNavigate={onNavigate} compact /> : <EmptyState title={t('empty')} body={t('emptyBody')} />}
      </div>
      <Link href="/notifications" onClick={onNavigate} className="block border-t px-4 py-3 text-center text-sm font-medium text-brand-ink hover:bg-gray-50">
        {t('viewAll')}
      </Link>
    </div>
  );
}
