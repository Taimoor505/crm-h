import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as sources from '@/app/api/v1/lead-sources/route';
import * as sourceById from '@/app/api/v1/lead-sources/[id]/route';
import * as hook from '@/app/api/v1/hooks/leads/[key]/route';
import * as quickAdd from '@/app/api/v1/leads/quick-add/route';
import * as rules from '@/app/api/v1/assignment-rules/route';
import * as availability from '@/app/api/v1/availability/route';
import * as assign from '@/app/api/v1/contacts/[id]/assign/route';
import * as notifications from '@/app/api/v1/notifications/route';
import { setStorageDriver } from '@/server/storage';
import { closeDb, withUser } from '@/server/db';
import { admin, call, team } from './helpers';

let t: Awaited<ReturnType<typeof team>>;
let webhook: { id: string; public_key: string; secret: string };
let form: { id: string; public_key: string };
const uploads: string[] = [];

function signed(secret: string, payload: unknown) {
  const raw = JSON.stringify(payload);
  return {
    rawBody: raw,
    headers: {
      'content-type': 'application/json',
      'x-signature': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
    },
  };
}

async function contact(id: string) {
  const [c] = await admin`select * from public.contacts where id = ${id}`;
  return c;
}

beforeAll(async () => {
  t = await team('Leads Realty');
  setStorageDriver({
    async upload(bucket, path) {
      uploads.push(`${bucket}/${path}`);
      return { path: `${bucket}/${path}` };
    },
  });
});

afterAll(async () => {
  await closeDb();
});

