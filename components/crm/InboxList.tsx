'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MessageCircle } from 'lucide-react';
import { useConversations } from '@/hooks/queries/work';
import { useMemberNames } from '@/hooks/queries/crm';
import { useSession } from '@/lib/auth/SessionProvider';
import { usePermissions } from '@/lib/permissions';
import { Avatar } from './badges';
import { RelativeTime } from './values';
import { EmptyState, ErrorState, ListSkeleton } from './states';
import { Chip } from './DuePicker';
import { cn } from '@/lib/utils';

type Filter = 'mine' | 'unassigned' | 'all';

/** Conversation list with unread counts and the assigned agent (brief §8.7). */
export function InboxList({ activeId }: { activeId?: string }) {
  const t = useTranslations('inbox');
  const { userId } = useSession();
  const { can } = usePermissions();
  const names = useMemberNames();
  const q = useConversations();
  const manager = can('inbox.view_all');
  const [filter, setFilter] = useState<Filter>(manager ? 'all' : 'mine');

  // The API has no filter yet, so Mine/Unassigned are applied here.
  const list = (q.data ?? []).filter((c) => (filter === 'mine' ? c.assigned_to === userId : filter === 'unassigned' ? !c.assigned_to : true));

  return (
    <div className="flex h-full flex-col">
      {manager && (
        <div role="group" aria-label={t('filter')} className="flex gap-2 px-4 py-3">
          {(['mine', 'unassigned', 'all'] as const).map((f) => (
            <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>
              {t(f)}
            </Chip>
          ))}
        </div>
      )}
      {q.isLoading ? (
        <ListSkeleton rows={6} />
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !list.length ? (
        <EmptyState icon={<MessageCircle className="size-6" />} title={q.data?.length ? t('emptyFilter') : t('empty')} body={q.data?.length ? undefined : t('emptyBody')} />
      ) : (
        <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto">
          {list.map((c) => {
            const name = c.contact?.name ?? c.contact?.phone_e164 ?? '';
            const unread = c.unread_count > 0;
            const last = c.last_message;
            return (
              <li key={c.id}>
                <Link
                  href={`/inbox/${c.id}`}
                  aria-current={activeId === c.id ? 'page' : undefined}
                  className={cn('flex items-center gap-3 px-4 py-3 hover:bg-gray-50', activeId === c.id && 'bg-brand-surface')}
                >
                  <Avatar name={name} seed={c.contact_id} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn('truncate text-sm', unread ? 'font-bold text-gray-900' : 'font-medium text-gray-900')}>{name}</p>
                      <RelativeTime iso={c.last_message_at} className={cn('shrink-0 text-xs', unread ? 'font-semibold text-brand-ink' : 'text-gray-500')} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('truncate text-xs', unread ? 'text-gray-900' : 'text-gray-600')}>
                        {last?.direction === 'outbound' && t('you')}
                        {last?.body}
                      </p>
                      {unread && (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-on-brand tabular-nums" aria-label={t('unread', { count: c.unread_count })}>
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                    {manager && c.assigned_to && names(c.assigned_to) && <p className="mt-0.5 truncate text-[11px] text-gray-500">{t('assignedTo', { name: names(c.assigned_to)! })}</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
