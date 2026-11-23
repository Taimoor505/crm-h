import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, admin, call, createUser, team } from './helpers';
import * as signInAs from '@/app/api/v1/workspaces/[id]/sign-in-as/route';
import * as me from '@/app/api/v1/me/route';
import * as contacts from '@/app/api/v1/contacts/route';
import * as notes from '@/app/api/v1/contacts/[id]/notes/route';
import * as invites from '@/app/api/v1/invites/route';
import * as memberships from '@/app/api/v1/memberships/[id]/route';
import * as workspaces from '@/app/api/v1/workspaces/route';
import * as subscription from '@/app/api/v1/billing/subscription/route';
import { setLogSink, type LogEntry } from '@/server/observability/request-log';

const H = 'x-sign-in-as';

describe('sign in as a teammate', () => {
  // team(): `manager` is the owner; ali, sara and bilal are agents.
  let t: Awaited<ReturnType<typeof team>>;
  let mgr: string;
  let coOwner: string;
  let aliLead: string;
  let saraLead: string;

  const start = (as: string, user_id: string, ws = t.ws) =>
    call(signInAs.POST, { method: 'POST', as, ws, params: { id: ws }, body: { user_id } });
  const end = (as: string, ws = t.ws, headers: Record<string, string> = {}) =>
    call(signInAs.DELETE, { method: 'DELETE', as, ws, params: { id: ws }, headers });

  beforeAll(async () => {
    t = await team('Sign-in-as Realty');
    mgr = await createUser('Mona Manager');
    coOwner = await createUser('Omar Co-owner');
    await addMember(t.ws, mgr, 'manager');
    await addMember(t.ws, coOwner, 'owner');
    aliLead = (await call(contacts.POST, { method: 'POST', as: t.ali, ws: t.ws, body: { name: 'Ali lead', phone: '03005550001' } })).body.contact.id;
    saraLead = (await call(contacts.POST, { method: 'POST', as: t.sara, ws: t.ws, body: { name: 'Sara lead', phone: '03005550002' } })).body.contact.id;
  });

  it('only owners can start, and only as an active manager or agent', async () => {
    expect((await start(t.ali, t.sara)).status).toBe(403);
    expect((await start(mgr, t.ali)).status).toBe(403);
    expect((await start(t.manager, t.manager)).status).toBe(422);
    expect((await start(t.manager, coOwner)).status).toBe(403);
    const outsider = await createUser('Outsider');
    expect((await start(t.manager, outsider)).status).toBe(404);

    const ok = await start(t.manager, mgr);
    expect(ok.status).toBe(201);
    expect(ok.body.sign_in_as).toMatchObject({ user: { id: mgr, role: 'manager', name: 'Mona Manager' } });
    const hours = (new Date(ok.body.sign_in_as.expires_at).getTime() - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(1.9);
    expect(hours).toBeLessThanOrEqual(2);
    await end(t.manager);
  });

  it('works as the teammate: /me, RLS, activity attribution, request log', async () => {
    const s = (await start(t.manager, t.ali)).body.sign_in_as;
    const headers = { [H]: s.id };

    const m = await call(me.GET, { as: t.manager, ws: t.ws, headers });
    expect(m.status).toBe(200);
    expect(m.body.user.id).toBe(t.ali);
    expect(m.body.effective_role).toBe('agent');
    expect(m.body.memberships.map((x: { workspace_id: string }) => x.workspace_id)).toEqual([t.ws]);
    expect(m.body.signed_in_as).toMatchObject({ id: s.id, by: { id: t.manager } });
    expect((await call(me.GET, { as: t.manager, ws: t.ws })).body).toMatchObject({ user: { id: t.manager }, signed_in_as: null });

    // Ali's view: his leads only, even though the owner could see Sara's.
    const list = await call(contacts.GET, { as: t.manager, ws: t.ws, headers });
    expect(list.body.data.map((c: { id: string }) => c.id)).toEqual([aliLead]);
    expect((await call(contacts.GET, { as: t.manager, ws: t.ws })).body.data.map((c: { id: string }) => c.id)).toEqual(expect.arrayContaining([aliLead, saraLead]));

    // Writes are Ali's, tagged with the owner who really did them.
    const logs: Omit<LogEntry, 'error_code'>[] = [];
    setLogSink((e) => void logs.push(e));
    try {
      const n = await call(notes.POST, { method: 'POST', as: t.manager, ws: t.ws, headers, params: { id: aliLead }, body: { body: 'Called back' } });
      expect(n.status).toBe(201);
    } finally {
      setLogSink(null);
    }
    const [act] = await admin<{ actor_id: string; meta: Record<string, unknown> }[]>`
      select actor_id, meta from public.activities where contact_id = ${aliLead} and type = 'note' order by created_at desc limit 1`;
    expect(act.actor_id).toBe(t.ali);
    expect(act.meta.signed_in_as_by).toBe(t.manager);
    expect(logs[0]).toMatchObject({ user_id: t.ali, signed_in_as_by: t.manager, workspace_id: t.ws });

    // Ordinary requests leave no tag.
    await call(notes.POST, { method: 'POST', as: t.ali, ws: t.ws, params: { id: aliLead }, body: { body: 'Own note' } });
    const [own] = await admin<{ meta: Record<string, unknown> }[]>`
      select meta from public.activities where contact_id = ${aliLead} and body = 'Own note'`;
    expect(own.meta.signed_in_as_by).toBeUndefined();
    await end(t.manager);
  });

  it('blocks team management, billing and account endpoints while signed in as someone', async () => {
    const s = (await start(t.manager, mgr)).body.sign_in_as;
    const headers = { [H]: s.id };
    const inv = await call(invites.POST, { method: 'POST', as: t.manager, ws: t.ws, headers, body: { email: 'new@test.local', role: 'agent' } });
    expect(inv.status).toBe(403);
    expect(inv.body.error.code).toBe('not_allowed_while_signed_in_as');
    const [ali] = await admin<{ id: string }[]>`select id from public.memberships where workspace_id = ${t.ws} and user_id = ${t.ali}`;
    expect((await call(memberships.PATCH, { method: 'PATCH', as: t.manager, ws: t.ws, headers, params: { id: ali.id }, body: { role: 'manager' } })).status).toBe(403);
    expect((await call(signInAs.POST, { method: 'POST', as: t.manager, ws: t.ws, headers, params: { id: t.ws }, body: { user_id: t.ali } })).status).toBe(403);
    expect((await call(subscription.GET, { as: t.manager, ws: t.ws, headers })).body.error.code).toBe('not_allowed_while_signed_in_as');
    expect((await call(workspaces.GET, { as: t.manager, ws: t.ws, headers })).status).toBe(403);
    await end(t.manager);
  });

  it('rejects forged, ended, expired and revoked sessions', async () => {
    const s = (await start(t.manager, t.sara)).body.sign_in_as;
    const headers = { [H]: s.id };
    // Someone else sending the owner's session id gets nothing.
    expect((await call(contacts.GET, { as: t.bilal, ws: t.ws, headers })).body.error.code).toBe('sign_in_as_ended');
    expect((await call(contacts.GET, { as: t.manager, ws: t.ws, headers: { [H]: 'not-a-uuid' } })).status).toBe(400);

    // Return to my account works even with the header still attached; then the id is dead.
    const ended = await end(t.manager, t.ws, headers);
    expect(ended.body).toEqual({ ended: true });
    expect((await call(contacts.GET, { as: t.manager, ws: t.ws, headers })).body.error.code).toBe('sign_in_as_ended');
    expect((await end(t.manager)).body).toEqual({ ended: false });

    // Expired.
    const e = (await start(t.manager, t.sara)).body.sign_in_as;
    await admin`update public.sign_in_as_sessions set expires_at = now() - interval '1 second' where id = ${e.id}`;
    expect((await call(contacts.GET, { as: t.manager, ws: t.ws, headers: { [H]: e.id } })).status).toBe(403);
    const [row] = await admin<{ end_reason: string }[]>`select end_reason from public.sign_in_as_sessions where id = ${e.id}`;
    expect(row.end_reason).toBe('expired');

    // The teammate is deactivated mid-session.
    const r = (await start(t.manager, t.bilal)).body.sign_in_as;
    await admin`update public.memberships set status = 'suspended' where workspace_id = ${t.ws} and user_id = ${t.bilal}`;
    expect((await call(contacts.GET, { as: t.manager, ws: t.ws, headers: { [H]: r.id } })).status).toBe(403);
    await admin`update public.memberships set status = 'active' where workspace_id = ${t.ws} and user_id = ${t.bilal}`;

    // Starting a new session replaces the open one.
    const a = (await start(t.manager, t.bilal)).body.sign_in_as;
    const b = (await start(t.manager, t.sara)).body.sign_in_as;
    expect((await call(contacts.GET, { as: t.manager, ws: t.ws, headers: { [H]: a.id } })).status).toBe(403);
    expect((await call(contacts.GET, { as: t.manager, ws: t.ws, headers: { [H]: b.id } })).status).toBe(200);
    await end(t.manager);
  });

  it('is scoped to its workspace and audited', async () => {
    const other = await team('Other Realty');
    await addMember(other.ws, t.manager, 'owner');
    const s = (await start(t.manager, t.ali)).body.sign_in_as;
    // Same owner, other workspace: the session doesn't carry over.
    expect((await call(contacts.GET, { as: t.manager, ws: other.ws, headers: { [H]: s.id } })).status).toBe(403);
    await end(t.manager);

    const audit = await admin<{ action: string; actor_id: string }[]>`
      select action, actor_id from public.audit_logs
       where workspace_id = ${t.ws} and entity_id = ${t.ali} and action like 'sign_in_as.%' order by created_at`;
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['sign_in_as.start', 'sign_in_as.end']));
    expect(audit.every((a) => a.actor_id === t.manager)).toBe(true);

    // Owners can read the session history through RLS; agents can't.
    const visible = async (userId: string) =>
      admin.begin(async (tx) => {
        await tx.unsafe('set local role authenticated');
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`;
        const [r] = await tx<{ n: number }[]>`select count(*)::int as n from public.sign_in_as_sessions where workspace_id = ${t.ws}`;
        return r.n;
      });
    expect(await visible(t.manager)).toBeGreaterThan(0);
    expect(await visible(t.ali)).toBe(0);
  });
});
