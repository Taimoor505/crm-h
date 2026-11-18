import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../env';
import type { LeadMapping } from './mapping';

export type LeadSourceType = 'website_form' | 'webhook' | 'meta_leadgen' | 'whatsapp' | 'manual' | 'import';

export interface LeadSourceSettings {
  /** website_form: origins allowed to post (e.g. https://acme.pk). Empty = any. */
  allowed_origins?: string[];
  /** website_form without JS: where to send the visitor after submitting. */
  redirect_url?: string;
  /** Tags added to every contact from this source. */
  default_tags?: string[];
  /** meta_leadgen (set by the server): page and forms this source receives. */
  meta_page_id?: string;
  meta_form_ids?: string[];
}

export interface LeadSource {
  id: string;
  workspace_id: string;
  type: LeadSourceType;
  name: string;
  source_label: string;
  public_key: string;
  secret?: string | null;
  mapping: LeadMapping;
  settings: LeadSourceSettings;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

/** Columns safe to return to clients (everything except `secret`). */
export const PUBLIC_COLUMNS = [
  'id', 'workspace_id', 'type', 'name', 'source_label', 'public_key', 'mapping', 'settings',
  'is_active', 'created_by', 'created_at', 'updated_at',
] as const;

/** Default contacts.source label per type. */
export const DEFAULT_LABEL: Record<LeadSourceType, string> = {
  website_form: 'website',
  webhook: 'webhook',
  meta_leadgen: 'facebook',
  whatsapp: 'whatsapp',
  manual: 'manual',
  import: 'import',
};

export function newPublicKey(): string {
  return `ls_${randomBytes(18).toString('base64url')}`;
}

export function newSecret(): string {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Webhook authentication. Accepts either:
 *  - X-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed with the secret>
 *    (n8n, Make and custom code can compute this), or
 *  - X-Webhook-Secret: <secret> (for tools like Zapier that can only set headers).
 * Both need HTTPS; the HMAC form also proves the body wasn't altered.
 */
export function verifyWebhook(secret: string, rawBody: string, headers: Headers): boolean {
  const sig = headers.get('x-signature') ?? headers.get('x-hub-signature-256');
  if (sig) {
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    return safeEqual(sig.trim().toLowerCase(), expected);
  }
  const shared = headers.get('x-webhook-secret');
  if (shared) return safeEqual(shared.trim(), secret);
  return false;
}

export function hookUrl(publicKey: string): string {
  return `${env.appUrl}/api/v1/hooks/leads/${publicKey}`;
}

export function embedSnippet(publicKey: string): string {
  return [
    `<form data-crm-lead-form>`,
    `  <input name="name" placeholder="Name" required>`,
    `  <input name="phone" placeholder="Phone" required>`,
    `  <textarea name="message" placeholder="Message"></textarea>`,
    `  <button type="submit">Send</button>`,
    `</form>`,
    `<script src="${env.appUrl}/embed/lead-form.js" data-key="${publicKey}" async></script>`,
  ].join('\n');
}

/** Client view of a source: no secret, plus ready-to-paste integration details. */
export function presentSource(s: LeadSource, opts: { includeSecret?: boolean } = {}) {
  const { secret, ...rest } = s;
  return {
    ...rest,
    endpoint_url: ['website_form', 'webhook'].includes(s.type) ? hookUrl(s.public_key) : null,
    embed_snippet: s.type === 'website_form' ? embedSnippet(s.public_key) : null,
    ...(opts.includeSecret && secret ? { secret } : {}),
  };
}
