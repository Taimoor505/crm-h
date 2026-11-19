import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-center justify-between gap-3 lg:mb-7', className)}>
      <div className="min-w-0">
        <h1 className="font-heading text-[22px] font-bold tracking-tight text-gray-900 lg:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Material card with a title row. Fills its grid cell so neighbouring cards line up. */
export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-card', className)}>
      <div className="flex min-h-14 items-center justify-between gap-2 px-5 pt-4 pb-2">
        <h2 className="font-heading text-base font-semibold tracking-tight text-gray-900">{title}</h2>
        {action}
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}
