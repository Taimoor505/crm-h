'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  badge?: React.ReactNode;
}

/**
 * Material 3 segmented control. The selected pill slides between options:
 * measured position + CSS transition, so it costs no animation library.
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
  const wrap = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const btn = el.querySelector<HTMLElement>('[data-active="true"]');
      if (btn) setPill({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // Only slide after the first paint, so the pill doesn't fly in on load.
    const id = requestAnimationFrame(() => setAnimate(true));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(id);
    };
  }, [value, options.length]);

  return (
    <div ref={wrap} role={role} aria-label={ariaLabel} className={cn('relative inline-flex gap-1 rounded-full bg-card p-1 shadow-card', fullWidth && 'flex w-full', className)}>
      {pill && (
        <span
          aria-hidden="true"
          className={cn('absolute top-1 bottom-1 rounded-full bg-brand shadow-card', animate && 'transition-[left,width] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none')}
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            data-active={active}
            role={role === 'tablist' ? 'tab' : undefined}
            aria-selected={role === 'tablist' ? active : undefined}
            aria-pressed={role === 'group' ? active : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              'press relative flex items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors duration-200',
              size === 'lg' ? 'min-h-11' : 'h-9',
              fullWidth && 'flex-1',
              active ? 'text-on-brand' : 'text-gray-600 hover:text-gray-900',
            )}
          >
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
