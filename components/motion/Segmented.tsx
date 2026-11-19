'use client';

import { useId } from 'react';
import { m } from 'motion/react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  badge?: React.ReactNode;
}

/**
 * Material 3 segmented control. The selected pill slides between options
 * (shared layout animation).
 */
export function Segmented<T extends string>({
  options, value, onChange, ariaLabel, role = 'group', fullWidth, size = 'md', className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  role?: 'group' | 'tablist';
  fullWidth?: boolean;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const id = useId();
  return (
    <div role={role} aria-label={ariaLabel} className={cn('inline-flex gap-1 rounded-full bg-card p-1 shadow-card', fullWidth && 'flex w-full', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role={role === 'tablist' ? 'tab' : undefined}
            aria-selected={role === 'tablist' ? active : undefined}
            aria-pressed={role === 'group' ? active : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              'press relative flex items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors',
              size === 'lg' ? 'min-h-11' : 'h-9',
              fullWidth && 'flex-1',
              active ? 'text-on-brand' : 'text-gray-600 hover:text-gray-900',
            )}
          >
            {active && <m.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-brand shadow-card" aria-hidden="true" />}
            <span className="relative">{o.label}</span>
            {o.badge !== undefined && o.badge !== null && (
              <span className={cn('relative rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-white/25' : 'bg-gray-100')}>{o.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
