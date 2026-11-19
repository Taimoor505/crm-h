'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CalendarCheck, CalendarClock, MessageCircle, Phone, Video, MapPin, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHomeSummary, useTasks, useUpdateTask } from '@/hooks/queries/work';
import { useMemberNames } from '@/hooks/queries/crm';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { useSession } from '@/lib/auth/SessionProvider';
import { usePermissions } from '@/lib/permissions';
import { formatDateTime } from '@/lib/format';
import { presetDueAt, type DuePreset } from '@/lib/format/presets';
import type { Task, TaskBucket } from '@/lib/api/types';
import { PageHeader } from '@/components/layout/PageHeader';
import { CallButton, DoneButton, WhatsAppButton } from '@/components/crm/ContactActions';
import { RescheduleSheet, FollowUpSheet } from '@/components/crm/FollowUpSheet';
import { RelativeTime } from '@/components/crm/values';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/crm/states';
import { cn } from '@/lib/utils';

const TABS: TaskBucket[] = ['today', 'overdue', 'upcoming'];
const TYPE_ICONS = { call: Phone, whatsapp: MessageCircle, meeting: Video, site_visit: MapPin, other: Circle } as const;

export default function FollowUpsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <FollowUps />
    </Suspense>
  );
}

function FollowUps() {
  const t = useTranslations('followUps');
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { can, canWrite } = usePermissions();
  const team = can('tasks.assign_others');
  const tab = (TABS.includes(params.get('tab') as TaskBucket) ? params.get('tab') : 'today') as TaskBucket;
  const [scope, setScope] = useState<'me' | 'all'>('me');
  const [adding, setAdding] = useState(false);
  const summary = useHomeSummary(scope === 'all' ? 'team' : 'me');
  const counts: Record<TaskBucket, number | undefined> = {
    today: summary.data?.tasks.due_today,
    overdue: summary.data?.tasks.overdue,
    upcoming: summary.data?.tasks.upcoming,
  };

  return (
    <div>
      <PageHeader
        title={t('title')}
        actions={
          <>
            {team && (
              <div role="group" aria-label={t('show')} className="inline-flex rounded-lg border bg-white p-0.5">
                {(['me', 'all'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={scope === v} onClick={() => setScope(v)} className={cn('h-9 rounded-md px-3 text-sm font-medium', scope === v ? 'bg-brand text-on-brand' : 'text-gray-700 hover:bg-gray-50')}>
                    {v === 'me' ? t('mine') : t('team')}
                  </button>
                ))}
              </div>
            )}
            {canWrite && (
              <Button className="h-10" onClick={() => setAdding(true)}>
                <CalendarClock className="size-4" aria-hidden="true" />
                {t('add')}
              </Button>
            )}
          </>
        }
      />
      <div role="tablist" aria-label={t('title')} className="mb-4 grid grid-cols-3 gap-1 rounded-xl border bg-white p-1">
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => router.replace(`${pathname}?tab=${x}`, { scroll: false })}
            className={cn('flex min-h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium', tab === x ? 'bg-brand text-on-brand' : 'text-gray-700 hover:bg-gray-50')}
          >
            {t(x)}
            {counts[x] !== undefined && (
              <span className={cn('rounded-full px-1.5 text-xs tabular-nums', tab === x ? 'bg-white/25' : x === 'overdue' && counts[x]! > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100')}>{counts[x]}</span>
            )}
          </button>
        ))}
      </div>
      <TaskList key={`${tab}-${scope}`} bucket={tab} assignedTo={scope === 'all' ? 'all' : undefined} showAssignee={scope === 'all'} />
      {adding && <FollowUpSheet open onOpenChange={setAdding} />}
    </div>
  );
}

function TaskList({ bucket, assignedTo, showAssignee }: { bucket: TaskBucket; assignedTo?: string; showAssignee: boolean }) {
  const t = useTranslations('followUps');
  const c = useTranslations('common');
  const q = useTasks(bucket, { assigned_to: assignedTo });
  const tasks = q.data?.pages.flatMap((p) => p.data) ?? [];

  if (q.isLoading) return <ListSkeleton rows={5} />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!tasks.length) {
    const key = bucket === 'today' ? 'Today' : bucket === 'overdue' ? 'Overdue' : 'Upcoming';
    return (
      <div className="rounded-xl border bg-card shadow-card">
        <EmptyState icon={<CalendarCheck className="size-6" />} title={t(`empty${key}`)} body={t(`empty${key}Body`)} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border bg-card shadow-card">
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} showAssignee={showAssignee} />
        ))}
      </ul>
      {q.hasNextPage && (
        <Button variant="outline" className="h-11 w-full" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {c('loadMore')}
        </Button>
      )}
    </div>
  );
}

function TaskItem({ task, showAssignee }: { task: Task; showAssignee: boolean }) {
  const t = useTranslations('followUps');
  const co = useTranslations('callOutcome');
  const tt = useTranslations('taskTypes');
  const s = useWorkspaceSettings();
  const { session } = useSession();
  const names = useMemberNames();
  const { canWrite } = usePermissions();
  const update = useUpdateTask();
  const [picking, setPicking] = useState(false);
  const Icon = TYPE_ICONS[task.type] ?? Circle;
  const name = task.contact?.name ?? '';

  function reschedule(preset: DuePreset) {
    const due = presetDueAt(preset, s.timezone);
    update.mutate({ id: task.id, due_at: due }, { onSuccess: () => toast.success(t('moved', { when: formatDateTime(due, s) })) });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-brand-surface text-brand-ink" title={tt(task.type)} aria-hidden="true">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          {task.contact_id ? (
            <Link href={`/contacts/${task.contact_id}`} className="block truncate text-sm font-semibold text-gray-900 hover:underline">
              {task.title}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-gray-900">{task.title}</p>
          )}
          <p className={cn('mt-0.5 text-xs', task.is_overdue ? 'font-semibold text-red-700' : 'text-gray-600')}>
            {task.is_overdue ? <RelativeTime iso={task.due_at} /> : <span className="tabular-nums">{formatDateTime(task.due_at, s)}</span>}
            {showAssignee && task.assigned_to !== session?.userId && names(task.assigned_to) && <span className="text-gray-500"> · {t('assignedTo', { name: names(task.assigned_to)! })}</span>}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {task.contact?.phone_e164 && task.contact_id && (
            <>
              <CallButton contactId={task.contact_id} name={name} phone={task.contact.phone_e164} taskId={task.id} />
              <WhatsAppButton contactId={task.contact_id} name={name} phone={task.contact.phone_e164} className="hidden sm:grid" />
            </>
          )}
          <DoneButton task={task} />
        </div>
      </div>
      {canWrite && (
        <div className="mt-2 flex flex-wrap gap-1.5 ps-12" aria-label={t('reschedule')} role="group">
          {(['in_1h', 'tomorrow', 'next_week'] as const).map((p) => (
            <button key={p} type="button" onClick={() => reschedule(p)} disabled={update.isPending} className="min-h-9 rounded-full border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
              {co(p)}
            </button>
          ))}
          <button type="button" onClick={() => setPicking(true)} className="min-h-9 rounded-full border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
            {co('pickDate')}
          </button>
        </div>
      )}
      {picking && <RescheduleSheet open onOpenChange={setPicking} task={task} />}
    </li>
  );
}
