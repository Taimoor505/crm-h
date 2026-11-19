import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-end justify-between gap-3 lg:mb-6', className)}>
      <div className="min-w-0">
        <h1 className="font-heading text-xl font-bold text-gray-900 lg:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-card', className)}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <h2 className="font-heading text-base font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
