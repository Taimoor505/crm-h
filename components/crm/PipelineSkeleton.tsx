'use client';

import { useTranslations } from 'next-intl';
import type { Stage } from '@/lib/api/types';
import { stageTone } from './badges';
import { cn } from '@/lib/utils';

/** Placeholder deal cards (heights vary so it reads as content, not a grid). */
export function DealCardSkeletons({ count = 3 }: { count?: number }) {
  const heights = ['h-[104px]', 'h-[88px]', 'h-[112px]', 'h-[96px]'];
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden="true" className={cn('rounded-xl border bg-white p-3 shadow-card', heights[i % heights.length])}>
          <div className="flex items-center gap-2">
            <span className="size-7 animate-pulse rounded-full bg-gray-200" />
            <span className="h-3 w-28 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="mt-3 h-3 w-20 animate-pulse rounded bg-gray-100" />
          <div className="mt-2 h-3 w-36 animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </>
  );
}

/**
 * The board as it will look, while deals (or the drag-and-drop code) load:
 * real stage names and colours, shimmering cards. Without stages it shows
 * four neutral columns.
 */
export function BoardSkeleton({ stages }: { stages?: Stage[] }) {
  const t = useTranslations('common');
  const cols = stages ?? Array.from({ length: 4 }, (_, i) => ({ id: String(i), name: '', kind: 'open' as const }));
  return (
    <div role="status" aria-label={t('loading')} className="flex min-h-[60vh] gap-3 overflow-x-auto pb-4">
      {cols.map((stage, i) => (
        <section key={stage.id} className="relative flex w-72 shrink-0 flex-col overflow-hidden rounded-2xl bg-gray-100/80 ring-1 ring-black/5">
          <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-1', stageTone(i, stage.kind))} />
          <header className="space-y-1.5 px-4 pt-4 pb-2">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', stageTone(i, stage.kind))} />
              {stage.name ? (
                <h2 className="flex-1 truncate font-heading text-sm font-semibold text-gray-900">{stage.name}</h2>
              ) : (
                <span className="h-3.5 w-24 flex-1 animate-pulse rounded bg-gray-200" />
              )}
              <span className="h-5 w-7 animate-pulse rounded-full bg-white shadow-card" />
            </div>
            <div className="ms-[18px] h-3.5 w-16 animate-pulse rounded bg-gray-200" />
          </header>
          <div className="flex flex-1 flex-col gap-2.5 p-2.5">
            <DealCardSkeletons count={stage.kind === 'open' ? 3 - (i % 2) : 1} />
          </div>
        </section>
      ))}
    </div>
  );
}
