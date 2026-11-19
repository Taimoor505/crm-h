'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClearSamples } from '@/hooks/queries/admin';
import { useWorkspaceId } from '@/lib/auth/SessionProvider';
import { usePermissions } from '@/lib/permissions';

const key = (ws: string) => `crm.samples.${ws}`;

/** Shown after onboarding until the owner clears the sample data or keeps it. */
export function SampleDataBanner() {
  const t = useTranslations('onboarding');
  const ws = useWorkspaceId();
  const params = useSearchParams();
  const clear = useClearSamples();
  const { can } = usePermissions();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (params.get('samples') === '1') localStorage.setItem(key(ws), '1');
      setShow(localStorage.getItem(key(ws)) === '1');
    } catch {
      setShow(params.get('samples') === '1');
    }
  }, [params, ws]);

  if (!show || !can('settings.pipelines')) return null;

  const hide = () => {
    try {
      localStorage.removeItem(key(ws));
    } catch {
      // ignore
    }
    setShow(false);
  };

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand-surface px-4 py-3">
      <Sparkles className="size-5 text-brand-ink" aria-hidden="true" />
      <p className="flex-1 text-sm font-medium text-brand-ink">{t('sampleBanner')}</p>
      <div className="flex gap-2">
        <Button variant="ghost" className="h-10" onClick={hide}>
          {t('keepSamples')}
        </Button>
        <Button
          className="h-10"
          disabled={clear.isPending}
          onClick={() =>
            clear.mutate(undefined, {
              onSuccess: () => {
                toast.success(t('samplesCleared'));
                hide();
              },
            })
          }
        >
          {t('clearSamples')}
        </Button>
      </div>
    </div>
  );
}
