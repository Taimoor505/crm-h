import { setupWorker } from 'msw/browser';
import type { MockMode } from './mode';

let started: Promise<void> | null = null;

export function startMocks(mode: MockMode): Promise<void> {
  if (mode === 'off' || typeof window === 'undefined') return Promise.resolve();
  started ??= (async () => {
    const handlers =
      mode === 'all'
        ? (await import('./handlers/all')).allHandlers
        : (await import('./handlers/missing')).missingHandlers;
    const worker = setupWorker(...handlers);
    await worker.start({
      // Real routes (and Next assets) pass straight through.
      onUnhandledRequest: 'bypass',
      quiet: true,
      serviceWorker: { url: '/mockServiceWorker.js' },
    });
  })();
  return started;
}
