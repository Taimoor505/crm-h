import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as sources from '@/app/api/v1/lead-sources/route';
import * as sourceById from '@/app/api/v1/lead-sources/[id]/route';
import * as rules from '@/app/api/v1/assignment-rules/route';
import * as metaHook from '@/app/api/v1/hooks/meta/leadgen/route';
import { closeDb, withUser } from '@/server/db';
import { decryptSecret, encryptSecret } from '@/server/crypto';
import { setMetaGraph, type MetaLead } from '@/server/channels/meta';
import { processJobs } from '@/worker/jobs';
import { admin, call, team } from './helpers';

const PAGE = '104857600001';
const FORM_A = '700000000001';
const TOKEN = 'EAAPageTokenForTestsOnly1234567890';

const subscribed: { pageId: string; token: string }[] = [];
const leads = new Map<string, MetaLead>();
let graphDown = false;

let t: Awaited<ReturnType<typeof team>>;
let source: { id: string };

function webhook(changes: { leadgen_id: string; form_id?: string; page_id?: string }[], secret = 'meta-app-secret') {
  const raw = JSON.stringify({
    object: 'page',
    entry: [{ id: PAGE, time: 1, changes: changes.map((c) => ({ field: 'leadgen', value: { page_id: PAGE, ...c } })) }],
  });
  return call(metaHook.POST, {
    method: 'POST', rawBody: raw,
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}` },
  });
}

async function drain() {
  for (let i = 0; i < 5; i++) if ((await processJobs('meta-test', 50)).processed === 0) return;
}

beforeAll(async () => {
  setMetaGraph({
    async subscribePage(pageId, token) {
      if (token === 'bad-token-xxxxxxxxxxxxxxxxxx') throw new Error('Invalid OAuth access token');
      subscribed.push({ pageId, token });
    },
    async fetchLead(id, token) {
      if (graphDown) throw new Error('Meta Graph API 500: try later');
      if (token !== TOKEN) throw new Error('wrong token');
      const l = leads.get(id);
      if (!l) throw new Error('lead not found');
      return l;
    },
  });
  t = await team('Meta Motors');
  await call(rules.PUT, { method: 'PUT', as: t.manager, ws: t.ws, body: { mode: 'by_source', source_map: { facebook: [t.sara] } } });
});

beforeEach(async () => {
  await admin`delete from public.jobs`;
  graphDown = false;
});

afterAll(async () => {
  await closeDb();
});

describe('connecting a Facebook page', () => {
  it('requires the page and token', async () => {
    const res = await call(sources.POST, { method: 'POST', as: t.manager, ws: t.ws, body: { type: 'meta_leadgen', name: 'FB' } });
    expect(res.status).toBe(422);
  });

  it('reports a Meta error when the page cannot be subscribed', async () => {
    const res = await call(sources.POST, {
      method: 'POST', as: t.manager, ws: t.ws,
      body: { type: 'meta_leadgen', name: 'FB', meta: { page_id: PAGE, page_access_token: 'bad-token-xxxxxxxxxxxxxxxxxx' } },
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'meta_subscribe_failed', message: 'Invalid OAuth access token' });
  });

  it('subscribes the page and stores the token encrypted, never returning it', async () => {
    const res = await call(sources.POST, {
      method: 'POST', as: t.manager, ws: t.ws,
      body: { type: 'meta_leadgen', name: 'Facebook: DHA campaign', meta: { page_id: PAGE, page_access_token: TOKEN } },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ source_label: 'facebook', settings: { meta_page_id: PAGE, meta_form_ids: [] } });
    expect(res.body.data.secret).toBeUndefined();
    expect(subscribed).toEqual([{ pageId: PAGE, token: TOKEN }]);
    source = res.body.data;

    const [row] = await admin`select secret from public.lead_sources where id = ${source.id}`;
    expect(row.secret).toMatch(/^v1\./);
    expect(row.secret).not.toContain(TOKEN);
    expect(decryptSecret(row.secret)).toBe(TOKEN);
  });

  it('keeps the page when other settings are patched', async () => {
    const res = await call(sourceById.PATCH, {
      method: 'PATCH', as: t.manager, ws: t.ws, params: { id: source.id }, body: { settings: { default_tags: ['fb-ads'] } },
    });
    expect(res.body.data.settings).toEqual({ meta_page_id: PAGE, meta_form_ids: [], default_tags: ['fb-ads'] });
  });
});

describe('POST /hooks/meta/leadgen', () => {
  it('answers the verification handshake only with the right token', async () => {
    const ok = await call(metaHook.GET, { query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '1158201444' } });
    expect(ok).toMatchObject({ status: 200, body: 1158201444 });
    const bad = await call(metaHook.GET, { query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '1' } });
    expect(bad.status).toBe(403);
  });

  it('rejects unsigned deliveries', async () => {
    expect((await webhook([{ leadgen_id: '1' }], 'wrong-secret')).status).toBe(401);
  });

  it('records the lead, then the worker fetches it, maps field_data and assigns by source', async () => {
    leads.set('900001', {
      id: '900001', form_id: FORM_A, ad_id: '1', campaign_name: 'DHA Phase 6',
      field_data: [
        { name: 'full_name', values: ['Kamran Akmal'] },
        { name: 'phone_number', values: ['+923134445566'] },
        { name: 'email', values: ['kamran@example.pk'] },
      ],
    });
    const res = await webhook([{ leadgen_id: '900001', form_id: FORM_A }]);
    expect(res.body).toMatchObject({ ok: true, queued: 1 });

    // Meta retries the same delivery: ignored.
    expect((await webhook([{ leadgen_id: '900001', form_id: FORM_A }])).body).toMatchObject({ duplicate: 1 });

    await drain();
    const [c] = await admin`select * from public.contacts where phone_e164 = '+923134445566'`;
    expect(c).toMatchObject({ name: 'Kamran Akmal', email: 'kamran@example.pk', source: 'facebook', owner_id: t.sara });
    expect(c.tags).toEqual(['fb-ads']);
    const [ev] = await admin`select status, contact_id, payload from public.lead_events where payload->>'leadgen_id' = '900001'`;
    expect(ev).toMatchObject({ status: 'created', contact_id: c.id });
    expect(ev.payload.lead.campaign_name).toBe('DHA Phase 6');
    const [act] = await admin`select body from public.activities where contact_id = ${c.id} and type = 'system'`;
    expect(act.body).toBe('New lead via Facebook: DHA campaign');
  });

  it('retries when the Graph API is down', async () => {
    leads.set('900002', { id: '900002', field_data: [{ name: 'phone_number', values: ['03135556677'] }] });
    await webhook([{ leadgen_id: '900002' }]);
    graphDown = true;
    await drain();
    const [job] = await admin`select status, attempts, last_error from public.jobs where name = 'meta.fetch_lead'`;
    expect(job).toMatchObject({ status: 'queued', attempts: 1 });
    expect(job.last_error).toContain('try later');

    graphDown = false;
    await admin`update public.jobs set run_at = now()`;
    await drain();
    expect(await admin`select 1 from public.contacts where phone_e164 = '+923135556677'`).toHaveLength(1);
  });

  it('routes to a form-specific source over the page-wide one', async () => {
    const formSource = await call(sources.POST, {
      method: 'POST', as: t.manager, ws: t.ws,
      body: { type: 'meta_leadgen', name: 'FB: plots form', source_label: 'fb_plots', meta: { page_id: PAGE, page_access_token: TOKEN, form_ids: [FORM_A] } },
    });
    expect(formSource.status).toBe(201);
    leads.set('900003', { id: '900003', field_data: [{ name: 'phone_number', values: ['03137778899'] }] });
    await webhook([{ leadgen_id: '900003', form_id: FORM_A }]);
    await drain();
    const [c] = await admin`select source from public.contacts where phone_e164 = '+923137778899'`;
    expect(c.source).toBe('fb_plots');
  });

  it('ignores pages nobody connected', async () => {
    const raw = JSON.stringify({ object: 'page', entry: [{ id: '1', changes: [{ field: 'leadgen', value: { leadgen_id: '5', page_id: '999999' } }] }] });
    const res = await call(metaHook.POST, {
      method: 'POST', rawBody: raw,
      headers: { 'x-hub-signature-256': `sha256=${createHmac('sha256', 'meta-app-secret').update(raw).digest('hex')}` },
    });
    expect(res.body).toMatchObject({ ok: true, no_source: 1 });
  });

  it('managers cannot read the encrypted token through the API role either', async () => {
    await expect(withUser(t.manager, (tx) => tx`select secret from public.lead_sources`)).rejects.toThrow(/permission denied/);
  });
});

describe('encryption', () => {
  it('round-trips and detects tampering', () => {
    const enc = encryptSecret('hello');
    expect(decryptSecret(enc)).toBe('hello');
    const parts = enc.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });
});
