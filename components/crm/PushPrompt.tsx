'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BellRing, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotificationSettings } from '@/hooks/queries/work';
import { enablePush, pushSupport } from '@/lib/push';
import { useUi } from '@/lib/ui-store';

const DISMISS_KEY = 'crm.push-prompt.dismissed';

/** Shown after the person's first useful action, never on first load (brief §8.8). */
export function PushPrompt() {
  const t = useTranslations('pushPrompt');
  const actions = useUi((s) => s.usefulActions);
  const [show, setShow] = useState(false);
  const settings = useNotificationSettings();

  useEffect(() => {
    if (actions < 1 || pushSupport() !== 'supported') return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      dismissed = false;
    }
    if (!dismissed) setShow(true);
  }, [actions]);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
    setShow(false);
  };

  return (
    <div role="dialog" aria-labelledby="push-title" className="fixed inset-x-3 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md rounded-xl border bg-white p-4 shadow-float lg:bottom-6">
      <div className="flex gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-surface text-brand-ink" aria-hidden="true">
          <BellRing className="size-5" />
        </span>
        <div className="flex-1">
          <p id="push-title" className="font-heading text-sm font-semibold">{t('title')}</p>
          <p className="mt-0.5 text-sm text-gray-600">{t('body')}</p>
          <div className="mt-3 flex gap-2">
            <Button
              className="h-10"
              onClick={async () => {
                const r = await enablePush(settings.data?.push.vapid_public_key ?? null).catch(() => 'unsupported' as const);
                if (r === 'granted') toast.success(t('enabled'));
                else if (r === 'denied') toast.error(t('denied'));
                dismiss();
              }}
            >
              {t('allow')}
            </Button>
            <Button variant="ghost" className="h-10" onClick={dismiss}>
              {t('later')}
            </Button>
          </div>
        </div>
        <button type="button" onClick={dismiss} aria-label={t('later')} className="grid size-8 place-items-center rounded-full text-gray-500 hover:bg-gray-100">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