describe('lead sources', () => {
  it('lets managers create a webhook source and shows the secret only once', async () => {
    const res = await call(sources.POST, {
      method: 'POST', as: t.manager, ws: t.ws,
      body: { type: 'webhook', name: 'Zapier: Zameen leads', source_label: 'zameen', mapping: { custom: { budget: 'budget' } } },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.secret).toMatch(/^whsec_/);
    expect(res.body.data.endpoint_url).toBe(`https://crm.test/api/v1/hooks/leads/${res.body.data.public_key}`);
    webhook = res.body.data;

    const list = await call(sources.GET, { as: t.manager, ws: t.ws });
    expect(list.status).toBe(200);
    expect(list.body.data[0].secret).toBeUndefined();
  });

  it('creates a website form source with an embed snippet', async () => {
    const res = await call(sources.POST, {
      method: 'POST', as: t.manager, ws: t.ws,
      body: { type: 'website_form', name: 'Website', settings: { allowed_origins: ['https://leadsrealty.pk/contact'] } },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.source_label).toBe('website');
    expect(res.body.data.settings.allowed_origins).toEqual(['https://leadsrealty.pk']);
    expect(res.body.data.embed_snippet).toContain('data-key="' + res.body.data.public_key);
    expect(res.body.data.secret).toBeUndefined();
    form = res.body.data;
  });

  it('keeps agents out of lead source config', async () => {
    expect((await call(sources.GET, { as: t.ali, ws: t.ws })).status).toBe(403);
  });

  it('never exposes the secret column to the authenticated role, even by direct query', async () => {
    await expect(
      withUser(t.manager, (tx) => tx`select secret from public.lead_sources where id = ${webhook.id}`),
    ).rejects.toThrow(/permission denied/);
  });

  it('rotates a webhook secret', async () => {
    const res = await call(sourceById.PATCH, {
      method: 'PATCH', as: t.manager, ws: t.ws, params: { id: webhook.id }, body: { rotate_secret: true },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.secret).toMatch(/^whsec_/);
    expect(res.body.data.secret).not.toBe(webhook.secret);
    webhook.secret = res.body.data.secret;
  });
});

describe('POST /hooks/leads/:key (webhook)', () => {
  it('rejects a bad signature and stores nothing', async () => {
    const res = await call(hook.POST, {
      method: 'POST', params: { key: webhook.public_key },
      rawBody: '{"phone":"03001112233"}',
      headers: { 'content-type': 'application/json', 'x-signature': 'sha256=deadbeef' },
    });
    expect(res.status).toBe(401);
  });

  it('creates a contact, logs the raw event and leaves it unassigned in manual mode', async () => {
    const res = await call(hook.POST, {
      method: 'POST', params: { key: webhook.public_key },
      ...signed(webhook.secret, { name: 'Ahmed Khan', phone: '0300-1112233', budget: '2 crore', message: 'Interested in DHA' }),
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('created');
    const c = await contact(res.body.contact_id);
    expect(c).toMatchObject({ name: 'Ahmed Khan', phone_e164: '+923001112233', source: 'zameen', owner_id: null });
    expect(c.custom).toEqual({ budget: '2 crore' });
    expect(c.last_enquiry_at).not.toBeNull();

    const [ev] = await admin`select * from public.lead_events where contact_id = ${c.id}`;
    expect(ev.status).toBe('created');
    expect(ev.payload.budget).toBe('2 crore');

    const acts = await admin`select type, body from public.activities where contact_id = ${c.id} order by created_at`;
    expect(acts.map((a) => a.body)).toEqual(['New lead via Zapier: Zameen leads', 'Interested in DHA']);

    // Manual mode: managers are told a lead needs an owner.
    const [n] = await admin`select * from public.notifications where user_id = ${t.manager} and type = 'lead.unassigned'`;
    expect(n.title).toContain('Ahmed Khan');
    expect(n.priority).toBe('urgent');

    const jobs = await admin`select name from public.jobs where payload->>'contact_id' = ${c.id} order by id`;
    expect(jobs.map((j) => j.name)).toEqual(['contact.created', 'lead.received']);
  });

  it('accepts the shared-secret header (for Zapier)', async () => {
    const res = await call(hook.POST, {
      method: 'POST', params: { key: webhook.public_key },
      body: { name: 'Zainab', mobile: '+92 321 5556677' },
      headers: { 'x-webhook-secret': webhook.secret },
    });
    expect(res.status).toBe(201);
  });

  it('rejects a lead with no usable phone or email, and logs why', async () => {
    const res = await call(hook.POST, {
      method: 'POST', params: { key: webhook.public_key }, ...signed(webhook.secret, { name: 'No Number', phone: '12' }),
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('invalid_phone');
    const [ev] = await admin`select status, error from public.lead_events order by received_at desc limit 1`;
    expect(ev).toMatchObject({ status: 'rejected' });
  });
});

describe('assignment', () => {
  it('validates rules: round robin needs agents, agents must be members', async () => {
    const empty = await call(rules.PUT, { method: 'PUT', as: t.manager, ws: t.ws, body: { mode: 'round_robin' } });
    expect(empty.status).toBe(422);
    const stranger = await call(rules.PUT, {
      method: 'PUT', as: t.manager, ws: t.ws,
      body: { mode: 'round_robin', agent_ids: ['00000000-0000-4000-8000-000000000000'] },
    });
    expect(stranger.status).toBe(422);
    expect(stranger.body.error.code).toBe('invalid_members');
    expect((await call(rules.PUT, { method: 'PUT', as: t.ali, ws: t.ws, body: { mode: 'manual' } })).status).toBe(403);
  });

  it('rotates new leads round-robin and skips unavailable agents', async () => {
    const put = await call(rules.PUT, {
      method: 'PUT', as: t.manager, ws: t.ws, body: { mode: 'round_robin', agent_ids: [t.ali, t.sara, t.bilal] },
    });
    expect(put.status).toBe(200);
    expect(put.body.data.members).toHaveLength(4);

    const owners: string[] = [];
    for (const phone of ['03002000001', '03002000002', '03002000003']) {
      const res = await call(hook.POST, { method: 'POST', params: { key: webhook.public_key }, ...signed(webhook.secret, { phone }) });
      owners.push((await contact(res.body.contact_id)).owner_id);
    }
    expect(owners).toEqual([t.ali, t.sara, t.bilal]);

    // Sara is off today.
    expect((await call(availability.PUT, { method: 'PUT', as: t.sara, ws: t.ws, body: { available: false } })).status).toBe(200);
    // Agents can't change someone else's availability.
    expect((await call(availability.PUT, {
      method: 'PUT', as: t.ali, ws: t.ws, body: { available: false, user_id: t.bilal },
    })).status).toBe(403);

    const next: string[] = [];
    for (const phone of ['03002000004', '03002000005']) {
      const res = await call(hook.POST, { method: 'POST', params: { key: webhook.public_key }, ...signed(webhook.secret, { phone }) });
      next.push((await contact(res.body.contact_id)).owner_id);
    }
    expect(next).toEqual([t.ali, t.bilal]);

    const [act] = await admin`
      select a.* from public.activities a join public.contacts c on c.id = a.contact_id
       where c.phone_e164 = '+923002000004' and a.type = 'assignment'`;
    expect(act.meta).toMatchObject({ to: t.ali, reason: 'new_lead', rule: 'round_robin' });

    const inbox = await call(notifications.GET, { as: t.ali, ws: t.ws });
    expect(inbox.body.data[0]).toMatchObject({ type: 'lead.assigned', priority: 'urgent' });
    expect(inbox.body.unread_count).toBeGreaterThanOrEqual(2);
    await call(availability.PUT, { method: 'PUT', as: t.sara, ws: t.ws, body: { available: true } });
  });

  it('routes by source, falling back to the round-robin pool', async () => {
    await call(rules.PUT, {
      method: 'PUT', as: t.manager, ws: t.ws,
      body: { mode: 'by_source', agent_ids: [t.ali, t.bilal], source_map: { zameen: [t.sara] } },
    });
    const z1 = await call(hook.POST, { method: 'POST', params: { key: webhook.public_key }, ...signed(webhook.secret, { phone: '03003000001' }) });
    expect((await contact(z1.body.contact_id)).owner_id).toBe(t.sara);

    const web = await call(hook.POST, {
      method: 'POST', params: { key: form.public_key }, body: { name: 'Web Visitor', phone: '03003000002' },
      headers: { origin: 'https://leadsrealty.pk' },
    });
    expect(web.status).toBe(201);
    const owner = (await contact(web.body.contact_id)).owner_id;
    expect([t.ali, t.bilal]).toContain(owner);
  });

  it('treats a repeat phone as a re-enquiry: same contact, same owner, owner re-alerted', async () => {
    const first = await call(hook.POST, { method: 'POST', params: { key: webhook.public_key }, ...signed(webhook.secret, { phone: '03004000001', name: 'Repeat Rehan' }) });
    const before = await contact(first.body.contact_id);

    const again = await call(hook.POST, {
      method: 'POST', params: { key: form.public_key },
      body: { name: 'Someone Else', phone: '+92 300 4000001', email: 'rehan@x.pk' },
      headers: { origin: 'https://leadsrealty.pk' },
    });
    expect(again.status).toBe(201);
    expect(again.body).toMatchObject({ status: 'reenquiry', contact_id: before.id });

    const after = await contact(before.id);
    expect(after.owner_id).toBe(before.owner_id);
    expect(after.name).toBe('Repeat Rehan');          // existing data kept
    expect(after.email).toBe('rehan@x.pk');           // gaps filled
    expect(after.assigned_at.getTime()).toBeGreaterThan(before.assigned_at.getTime());

    const acts = await admin`select body from public.activities where contact_id = ${before.id} and type = 'system' order by created_at`;
    expect(acts.map((a) => a.body)).toEqual(['New lead via Zapier: Zameen leads', 'Re-enquired via Website']);
    const [n] = await admin`select * from public.notifications where user_id = ${before.owner_id} and type = 'lead.reenquired'`;
    expect(n.data.contact_id).toBe(before.id);
  });

  it('lets a manager reassign by hand, and blocks agents', async () => {
    const [c] = await admin`select id, owner_id from public.contacts where phone_e164 = '+923004000001'`;
    expect((await call(assign.POST, { method: 'POST', as: t.ali, ws: t.ws, params: { id: c.id }, body: { user_id: t.ali } })).status).toBe(403);
    const res = await call(assign.POST, { method: 'POST', as: t.manager, ws: t.ws, params: { id: c.id }, body: { user_id: t.bilal } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ owner_id: t.bilal, changed: true });
    const [act] = await admin`select * from public.activities where contact_id = ${c.id} and type = 'assignment' order by created_at desc limit 1`;
    expect(act).toMatchObject({ actor_id: t.manager });
    expect(act.meta).toMatchObject({ from: c.owner_id, to: t.bilal, reason: 'manual' });
  });
});

describe('POST /hooks/leads/:key (website form)', () => {
  it('answers CORS preflight for allowed origins only', async () => {
    const ok = await call(hook.OPTIONS, { method: 'OPTIONS', params: { key: form.public_key }, headers: { origin: 'https://leadsrealty.pk' } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://leadsrealty.pk');
    const bad = await call(hook.OPTIONS, { method: 'OPTIONS', params: { key: form.public_key }, headers: { origin: 'https://evil.example' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses posts from other websites', async () => {
    const res = await call(hook.POST, {
      method: 'POST', params: { key: form.public_key }, body: { phone: '03005000001' },
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });

  it('accepts plain HTML form posts', async () => {
    const res = await call(hook.POST, {
      method: 'POST', params: { key: form.public_key },
      rawBody: new URLSearchParams({ name: 'Form Farhan', phone: '0300 5000002' }).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://leadsrealty.pk' },
    });
    expect(res.status).toBe(201);
    expect((await contact(res.body.contact_id)).name).toBe('Form Farhan');
  });

  it('quietly drops honeypot submissions', async () => {
    const res = await call(hook.POST, {
      method: 'POST', params: { key: form.public_key }, body: { phone: '03005000003', _hp: 'http://spam' },
      headers: { origin: 'https://leadsrealty.pk' },
    });
    expect(res.status).toBe(201);
    expect(res.body.contact_id).toBeNull();
    const rows = await admin`select 1 from public.contacts where phone_e164 = '+923005000003'`;
    expect(rows).toHaveLength(0);
  });

  it('404s on unknown or disabled sources', async () => {
    expect((await call(hook.POST, { method: 'POST', params: { key: 'ls_nope' }, body: {} })).status).toBe(404);
    await call(sourceById.PATCH, { method: 'PATCH', as: t.manager, ws: t.ws, params: { id: form.id }, body: { is_active: false } });
    const res = await call(hook.POST, {
      method: 'POST', params: { key: form.public_key }, body: { phone: '03005000004' }, headers: { origin: 'https://leadsrealty.pk' },
    });
    expect(res.status).toBe(404);
    await call(sourceById.PATCH, { method: 'PATCH', as: t.manager, ws: t.ws, params: { id: form.id }, body: { is_active: true } });
  });
});

describe('POST /leads/quick-add', () => {
  it('adds a lead owned by the agent who typed it', async () => {
    const res = await call(quickAdd.POST, {
      method: 'POST', as: t.ali, ws: t.ws, body: { name: 'Walk-in Waqas', phone: '0333-6000001', note: 'Wants 5 marla' },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'created', owner_id: t.ali });
    const c = await contact(res.body.data.contact_id);
    expect(c).toMatchObject({ source: 'manual', owner_id: t.ali, first_response_at: null });
    // The agent can now see it under RLS.
    const visible = await withUser(t.ali, (tx) => tx`select id from public.contacts where id = ${c.id}`);
    expect(visible).toHaveLength(1);
  });

  it('stores a voice note and attaches it to the contact', async () => {
    const fd = new FormData();
    fd.set('name', 'Voice Vaneeza');
    fd.set('phone', '03336000002');
    fd.set('voice', new File([new Uint8Array([1, 2, 3])], 'note.webm', { type: 'audio/webm' }));
    const res = await call(quickAdd.POST, { method: 'POST', as: t.sara, ws: t.ws, rawBody: fd });
    expect(res.status).toBe(201);
    const path = res.body.data.voice_note_path;
    expect(path).toMatch(new RegExp(`^voice-notes/${t.ws}/${res.body.data.contact_id}/.+\\.webm$`));
    expect(uploads).toContain(path);
    const [note] = await admin`select * from public.activities where contact_id = ${res.body.data.contact_id} and type = 'note'`;
    expect(note.meta.voice_note_path).toBe(path);
  });

  it("logs a re-enquiry when an agent adds someone already owned by a colleague", async () => {
    const res = await call(quickAdd.POST, { method: 'POST', as: t.bilal, ws: t.ws, body: { phone: '+923336000001' } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'reenquiry', owner_id: t.ali, contact: null });
  });

  it('stops agents assigning quick-adds to others', async () => {
    const res = await call(quickAdd.POST, { method: 'POST', as: t.ali, ws: t.ws, body: { phone: '03336000003', assign_to: t.sara } });
    expect(res.status).toBe(403);
  });

  it('lets managers send a quick-add through the rules', async () => {
    await call(rules.PUT, { method: 'PUT', as: t.manager, ws: t.ws, body: { mode: 'round_robin', agent_ids: [t.bilal] } });
    const res = await call(quickAdd.POST, { method: 'POST', as: t.manager, ws: t.ws, body: { phone: '03336000004', assign_to: 'auto' } });
    expect(res.body.data.owner_id).toBe(t.bilal);
  });
});

describe('workspace isolation', () => {
  it("can't read another workspace's sources, rules or notifications", async () => {
    const other = await team('Other Agency');
    expect((await call(sources.GET, { as: other.manager, ws: t.ws })).status).toBe(403);
    const rows = await withUser(other.manager, (tx) => tx`
      select (select count(*) from public.lead_sources where workspace_id = ${t.ws})::int as sources,
             (select count(*) from public.lead_events where workspace_id = ${t.ws})::int as events,
             (select count(*) from public.assignment_rules where workspace_id = ${t.ws})::int as rules,
             (select count(*) from public.notifications where workspace_id = ${t.ws})::int as notifs,
             (select count(*) from public.contacts where workspace_id = ${t.ws})::int as contacts`);
    expect(rows[0]).toEqual({ sources: 0, events: 0, rules: 0, notifs: 0, contacts: 0 });
  });
});
