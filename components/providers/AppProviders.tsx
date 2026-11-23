'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QueryClientProvider } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { BootSplash } from '@/components/layout/BootSplash';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeQueryClient } from '@/lib/query-client';
import { SessionProvider } from '@/lib/auth/SessionProvider';
import { mockMode } from '@/mocks/mode';
import { setAppState } from '@/lib/app-state';

/**
 * Query client, API mocks (docs/frontend-endpoint-map.md), session and toasts.
 */
export function AppProviders({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const t = useTranslations('errors');
  const routerRef = useRef(router);
  routerRef.current = router;

  const [client] = useState(() =>
    makeQueryClient({
      onUnauthorized: () => {
        const next = window.location.pathname;
        if (!next.startsWith('/login')) routerRef.current.replace(`/login?next=${encodeURIComponent(next)}`);
      },
      onSuspended: () => routerRef.current.replace('/suspended'),
      messages: { generic: t('generic'), retry: t('retry'), offline: t('offline') },
    }),
  );

  const mode = mockMode();
  const [mocksReady, setMocksReady] = useState(mode === 'off');
  useEffect(() => {
    if (mode === 'off') return;
    let cancelled = false;
    import('@/mocks/browser')
      .then((m) => m.startMocks(mode))
      .catch((e) => console.error('[mocks] failed to start', e))
      .finally(() => !cancelled && setMocksReady(true));
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    const update = () => setAppState({ offline: !navigator.onLine });
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!mocksReady) return <BootSplash />;

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={300}>
        <SessionProvider>{children}</SessionProvider>
      </TooltipProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

export { BootSplash };
