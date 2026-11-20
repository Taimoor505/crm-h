import { getExampleNumber, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import examples from 'libphonenumber-js/mobile/examples';
import { regionFromCountry, type RegionSettings } from '@/lib/format/settings';
import { jsonb, type Db } from '../db';
import { ApiError } from '../http';
import { TEMPLATES } from './templates';

export interface WorkspaceRow {
  id: string;
  partner_id: string;
  name: string;
  template_key: string;
  status: string;
  timezone: string;
  locale: string;
  country: string;
  currency: string;
  date_format: string;
  time_format: '12h' | '24h';
  week_starts_on: 0 | 1 | 6;
  area_unit: 'sqft' | 'sqm';
  default_phone_country: string;
  business_phone: string | null;
  has_samples: boolean;
  branding: Record<string, unknown>;
  created_at: Date | string;
}

export const REGION_KEYS = [
  'country', 'locale', 'currency', 'timezone', 'date_format', 'time_format', 'week_starts_on', 'area_unit', 'default_phone_country',
] as const;

function iso(v: Date | string | null): string | null {
  return v == null ? null : v instanceof Date ? v.toISOString() : v;
}

export function regionOf(w: WorkspaceRow): RegionSettings {
  return {
    country: w.country,
    locale: w.locale,
    currency: w.currency,
    timezone: w.timezone,
    date_format: w.date_format,
    time_format: w.time_format,
    week_starts_on: Number(w.week_starts_on) as 0 | 1 | 6,
    area_unit: w.area_unit,
    default_phone_country: w.default_phone_country,
  };
}

/** The workspace as the frontend reads it (adaptWorkspace plus region fields). */
export function workspaceOut(w: WorkspaceRow) {
  return {
    id: w.id,
    partner_id: w.partner_id,
    name: w.name,
    template_key: w.template_key,
    status: w.status,
    created_at: iso(w.created_at),
    has_samples: w.has_samples,
    business_phone: w.business_phone,
    ...regionOf(w),
  };
}

/** GET/PATCH /workspaces/:id/settings shape. */
export function settingsOut(w: WorkspaceRow) {
  return { ...regionOf(w), name: w.name, business_phone: w.business_phone, branding: w.branding ?? {} };
}

export async function loadWorkspace(tx: Db, id: string): Promise<WorkspaceRow> {
  const [w] = await tx<WorkspaceRow[]>`select * from public.workspaces where id = ${id}`;
  if (!w) throw new ApiError(404, 'not_found', 'Workspace not found');
  return w;
}

/** Region columns from a country plus explicit overrides (onboarding, settings). */
export function regionFromInput(input: Record<string, unknown>, base?: RegionSettings): RegionSettings {
  const country = typeof input.country === 'string' && /^[A-Za-z]{2}$/.test(input.country) ? input.country.toUpperCase() : base?.country ?? 'US';
  // Changing the country resets the derived defaults unless they are given too.
  const start = base && base.country === country ? base : regionFromCountry(country);
  const out: RegionSettings = { ...start, country };
  for (const k of REGION_KEYS) {
    const v = input[k];
    if (v === undefined || v === null || v === '' || k === 'country') continue;
    (out as unknown as Record<string, unknown>)[k] = v;
  }
  out.week_starts_on = Number(out.week_starts_on) as 0 | 1 | 6;
  if (input.locale === 'en' || input.locale === 'ur') out.locale = start.locale; // UI language, not a format locale
  validateRegion(out);
  return out;
}

export function validateRegion(r: RegionSettings) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: r.timezone });
  } catch {
    throw new ApiError(422, 'invalid_timezone', `Unknown time zone ${r.timezone}`);
  }
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: r.currency });
  } catch {
    throw new ApiError(422, 'invalid_currency', `Unknown currency ${r.currency}`);
  }
  try {
    new Intl.NumberFormat(r.locale);
  } catch {
    throw new ApiError(422, 'invalid_locale', `Unknown locale ${r.locale}`);
  }
  if (!['12h', '24h'].includes(r.time_format)) throw new ApiError(422, 'validation_failed', 'time_format must be 12h or 24h');
  if (![0, 1, 6].includes(r.week_starts_on)) throw new ApiError(422, 'validation_failed', 'week_starts_on must be 0, 1 or 6');
  if (!['sqft', 'sqm'].includes(r.area_unit)) throw new ApiError(422, 'validation_failed', 'area_unit must be sqft or sqm');
  if (!/^[A-Z]{2}$/.test(r.default_phone_country)) throw new ApiError(422, 'validation_failed', 'default_phone_country must be a 2-letter country code');
}

