/// <reference lib="webworker" />
/**
 * The PWA service worker (Serwist). Caches the app shell and recently viewed
 * API lists, and loads the backend's push handlers from /push-sw.js.
 */
import { defaultCache } from '@serwist/next/worker';
import { NetworkFirst, Serwist, ExpirationPlugin, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: (PrecacheEntry | string)[] | undefined };

// Web push handlers owned by the backend team (public/push-sw.js).
importScripts('/push-sw.js');

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Last-viewed lists stay readable offline; fresh data wins when online.
      matcher: ({ url, request }) =>
        request.method === 'GET' && url.pathname.startsWith('/api/v1/') && /\/(contacts|deals|pipelines|tasks|home\/summary|conversations|notifications|custom-fields|me|branding)/.test(url.pathname),
      handler: new NetworkFirst({
        cacheName: 'api-lists',
        networkTimeoutSeconds: 4,
        plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 7 * 24 * 3600 })],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
