'use client';

import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title?: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  const t = useTranslations('states');
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <div className="grid size-12 place-items-center rounded-full bg-brand-surface text-brand-ink" aria-hidden="true">
        {icon ?? <Inbox className="size-6" />}
      </div>
      <div className="space-y-1">
        <p className="font-heading text-base font-semibold text-gray-900">{title ?? t('emptyTitle')}</p>
        {body && <p className="mx-auto max-w-sm text-sm text-gray-600">{body}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  body,
  onRetry,
  className,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations('states');
  const c = useTranslations('common');
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <div className="grid size-12 place-items-center rounded-full bg-red-50 text-red-600" aria-hidden="true">
        <AlertTriangle className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-heading text-base font-semibold text-gray-900">{title ?? t('errorTitle')}</p>
        <p className="mx-auto max-w-sm text-sm text-gray-600">{body ?? t('errorBody')}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="h-11">
          {c('retry')}
        </Button>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('divide-y divide-gray-100', className)} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ blocks = 3 }: { blocks?: number }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-7 w-48" />
      {Array.from({ length: blocks }, (_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn('h-24 w-full rounded-xl', className)} />;
}
