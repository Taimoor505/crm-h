import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function SettingsPage({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-gray-600">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function SettingsCard({ title, description, children, footer, className }: { title?: string; description?: string; children: ReactNode; footer?: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-card', className)}>
      {(title || description) && (
        <div className="px-4 pt-4">
          {title && <h3 className="font-heading text-base font-semibold">{title}</h3>}
          {description && <p className="mt-0.5 text-sm text-gray-600">{description}</p>}
        </div>
      )}
      <div className="p-4">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t px-4 py-3">{footer}</div>}
    </section>
  );
}
