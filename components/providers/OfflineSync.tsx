'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { addNote, quickAdd } from '@/lib/api/endpoints/crm';
import { flushQueue } from '@/lib/offline-queue';
import { useWorkspaceId } from '@/lib/auth/SessionProvider';

/** Syncs the offline queue when the browser reconnects (and once on load). */
export function OfflineSync() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const t = useTranslations('offline');

  useEffect(() => {
    if (!ws) return;
    const run = async () => {
      if (!navigator.onLine) return;
      const sent = await flushQueue(ws, (item) => (item.kind === 'quick_add' ? quickAdd(item.payload) : addNote(item.payload.contactId, item.payload.body)));
      if (sent) {
        toast.success(t('synced', { count: sent }));
        qc.invalidateQueries({ queryKey: [ws] });
      }
    };
    run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [ws, qc, t]);

  return null;
}
