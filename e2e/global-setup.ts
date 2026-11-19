/**
 * Compiles the main routes once before the tests, so the first navigation in
 * a test doesn't wait on a cold dev-server compile.
 */
const ROUTES = ['/login', '/onboarding', '/home', '/leads', '/pipeline', '/follow-ups', '/inbox', '/reports', '/notifications', '/settings/workspace', '/partner', '/contacts/x', '/suspended'];

export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  for (const r of ROUTES) {
    try {
      await fetch(`${base}${r}`, { headers: { cookie: 'crm_session=1' }, signal: AbortSignal.timeout(180_000) });
    } catch {
      // A failed warm-up only makes the first test slower.
    }
  }
}
