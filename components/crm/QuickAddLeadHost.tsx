'use client';

import dynamic from 'next/dynamic';
import { useUi } from '@/lib/ui-store';

// Loaded on first open to keep the shell's initial JS small (brief §10).
const QuickAddLead = dynamic(() => import('./QuickAddLead'), { ssr: false });

/** The global "+ Add lead" sheet. */
export function QuickAddLeadHost() {
  const open = useUi((s) => s.quickAddOpen);
  const prefill = useUi((s) => s.quickAddPrefill);
  if (!open) return null;
  return <QuickAddLead prefill={prefill} />;
}
