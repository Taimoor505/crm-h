'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Bell, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMarkRead, useNotifications } from '@/hooks/queries/work';
import { PageHeader } from '@/components/layout/PageHeader';
import { NotificationList } from '@/components/crm/NotificationList';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/crm/states';
import { Chip } from '@/components/crm/DuePicker';

export default function NotificationsPage() {
  const t = useTranslations('bell');
  const c = useTranslations('common');
  const n = useTranslations('nav');
  const [unread, setUnread] = useState(false);
  const q = useNotifications(unread);
  const markRead = useMarkRead();
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div>
      <PageHeader
        title={t('title')}
        actions={
          <>
            <Button variant="outline" className="h-10" onClick={() => markRead.mutate({ all: true })}>
              {t('markAllRead')}
            </Button>
            <Button asChild variant="ghost" size="icon" className="size-10" aria-label={n('settings')}>
              <Link href="/settings/notifications">
                <Settings className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-3 flex gap-2">
        <Chip selected={!unread} onClick={() => setUnread(false)}>
          {c('all')}
        </Chip>
        <Chip selected={unread} onClick={() => setUnread(true)}>
          {t('unreadOnly')}
        </Chip>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        {q.isLoading ? (
          <ListSkeleton rows={6} />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : items.length ? (
          <NotificationList items={items} />
        ) : (
          <EmptyState icon={<Bell className="size-6" />} title={t('empty')} body={t('emptyBody')} />
        )}
      </div>
      {q.hasNextPage && (
        <Button variant="outline" className="mt-3 h-11 w-full" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {c('loadMore')}
        </Button>
      )}
    </div>
  );
}
