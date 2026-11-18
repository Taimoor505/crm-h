/**
 * TODO(backend): every handler here stands in for an endpoint that doesn't
 * exist yet (docs/frontend-endpoint-map.md → Missing). Used with
 * NEXT_PUBLIC_API_MOCKING=missing, next to the real backend. Delete each one
 * as the backend ships it.
 */
import { http, HttpResponse } from 'msw';
import { regionFromCountry } from '@/lib/format/settings';
import { TEMPLATES } from '../data/templates';
import { BASE, body, latency } from './context';

const json = HttpResponse.json;
const STORE_KEY = 'crm.missing-endpoints.v1';

interface Store {
  settings: Record<string, Record<string, unknown>>;
  reasons: Record<string, { won: string[]; lost: string[] }>;
  domains: { id: string; domain: string; verified: boolean }[];
}

function load(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { settings: {}, reasons: {}, domains: [] };
}
function save(s: Store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}


export const missingHandlers = [
  // TODO(backend): GET/PATCH /workspaces/{id}/settings (brief §12.1)
  http.get(`${BASE}/workspaces/:id/settings`, async ({ params }) => {
    await latency();
    const s = load();
    const id = String(params.id);
    if (!s.settings[id]) {
      // The sandbox workspaces are all in Pakistan; editable in Settings → Workspace and region.
      s.settings[id] = { ...regionFromCountry('PK'), name: '', branding: {} };
      save(s);
    }
    return json({ data: s.settings[id] });
  }),
  http.patch(`${BASE}/workspaces/:id/settings`, async ({ params, request }) => {
    await latency();
    const s = load();
    const id = String(params.id);
    const patch = await body<Record<string, unknown>>(request);
    const cur = s.settings[id] ?? { ...regionFromCountry('PK'), name: '', branding: {} };
    s.settings[id] = { ...cur, ...patch, branding: { ...(cur.branding as object), ...((patch.branding as object) ?? {}) } };
    save(s);
    return json({ data: s.settings[id] });
  }),

  // TODO(backend): GET /templates
  http.get(`${BASE}/templates`, async () => {
    await latency();
    return json({ data: TEMPLATES });
  }),

  // TODO(backend): POST /workspaces/{id}/clear-samples
  http.post(`${BASE}/workspaces/:id/clear-samples`, async () => {
    await latency();
    return json({ data: { removed: 0 } });
  }),

  // TODO(backend): GET/PUT /pipelines/{id}/reasons
  http.get(`${BASE}/pipelines/:id/reasons`, async ({ params }) => {
    await latency();
    const s = load();
    return json({ data: s.reasons[String(params.id)] ?? { won: ['Best price', 'Fast response'], lost: ['Price too high', 'Chose a competitor', 'No response', 'Not ready yet'] } });
  }),
  http.put(`${BASE}/pipelines/:id/reasons`, async ({ params, request }) => {
    await latency();
    const s = load();
    s.reasons[String(params.id)] = await body(request);
    save(s);
    return json({ data: s.reasons[String(params.id)] });
  }),

  // TODO(backend): DELETE /pipelines/{id}/stages/{stageId}
  http.delete(`${BASE}/pipelines/:id/stages/:stageId`, async () => {
    await latency();
    return json({ error: { code: 'not_implemented', message: 'Deleting stages needs the backend endpoint' } }, { status: 501 });
  }),

  // TODO(backend): saved replies, WhatsApp templates, mark conversation read
  http.get(`${BASE}/whatsapp/saved-replies`, async () => {
    await latency();
    return json({ data: [
      { id: 'r1', title: 'Thanks', body: 'Thanks for your enquiry! When is a good time to call you?' },
      { id: 'r2', title: 'Details', body: 'Sharing the full details now. Let me know if you have any questions.' },
      { id: 'r3', title: 'Follow up', body: 'Just checking in. Are you still interested?' },
    ] });
  }),
  http.get(`${BASE}/whatsapp/templates`, async () => {
    await latency();
    return json({ data: [{ name: 'welcome_lead', language: 'en', body: 'Hi {{1}}, thanks for contacting us! An advisor will reach out shortly.', params: 1 }] });
  }),
  http.post(`${BASE}/conversations/:id/read`, async () => {
    await latency();
    return json({ data: { unread_count: 0 } });
  }),

  // TODO(backend): GET /partner/domains, DELETE /partner/domains/{id}
  http.get(`${BASE}/partner/domains`, async () => {
    await latency();
    return json({ data: load().domains.map((d) => ({ ...d, dns: { type: 'CNAME', name: d.domain, value: 'cname.crm-platform.example' } })) });
  }),
  http.delete(`${BASE}/partner/domains/:id`, async ({ params }) => {
    await latency();
    const s = load();
    s.domains = s.domains.filter((d) => d.id !== params.id);
    save(s);
    return json({ data: { removed: true } });
  }),
];
