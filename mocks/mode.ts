export type MockMode = 'all' | 'missing' | 'off';

/**
 * NEXT_PUBLIC_API_MOCKING picks the mode. Unset: `all` in development when no
 * database is configured (NEXT_PUBLIC_HAS_DB is injected by next.config.ts),
 * otherwise `missing`. See docs/frontend-endpoint-map.md.
 */
export function mockMode(): MockMode {
  const v = process.env.NEXT_PUBLIC_API_MOCKING;
  if (v === 'all' || v === 'missing' || v === 'off') return v;
  if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_HAS_DB !== 'true') return 'all';
  return 'missing';
}
