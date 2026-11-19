import { setupWorker } from 'msw/browser';
import type { MockMode } from './mode';

let started: Promise<void> | null = null;

export function startMocks(mode: MockMode): Promise<void> {
  if (mode === 'off' || typeof window === 'undefined') return Promise.resolve();
  started ??= (async () => {
    // MSW stops mocking a page on `beforeunload`. That also fires for tel:/mailto:
    // links (the page stays) and lets a page that is navigating away send its last
    // requests to the real backend, whose 401s then clear the shared session.
    // Keep mocking until the page is really gone. Registered before MSW's listener.
    window.addEventListener('beforeunload', (e) => e.stopImmediatePropagation(), { capture: true });
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
