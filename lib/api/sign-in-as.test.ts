import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSession, setSession, signInAsFor, type Session } from '@/lib/auth/session';
import { api } from './client';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const base: Session = { accessToken: 'owner-token', refreshToken: null, expiresAt: null, userId: 'owner', workspaceId: WS, impersonating: null, lastActiveAt: Date.now() };
const signInAs = { id: 'sia-1', workspaceId: WS, userId: 'ali', name: 'Ali', role: 'agent' as const, expiresAt: new Date(Date.now() + 3600_000).toISOString() };

let sent: Headers[] = [];
function respond(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(new Headers(init.headers));
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }));
}

describe('"Sign in as" on the client', () => {
  beforeEach(() => {
    sent = [];
    setSession({ ...base, signInAs });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setSession(null);
  });

  it('only applies to its own workspace', () => {
    expect(signInAsFor(WS)).toBe('sia-1');
    expect(signInAsFor(OTHER)).toBeNull();
    expect(signInAsFor(null)).toBeNull();
  });

  it("sends the session id with the owner's own token, only to that workspace", async () => {
    respond(200, { data: [] });
    await api.get('/contacts');
    await api.get('/contacts', undefined, { workspaceId: OTHER });
    await api.post('/auth/login', {}, { anonymous: true, workspaceId: false });
    expect(sent[0].get('authorization')).toBe('Bearer owner-token');
    expect(sent[0].get('x-sign-in-as')).toBe('sia-1');
    expect(sent[1].get('x-sign-in-as')).toBeNull();
    expect(sent[2].get('x-sign-in-as')).toBeNull();
  });

  it('drops back to the owner when the server says the session ended', async () => {
    respond(403, { error: { code: 'sign_in_as_ended', message: 'ended' } });
    await expect(api.get('/contacts')).rejects.toMatchObject({ code: 'sign_in_as_ended' });
    expect(getSession()?.signInAs).toBeNull();
    expect(getSession()?.accessToken).toBe('owner-token');
  });

  it('keeps the session on other errors', async () => {
    respond(403, { error: { code: 'not_allowed_while_signed_in_as', message: 'no' } });
    await expect(api.post('/invites', {})).rejects.toMatchObject({ code: 'not_allowed_while_signed_in_as' });
    expect(getSession()?.signInAs?.id).toBe('sia-1');
  });
});