// ------------------------------------------------------------------ branding

/** Keys a partner or workspace may set. Anything else is dropped. */
export const BRANDING_KEYS = [
  'appName', 'tagline', 'primaryColor', 'accentColor', 'logoText', 'logoUrl', 'faviconUrl',
  'supportWhatsapp', 'supportEmail', 'hideModules', 'font',
] as const;
export const BRANDING_FONTS = ['Plus Jakarta Sans', 'Inter', 'DM Sans', 'Manrope', 'Poppins', 'Nunito Sans', 'IBM Plex Sans', 'Outfit', 'System'];
const HEX = /^#[0-9a-fA-F]{6}$/;
const MODULES = ['home', 'leads', 'pipeline', 'follow_ups', 'inbox', 'reports'];

/**
 * Cleans a branding patch. `null` removes a key (falls back to the partner
 * default); unknown keys and bad values are rejected with a clear message.
 */
export function cleanBranding(patch: unknown): Record<string, unknown> {
  if (!patch || typeof patch !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!(BRANDING_KEYS as readonly string[]).includes(k)) continue;
    if (v === null || v === '') {
      out[k] = null;
      continue;
    }
    switch (k) {
      case 'primaryColor':
      case 'accentColor':
        if (typeof v !== 'string' || !HEX.test(v)) throw new ApiError(422, 'validation_failed', `${k} must be a hex colour like #4F46E5`);
        out[k] = v.toUpperCase();
        break;
      case 'hideModules':
        if (!Array.isArray(v)) throw new ApiError(422, 'validation_failed', 'hideModules must be a list');
        out[k] = v.filter((m) => MODULES.includes(String(m)) && m !== 'home');
        break;
      case 'font':
        if (!BRANDING_FONTS.includes(String(v))) throw new ApiError(422, 'validation_failed', `font must be one of ${BRANDING_FONTS.join(', ')}`);
        out[k] = v;
        break;
      case 'logoUrl':
      case 'faviconUrl':
        if (typeof v !== 'string' || !/^https:\/\//.test(v) || v.length > 1000) throw new ApiError(422, 'validation_failed', `${k} must be an https URL`);
        out[k] = v;
        break;
      case 'supportEmail':
        if (typeof v !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new ApiError(422, 'validation_failed', 'supportEmail is not a valid email');
        out[k] = v;
        break;
      default:
        out[k] = String(v).slice(0, k === 'tagline' ? 160 : 60);
    }
  }
  return out;
}

/** Applies a cleaned patch to stored branding (null removes the key). */
export function mergeBranding(current: Record<string, unknown>, patch: Record<string, unknown>) {
  const next = { ...(current ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  return next;
}

export async function housePartner(tx: Db): Promise<{ id: string; name: string; slug: string; is_house: boolean; default_branding: Record<string, unknown> }> {
  const [p] = await tx<{ id: string; name: string; slug: string; is_house: boolean; default_branding: Record<string, unknown> }[]>`
    select id, name, slug, is_house, default_branding from public.partners where is_house order by created_at limit 1`;
  if (p) return p;
  const [created] = await tx<{ id: string; name: string; slug: string; is_house: boolean; default_branding: Record<string, unknown> }[]>`
    insert into public.partners (name, slug, is_house) values ('Hub to Hub', 'house', true)
    on conflict (slug) do update set is_house = true
    returning id, name, slug, is_house, default_branding`;
  return created;
}

// ------------------------------------------------------------------ creation

export async function seedTemplate(tx: Db, workspaceId: string, templateKey: string) {
  const tpl = TEMPLATES.find((t) => t.key === templateKey) ?? TEMPLATES.find((t) => t.key === 'general')!;
  const pipelines: { id: string; stages: { id: string; kind: string; name: string }[] }[] = [];
  for (const [pi, p] of tpl.pipelines.entries()) {
    const [row] = await tx<{ id: string }[]>`
      insert into public.pipelines (workspace_id, name, position) values (${workspaceId}, ${p.name}, ${pi + 1}) returning id`;
    const stages: { id: string; kind: string; name: string }[] = [];
    for (const [si, s] of p.stages.entries()) {
      const [st] = await tx<{ id: string }[]>`
        insert into public.stages (workspace_id, pipeline_id, name, position, kind)
        values (${workspaceId}, ${row.id}, ${s.name}, ${si + 1}, ${s.kind}) returning id`;
      stages.push({ id: st.id, kind: s.kind, name: s.name });
    }
    pipelines.push({ id: row.id, stages });
  }
  for (const [i, f] of tpl.custom_fields.entries()) {
    await tx`
      insert into public.custom_field_defs (workspace_id, entity, key, label_en, type, options, position)
      values (${workspaceId}, ${f.entity}, ${f.key}, ${f.label}, ${f.type}, ${jsonb(tx, f.options ?? [])}, ${i + 1})`;
  }
  return pipelines;
}

/** Creates a workspace with its template. Run as service role after authorising the caller. */
export async function createWorkspace(
  tx: Db,
  args: {
    partnerId: string;
    name: string;
    templateKey: string;
    region: RegionSettings;
    branding?: Record<string, unknown>;
    ownerId: string | null;
    seedSamples: boolean;
  },
): Promise<WorkspaceRow> {
  const r = args.region;
  const templateKey = TEMPLATES.some((t) => t.key === args.templateKey) ? args.templateKey : 'general';
  const [ws] = await tx<WorkspaceRow[]>`
    insert into public.workspaces
      (partner_id, name, template_key, branding, locale, timezone, country, currency, date_format, time_format,
       week_starts_on, area_unit, default_phone_country, has_samples)
    values (${args.partnerId}, ${args.name}, ${templateKey}, ${jsonb(tx, args.branding ?? {})}, ${r.locale}, ${r.timezone},
            ${r.country}, ${r.currency}, ${r.date_format}, ${r.time_format}, ${r.week_starts_on}, ${r.area_unit},
            ${r.default_phone_country}, ${args.seedSamples})
    returning *`;
  if (args.ownerId) {
    await tx`insert into public.memberships (workspace_id, user_id, role) values (${ws.id}, ${args.ownerId}, 'owner')`;
  }
  const pipelines = await seedTemplate(tx, ws.id, templateKey);
  if (args.seedSamples) await seedSamples(tx, ws, pipelines[0], args.ownerId);
  return ws;
}

// ------------------------------------------------------------------ sample data

const SAMPLE_PEOPLE = [
  'Sample · Alex Morgan', 'Sample · Priya Shah', 'Sample · Omar Haddad', 'Sample · Emma Clarke',
  'Sample · Lucas Silva', 'Sample · Mei Tan', 'Sample · Daniel Okafor', 'Sample · Sara Novak',
];

function samplePhones(country: string, n: number): string[] {
  const out: string[] = [];
  const example = getExampleNumber(country as CountryCode, examples);
  const base = example?.number ?? '+12015550123';
  for (let i = 0; out.length < n && i < 200; i++) {
    const candidate = base.slice(0, -2) + String((Number(base.slice(-2)) + 7 * (i + 1)) % 100).padStart(2, '0');
    const p = parsePhoneNumberFromString(candidate);
    if (p?.isValid() && !out.includes(p.number)) out.push(p.number);
  }
  return out;
}

/**
 * A few clearly-labelled sample leads, deals and follow-ups so a new
 * workspace isn't empty. Removed by POST /workspaces/:id/clear-samples.
 */
export async function seedSamples(
  tx: Db,
  ws: WorkspaceRow,
  pipeline: { id: string; stages: { id: string; kind: string }[] } | undefined,
  ownerId: string | null,
) {
  if (!ownerId) return;
  const phones = samplePhones(ws.country, SAMPLE_PEOPLE.length);
  const open = pipeline?.stages.filter((s) => s.kind === 'open') ?? [];
  const sources = ['website', 'facebook', 'referral', 'walk_in', 'manual'];
  for (const [i, name] of SAMPLE_PEOPLE.entries()) {
    if (!phones[i]) break;
    const hoursAgo = i * 9 + 1;
    const [c] = await tx<{ id: string }[]>`
      insert into public.contacts (workspace_id, name, phone_e164, source, owner_id, status, tags, is_sample,
                                   created_at, updated_at, last_activity_at, last_enquiry_at, first_response_at, last_response_at)
      values (${ws.id}, ${name}, ${phones[i]}, ${sources[i % sources.length]}, ${ownerId}, ${i < 3 ? 'new' : 'contacted'},
              ${['sample']}, true,
              now() - make_interval(hours => ${hoursAgo}::int), now() - make_interval(hours => ${hoursAgo}::int),
              now() - make_interval(hours => ${hoursAgo}::int), now() - make_interval(hours => ${hoursAgo}::int),
              ${i < 3 ? null : tx`now() - make_interval(hours => ${hoursAgo - 1}::int)`},
              ${i < 3 ? null : tx`now() - make_interval(hours => ${hoursAgo - 1}::int)`})
      returning id`;
    await tx`
      insert into public.activities (workspace_id, contact_id, type, actor_id, body, meta, created_at)
      values (${ws.id}, ${c.id}, 'system', null, 'Sample lead', ${jsonb(tx, { kind: 'lead_received', sample: true })},
              now() - make_interval(hours => ${hoursAgo}::int))`;
    if (pipeline && open.length && i < 6) {
      const stage = open[i % open.length];
      await tx`
        insert into public.deals (workspace_id, pipeline_id, stage_id, contact_id, title, value_minor, currency, owner_id, is_sample)
        values (${ws.id}, ${pipeline.id}, ${stage.id}, ${c.id}, ${`Sample deal ${i + 1}`}, ${(i + 2) * 250_000_00},
                ${ws.currency}, ${ownerId}, true)`;
    }
    if (i < 4) {
      await tx`
        insert into public.tasks (workspace_id, contact_id, assigned_to, created_by, type, title, due_at, origin)
        values (${ws.id}, ${c.id}, ${ownerId}, ${ownerId}, ${i % 2 ? 'whatsapp' : 'call'},
                ${`${i % 2 ? 'WhatsApp' : 'Call'} ${name.replace('Sample · ', '').split(' ')[0]}`},
                now() + make_interval(hours => ${i * 3 - 2}::int), 'manual')`;
    }
  }
}

export async function clearSamples(tx: Db, workspaceId: string): Promise<number> {
  const ids = await tx<{ id: string }[]>`select id from public.contacts where workspace_id = ${workspaceId} and is_sample`;
  const list = ids.map((r) => r.id);
  if (list.length) {
    await tx`delete from public.tasks where workspace_id = ${workspaceId} and contact_id = any(${list}::uuid[])`;
    await tx`delete from public.contacts where workspace_id = ${workspaceId} and id = any(${list}::uuid[])`;
  }
  await tx`update public.workspaces set has_samples = false where id = ${workspaceId}`;
  return list.length;
}
