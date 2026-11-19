'use client';

import dynamic from 'next/dynamic';
import { isDevToolsEnabled } from '@/lib/dev-tools';

const Panel = dynamic(() => import('./DevSwitcher').then((m) => m.DevSwitcher), { ssr: false });

/** Development only; never part of the production bundle's initial load. */
export function DevSwitcher() {
  return isDevToolsEnabled() ? <Panel /> : null;
}
