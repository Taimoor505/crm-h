'use client';

import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { formatPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';

/** National format for the workspace's own country, international otherwise. */
export function PhoneText({ e164, className }: { e164: string | null | undefined; className?: string }) {
  const s = useWorkspaceSettings();
  if (!e164) return null;
  return (
    <span dir="ltr" className={cn('tabular-nums', className)}>
      {formatPhone(e164, 'auto', s.country)}
    </span>
  );
}
