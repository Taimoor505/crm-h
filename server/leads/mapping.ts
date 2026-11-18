/**
 * Turns an incoming payload (website form, Zapier/Make/n8n webhook, Meta lead)
 * into lead fields. Each lead source stores a mapping; anything not mapped
 * falls back to common field names, so most sources work with no setup.
 *
 * Mapping shape (all optional, values are dot paths or lists of paths):
 *   { "name": "full_name", "phone": ["phone", "contact.mobile"], "email": "email",
 *     "notes": "message", "custom": { "budget": "budget_pkr" }, "tags": ["ppc"] }
 */
export interface LeadMapping {
  name?: string | string[];
  first_name?: string | string[];
  last_name?: string | string[];
  phone?: string | string[];
  email?: string | string[];
  notes?: string | string[];
  custom?: Record<string, string | string[]>;
  tags?: string[];
}

export interface MappedLead {
  name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  custom: Record<string, unknown>;
  tags: string[];
}

const DEFAULTS = {
  name: ['name', 'full_name', 'fullname', 'your-name', 'your_name', 'customer_name', 'contact_name'],
  first_name: ['first_name', 'firstname', 'fname'],
  last_name: ['last_name', 'lastname', 'lname'],
  phone: ['phone', 'phone_number', 'phonenumber', 'mobile', 'mobile_number', 'cell', 'whatsapp',
    'whatsapp_number', 'contact_number', 'number', 'tel', 'your-phone'],
  email: ['email', 'email_address', 'your-email', 'e-mail'],
  notes: ['message', 'notes', 'note', 'comments', 'comment', 'enquiry', 'inquiry', 'your-message'],
};

/** Reads a dot path, matching keys case-insensitively ("Contact.Phone" finds contact.phone). */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    const rec = cur as Record<string, unknown>;
    if (part in rec) {
      cur = rec[part];
      continue;
    }
    const lower = part.toLowerCase();
    const key = Object.keys(rec).find((k) => k.toLowerCase() === lower);
    if (key === undefined) return undefined;
    cur = rec[key];
  }
  return cur;
}

function firstValue(payload: unknown, paths: string | string[] | undefined, fallback: string[] = []): string | null {
  const list = [...(paths === undefined ? [] : Array.isArray(paths) ? paths : [paths]), ...fallback];
  for (const p of list) {
    const v = scalar(getPath(payload, p));
    if (v) return v;
  }
  return null;
}

function scalar(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return scalar(v[0]);
  if (typeof v === 'object') return null;
  const s = String(v).trim();
  return s ? s.slice(0, 2000) : null;
}

/**
 * Meta lead ads deliver `field_data: [{ name, values: [...] }]`. Flatten it
 * into a plain object so the same mapping rules apply.
 */
export function flattenPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.field_data)) {
    const flat: Record<string, unknown> = { ...obj };
    for (const f of obj.field_data as { name?: string; values?: unknown[] }[]) {
      if (f?.name) flat[f.name] = Array.isArray(f.values) ? f.values[0] : f.values;
    }
    return flat;
  }
  return obj;
}

export function applyMapping(payload: unknown, mapping: LeadMapping = {}): MappedLead {
  const data = flattenPayload(payload);

  let name = firstValue(data, mapping.name, mapping.name ? [] : DEFAULTS.name);
  if (!name) {
    const first = firstValue(data, mapping.first_name, DEFAULTS.first_name);
    const last = firstValue(data, mapping.last_name, DEFAULTS.last_name);
    name = [first, last].filter(Boolean).join(' ') || null;
  }

  const custom: Record<string, unknown> = {};
  for (const [field, paths] of Object.entries(mapping.custom ?? {})) {
    const v = firstValue(data, paths);
    if (v !== null) custom[field] = v;
  }

  return {
    name,
    phone: firstValue(data, mapping.phone, mapping.phone ? [] : DEFAULTS.phone),
    email: firstValue(data, mapping.email, mapping.email ? [] : DEFAULTS.email)?.toLowerCase() ?? null,
    notes: firstValue(data, mapping.notes, mapping.notes ? [] : DEFAULTS.notes),
    custom,
    tags: (mapping.tags ?? []).filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()),
  };
}
