'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { closeCallOutcome, getUi, openCallOutcome, useUi } from '@/lib/ui-store';

const CallOutcomeSheet = dynamic(() => import('./CallOutcomeSheet'), { ssr: false });

/**
 * Opens the call outcome sheet when someone comes back to the app after
 * tapping Call (visibilitychange), or directly from a "Log call" button.
 */
export function CallOutcomeHost() {
  const call = useUi((s) => s.callOutcomeFor);

  useEffect(() => {
    const onVisible = () => {
      const pending = getUi().pendingCall;
      // Ignore the instant blur some browsers fire before the dialer opens.
      if (document.visibilityState === 'visible' && pending && Date.now() - pending.startedAt > 1500) openCallOutcome(pending);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  if (!call) return null;
  return <CallOutcomeSheet key={call.startedAt} call={call} onClose={closeCallOutcome} />;
}
