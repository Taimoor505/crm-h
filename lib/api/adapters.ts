/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Backend → frontend shape adapters. Every place that reads a field the
 * backend is still changing (brief section 12) is here and tagged TODO.
 */
import { toMinor, type Money } from '@/lib/format';
import type {
  Activity, Branding, Contact, CustomFieldDef, Deal, Membership, ModuleKey, Pipeline,
  ResolvedBranding, Stage, Task, TeamMember, User, Workspace,
} from './types';

export type Raw = Record<string, any>;

let fallbackCurrency = 'USD';
/** Set by WorkspaceSettingsProvider so legacy `*_pkr` amounts render in the workspace currency. */
export function setFallbackCurrency(c: string) {
  fallbackCurrency = c;
}
export function getFallbackCurrency() {
  return fallbackCurrency;
}

/**
 * Money from either the requested shape (`<prefix>_minor` + `currency`) or the
 * current `<prefix>_pkr` whole-unit field.
 * TODO(money): drop the `_pkr` branch once brief §12.3 ships.
 */
export function money(raw: Raw | null | undefined, prefix: string): Money | null {
  if (!raw) return null;
  const minor = raw[`${prefix}_minor`];
  if (typeof minor === 'number') return { amount_minor: minor, currency: raw.currency ?? fallbackCurrency };
  const pkr = raw[`${prefix}_pkr`];
  if (typeof pkr === 'number') return { amount_minor: toMinor(pkr, fallbackCurrency), currency: fallbackCurrency };
  return null;
}

export function moneyOrZero(raw: Raw | null | undefined, prefix: string): Money {
  return money(raw, prefix) ?? { amount_minor: 0, currency: fallbackCurrency };
}

export function adaptUser(u: Raw): User {
  return {
    id: u.id,
    name: u.name ?? '',
    phone: u.phone ?? null,
    email: u.email ?? null,
    partner_admin_of: u.partner_admin_of ?? null,
    is_super_admin: Boolean(u.is_super_admin),
  };
}

export function adaptWorkspace(w: Raw): Workspace {
  return {
    id: w.id,
    partner_id: w.partner_id,
    name: w.name,
    template_key: w.template_key ?? 'general',
    status: w.status ?? 'active',
    timezone: w.timezone ?? 'UTC',
    created_at: w.created_at,
  };
}

export function adaptMembership(m: Raw): Membership {
  return {
    id: m.id,
    user_id: m.user_id,
    workspace_id: m.workspace_id,
    role: m.role,
    status: m.status ?? 'active',
    workspace_name: m.workspace_name ?? null,
  };
}

const MODULES: ModuleKey[] = ['home', 'leads', 'pipeline', 'follow_ups', 'inbox', 'reports'];

export function adaptBrandingConfig(b: Raw = {}): Branding {
  return {
    appName: b.appName ?? 'CRM',
    tagline: b.tagline ?? '',
    primaryColor: b.primaryColor ?? '#059669',
    // TODO(branding): accentColor, supportEmail, hideModules, logoUrl, faviconUrl (brief §12.8)
    accentColor: b.accentColor ?? null,
    logoText: b.logoText ?? (b.appName ?? 'CRM').slice(0, 2).toUpperCase(),
    logoUrl: b.logoUrl ?? null,
    faviconUrl: b.faviconUrl ?? null,
    supportWhatsapp: b.supportWhatsapp ?? null,
    supportEmail: b.supportEmail ?? null,
    hideModules: Array.isArray(b.hideModules) ? b.hideModules.filter((m: string) => MODULES.includes(m as ModuleKey)) : [],
  };
}

export function adaptResolvedBranding(r: Raw): ResolvedBranding {
  return {
    partner: r.partner,
    workspace_id: r.workspace?.id ?? null,
    matched_domain: r.matched_domain ?? null,
    branding: adaptBrandingConfig(r.branding),
  };
}

export function adaptContact(c: Raw): Contact {
  return {
    id: c.id,
    name: c.name ?? '',
    phone_e164: c.phone_e164 ?? '',
    alt_phone: c.alt_phone ?? null,
    email: c.email ?? null,
    source: c.source ?? 'manual',
    owner_id: c.owner_id ?? null,
    status: c.status ?? 'new',
    tags: Array.isArray(c.tags) ? c.tags : [],
    custom: c.custom ?? {},
    last_activity_at: c.last_activity_at ?? null,
    created_at: c.created_at,
    updated_at: c.updated_at ?? c.created_at,
  };
}

export function adaptStage(s: Raw): Stage {
  return { id: s.id, pipeline_id: s.pipeline_id, name: s.name, position: s.position ?? 0, kind: s.kind ?? 'open' };
}

export function adaptPipeline(p: Raw): Pipeline {
  return {
    id: p.id,
    name: p.name,
    position: p.position ?? 0,
    stages: (p.stages ?? []).map(adaptStage).sort((a: Stage, b: Stage) => a.position - b.position),
  };
}

export function adaptDeal(d: Raw): Deal {
  return {
    id: d.id,
    pipeline_id: d.pipeline_id,
    stage_id: d.stage_id,
    contact_id: d.contact_id,
    title: d.title ?? '',
    value: money(d, 'value'),
    owner_id: d.owner_id ?? null,
    expected_close: d.expected_close ?? null,
    lost_reason: d.lost_reason ?? null,
    won_reason: d.won_reason ?? null,
    custom: d.custom ?? {},
    stage_entered_at: d.stage_entered_at ?? d.created_at,
    // TODO(backend): deals list doesn't join the next open task yet.
    next_task_due_at: d.next_task_due_at ?? null,
    contact: d.contact ?? null,
    created_at: d.created_at,
    updated_at: d.updated_at ?? d.created_at,
  };
}

export function adaptActivity(a: Raw): Activity {
  return {
    id: a.id,
    contact_id: a.contact_id ?? null,
    deal_id: a.deal_id ?? null,
    type: a.type ?? 'system',
    actor_id: a.actor_id ?? null,
    body: a.body ?? '',
    meta: a.meta ?? {},
    created_at: a.created_at,
  };
}

export function adaptField(f: Raw): CustomFieldDef {
  return {
    id: f.id,
    entity: f.entity,
    key: f.key,
    label: f.label ?? f.label_en ?? f.key,
    type: f.type ?? 'text',
    options: f.options ?? [],
    required: Boolean(f.required),
    position: f.position ?? 0,
    hidden: Boolean(f.hidden),
  };
}

export function adaptMember(m: Raw): TeamMember {
  return {
    membership_id: m.id,
    user_id: m.user_id,
    name: m.user?.name ?? '',
    phone: m.user?.phone ?? null,
    email: m.user?.email ?? null,
    role: m.role,
    status: m.status ?? 'active',
  };
}

export function adaptTask(t: Raw): Task {
  return {
    id: t.id,
    contact_id: t.contact_id ?? null,
    deal_id: t.deal_id ?? null,
    assigned_to: t.assigned_to,
    type: t.type ?? 'other',
    title: t.title ?? '',
    notes: t.notes ?? null,
    due_at: t.due_at,
    status: t.status ?? 'open',
    completed_at: t.completed_at ?? null,
    outcome: t.outcome ?? null,
    is_overdue: t.is_overdue ?? new Date(t.due_at).getTime() < Date.now(),
    contact:
      t.contact ??
      (t.contact_id ? { id: t.contact_id, name: t.contact_name ?? null, phone_e164: t.contact_phone ?? null } : null),
  };
}
