'use client';

import { useEffect } from 'react';
import { mockMode } from '@/mocks/mode';

/**
 * Registers the PWA service worker (public/sw.js, built from app/sw.ts) in
 * production. Skipped while API mocks run: MSW owns the same scope.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || mockMode() !== 'off' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((e) => console.warn('[pwa] service worker failed to register', e));
  }, []);
  return null;
}
