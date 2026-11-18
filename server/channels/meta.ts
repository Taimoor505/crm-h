import { createHmac, timingSafeEqual } from 'node:crypto';

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface MetaLead {
  id: string;
  created_time?: string;
  form_id?: string;
  ad_id?: string;
  campaign_name?: string;
  field_data: { name: string; values: string[] }[];
}

export interface MetaGraph {
  /** Subscribes our Meta app to the page's `leadgen` webhook field. */
  subscribePage(pageId: string, pageToken: string): Promise<void>;
  /** Reads one lead's answers. */
  fetchLead(leadgenId: string, pageToken: string): Promise<MetaLead>;
}

async function graph<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number } };
  if (!res.ok || body.error) {
    throw new Error(`Meta Graph API ${res.status}: ${body.error?.message ?? 'request failed'}`);
  }
  return body;
}

const graphApi: MetaGraph = {
  async subscribePage(pageId, pageToken) {
    const url = `${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps?subscribed_fields=leadgen`;
    await graph(url, { method: 'POST', headers: { authorization: `Bearer ${pageToken}` } });
  },
  async fetchLead(leadgenId, pageToken) {
    const fields = 'id,created_time,form_id,ad_id,campaign_name,field_data';
    return graph<MetaLead>(`${GRAPH}/${encodeURIComponent(leadgenId)}?fields=${fields}`, {
      headers: { authorization: `Bearer ${pageToken}` },
    });
  },
};

let driver: MetaGraph = graphApi;
export const metaGraph = () => driver;
export function setMetaGraph(d: MetaGraph) {
  driver = d;
}

/** Meta signs webhook bodies with the app secret: X-Hub-Signature-256: sha256=<hex>. */
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const got = Buffer.from(header.trim().toLowerCase());
  return got.length === expected.length && timingSafeEqual(got, expected);
}
