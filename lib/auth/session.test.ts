import { describe, expect, it } from 'vitest';
import { IDLE_LIMIT_MS, isIdleExpired, type Session } from './session';

const base: Session = { accessToken: 'a', refreshToken: 'r', expiresAt: null, userId: 'u', workspaceId: null, impersonating: null };

describe('idle sign-out', () => {
  it('keeps people signed in until 24 hours without activity', () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    expect(isIdleExpired({ ...base, lastActiveAt: now - (IDLE_LIMIT_MS - 60_000) }, now)).toBe(false);
    expect(isIdleExpired({ ...base, lastActiveAt: now - (IDLE_LIMIT_MS + 60_000) }, now)).toBe(true);
    // Sessions from before the idle rule have no timestamp: not expired.
    expect(isIdleExpired({ ...base }, now)).toBe(false);
    expect(isIdleExpired(null, now)).toBe(false);
  });
});
