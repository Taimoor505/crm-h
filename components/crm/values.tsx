'use client';

import { useEffect, useState } from 'react';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import {
  formatDate, formatDateTime, formatMoney, formatMoneyValue, formatRelative, formatTime, minutesSince, type Money,
} from '@/lib/format';
import { cn } from '@/lib/utils';

export function MoneyText({ value, amount, currency, compact, className }: { value?: Money | null; amount?: number | null; currency?: string; compact?: boolean; className?: string }) {
  const s = useWorkspaceSettings();
  const text = value !== undefined ? formatMoneyValue(value, s, { compact }) : formatMoney(amount ?? null, currency ?? s.currency, s, { compact });
  return <span className={cn('tabular-nums', className)}>{text}</span>;
}

/** A shared minute tick so every relative time on screen updates together. */
let tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | null = null;
function useMinuteTick() {
  const [, setN] = useState(0);
  useEffect(() => {
    const l = () => setN((n) => n + 1);
    tickListeners.add(l);
    if (!tickTimer) tickTimer = setInterval(() => tickListeners.forEach((f) => f()), 60_000);
    return () => {
      tickListeners.delete(l);
      if (!tickListeners.size && tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
        tickListeners = new Set();
      }
    };
  }, []);
}

/** "5 min ago"; updates every minute. `warnAfterMinutes` turns it red. */
export function RelativeTime({ iso, className, warnAfterMinutes }: { iso: string | null | undefined; className?: string; warnAfterMinutes?: number }) {
  const s = useWorkspaceSettings();
  useMinuteTick();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!iso) return null;
  const warn = warnAfterMinutes !== undefined && minutesSince(iso) >= warnAfterMinutes;
  return (
    <time dateTime={iso} title={formatDateTime(iso, s)} className={cn('tabular-nums', warn && 'font-semibold text-red-700', className)} suppressHydrationWarning>
      {mounted ? formatRelative(iso, s) : formatDate(iso, s)}
    </time>
  );
}

export function DateText({ iso, withTime, className }: { iso: string | null | undefined; withTime?: boolean; className?: string }) {
  const s = useWorkspaceSettings();
  if (!iso) return <span className={className}>—</span>;
  return (
    <time dateTime={iso} className={cn('tabular-nums', className)}>
      {withTime ? formatDateTime(iso, s) : formatDate(iso, s)}
    </time>
  );
}

export function TimeText({ iso, className }: { iso: string; className?: string }) {
  const s = useWorkspaceSettings();
  return (
    <time dateTime={iso} className={cn('tabular-nums', className)}>
      {formatTime(iso, s)}
    </time>
  );
}
