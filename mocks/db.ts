/**
 * In-browser fake backend store for NEXT_PUBLIC_API_MOCKING=all. Seeded with
 * the four test workspaces from brief §11. Persisted to localStorage and
 * reseeded after 6 hours so "today" and "overdue" stay meaningful.
 */
import { regionFromCountry, type RegionSettings } from '@/lib/format/settings';
import { TEMPLATES } from './data/templates';

export interface MUser { id: string; name: string; phone: string; email: string | null; partner_admin_of: string | null; is_super_admin: boolean; created_at: string }
export interface MPartner { id: string; name: string; slug: string; is_house: boolean; branding: Record<string, unknown> }
export interface MWorkspace {
  id: string; partner_id: string; name: string; template_key: string; status: string; timezone: string; created_at: string;
  region: RegionSettings; branding: Record<string, unknown>; has_samples: boolean; plan: string | null;
}
export interface MMembership { id: string; user_id: string; workspace_id: string; role: 'owner' | 'manager' | 'agent'; status: 'active' | 'invited' | 'suspended'; created_at: string }
export interface MContact {
  id: string; workspace_id: string; name: string; phone_e164: string; alt_phone: string | null; email: string | null; source: string;
  owner_id: string | null; status: string; tags: string[]; custom: Record<string, unknown>; last_activity_at: string; created_at: string;
  updated_at: string; deleted_at: string | null; last_enquiry_at: string | null; first_response_at: string | null; last_response_at: string | null;
  sample: boolean;
}
export interface MPipeline { id: string; workspace_id: string; name: string; position: number; created_at: string }
export interface MStage { id: string; workspace_id: string; pipeline_id: string; name: string; position: number; kind: 'open' | 'won' | 'lost' }
export interface MDeal {
  id: string; workspace_id: string; pipeline_id: string; stage_id: string; contact_id: string; title: string; value_minor: number;
  currency: string; owner_id: string | null; expected_close: string | null; lost_reason: string | null; won_reason: string | null;
  custom: Record<string, unknown>; stage_entered_at: string; created_at: string; updated_at: string; deleted_at: string | null; sample: boolean;
}
export interface MActivity { id: string; workspace_id: string; contact_id: string | null; deal_id: string | null; type: string; actor_id: string | null; body: string; meta: Record<string, unknown>; created_at: string }
export interface MTask {
  id: string; workspace_id: string; contact_id: string | null; deal_id: string | null; assigned_to: string; created_by: string | null;
  type: string; title: string; notes: string | null; due_at: string; status: 'open' | 'done' | 'cancelled'; completed_at: string | null;
  outcome: string | null; origin: string; parent_task_id: string | null;
}
export interface MNotification { id: string; workspace_id: string; user_id: string; type: string; priority: 'normal' | 'urgent'; title: string; body: string | null; data: Record<string, unknown>; read_at: string | null; created_at: string }
export interface MConversation { id: string; workspace_id: string; contact_id: string; channel: 'whatsapp'; assigned_to: string | null; unread_count: number; last_message_at: string }
export interface MMessage { id: string; workspace_id: string; conversation_id: string; direction: 'inbound' | 'outbound'; type: 'text' | 'template'; body: string; media_url: null; wa_message_id: string | null; status: string; sent_at: string }
export interface MField { id: string; workspace_id: string; entity: 'contact' | 'deal'; key: string; label_en: string; type: string; options: string[]; required: boolean; position: number; hidden: boolean; created_at: string }
export interface MLeadSource { id: string; workspace_id: string; type: string; name: string; source_label: string; public_key: string; is_active: boolean; settings: Record<string, unknown>; secret: string | null; created_at: string }
export interface MAutomation { workspace_id: string; key: string; enabled: boolean; settings: Record<string, unknown>; last_run_at: string | null; runs_7d: number; failed_7d: number }
export interface MInvoice { id: string; workspace_id: string | null; partner_id: string | null; number: string; period_start: string; issue_date: string; due_date: string; status: string; total_minor: number; paid_minor: number; currency: string }
export interface MDomain { id: string; partner_id: string; domain: string; verified: boolean; created_at: string }

export interface MockDb {
  version: number;
  seeded_at: number;
  users: MUser[];
  partners: MPartner[];
  workspaces: MWorkspace[];
  memberships: MMembership[];
  contacts: MContact[];
  pipelines: MPipeline[];
  stages: MStage[];
  deals: MDeal[];
  activities: MActivity[];
  tasks: MTask[];
  notifications: MNotification[];
  conversations: MConversation[];
  messages: MMessage[];
  fields: MField[];
  lead_sources: MLeadSource[];
  assignment: Record<string, { mode: string; agent_ids: string[]; source_map: Record<string, string[]>; fallback: string; reassign_after_minutes: number | null; max_auto_reassigns: number }>;
  availability: Record<string, boolean>;
  automations: MAutomation[];
  imports: Record<string, unknown>[];
  invoices: MInvoice[];
  domains: MDomain[];
  reasons: Record<string, { won: string[]; lost: string[] }>;
  notification_settings: Record<string, { events: Record<string, { push: boolean; whatsapp: boolean }>; quiet_hours: boolean; whatsapp_number: string | null; devices: number }>;
  otp: Record<string, string>;
}

const VERSION = 3;
const STORAGE_KEY = 'crm.mockdb.v' + VERSION;
const MAX_AGE_MS = 6 * 3600_000;

// ------------------------------------------------------------- ids and PRNG

let seq = 0;
export function uid(): string {
  seq += 1;
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${seq}-${Math.random()}`;
  return rnd;
}

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fixed ids so the dev actor switcher and links stay stable across reseeds.
export const IDS = {
  partnerHouse: '00000000-0000-4000-8000-000000000001',
  partnerSky: '00000000-0000-4000-8000-000000000002',
  wsUS: '30000000-0000-4000-8000-000000000001',
  wsAE: '30000000-0000-4000-8000-000000000002',
  wsGB: '30000000-0000-4000-8000-000000000003',
  wsPK: '30000000-0000-4000-8000-000000000004',
  owner: '20000000-0000-4000-8000-000000000001',
  usManager: '20000000-0000-4000-8000-000000000002',
  usAgent: '20000000-0000-4000-8000-000000000003',
  usAgent2: '20000000-0000-4000-8000-000000000004',
  aeAgent: '20000000-0000-4000-8000-000000000005',
  gbAgent: '20000000-0000-4000-8000-000000000006',
  pkManager: '20000000-0000-4000-8000-000000000007',
  pkAgent: '20000000-0000-4000-8000-000000000008',
  partnerAdmin: '20000000-0000-4000-8000-000000000009',
  superAdmin: '20000000-0000-4000-8000-000000000010',
};

// ------------------------------------------------------------- seed

const FIRST = ['James', 'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Lucas', 'Mia', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'Logan', 'Amelia', 'Elijah', 'Harper', 'Aiden', 'Ella', 'Daniel', 'Grace', 'Henry', 'Chloe', 'Samuel', 'Lily', 'David', 'Zoe', 'Ryan', 'Nora', 'Owen', 'Leah'];
const LAST = ['Smith', 'Johnson', 'Brown', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Taylor', 'Anderson', 'Thomas', 'Moore', 'Martin', 'Lee', 'Walker', 'Hall', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Hill', 'Campbell'];
const FIRST_AE = ['Ahmed', 'Fatima', 'Omar', 'Layla', 'Yousef', 'Mariam', 'Khalid', 'Noura', 'Hassan', 'Sara', 'Rashid', 'Huda', 'Ali', 'Reem', 'Karim', 'Priya', 'Arjun', 'Anna', 'Mark', 'Elena'];
const LAST_AE = ['Al Mansoori', 'Al Hashimi', 'Haddad', 'Khan', 'Nair', 'Rahman', 'Saleh', 'Farouk', 'Menon', 'Petrova', 'Al Suwaidi', 'Kapoor'];
const FIRST_GB = ['Oliver', 'Amelia', 'George', 'Isla', 'Harry', 'Ava', 'Jack', 'Freya', 'Charlie', 'Poppy', 'Thomas', 'Florence', 'Alfie', 'Evie', 'William', 'Rosie'];
const LAST_GB = ['Hughes', 'Patel', 'Evans', 'Roberts', 'Clarke', 'Wood', 'Turner', 'Shaw', 'Bennett', 'Harrison', 'Morgan', 'Cooper', 'Ward', 'Price'];
const FIRST_PK = ['Ahmed', 'Ayesha', 'Usman', 'Fatima', 'Hamza', 'Zainab', 'Bilal', 'Hira', 'Imran', 'Sana', 'Kamran', 'Maryam', 'Faisal', 'Amna', 'Tariq', 'Rabia'];
const LAST_PK = ['Khan', 'Malik', 'Butt', 'Chaudhry', 'Sheikh', 'Qureshi', 'Mirza', 'Raza', 'Iqbal', 'Siddiqui', 'Javed', 'Aslam'];

interface WsSeed {
  id: string; partner_id: string; name: string; template: string; country: string; contacts: number; dealValue: [number, number];
  owner: string; manager: string | null; agents: string[]; sources: string[]; first: string[]; last: string[];
  phone: (r: () => number, i: number) => string; branding: Record<string, unknown>;
}

const pad = (n: number, w: number) => String(n).padStart(w, '0');

const WS_SEEDS: WsSeed[] = [
  {
    id: IDS.wsUS, partner_id: IDS.partnerHouse, name: 'US Realty', template: 'real_estate', country: 'US', contacts: 1200, dealValue: [180_000, 1_400_000],
    owner: IDS.owner, manager: IDS.usManager, agents: [IDS.usAgent, IDS.usAgent2], sources: ['website', 'facebook', 'zillow', 'referral', 'walk_in', 'manual'],
    first: FIRST, last: LAST, phone: (_r, i) => `+1212555${pad(1000 + (i % 9000), 4)}`,
    branding: { appName: 'US Realty CRM', logoText: 'US', primaryColor: '#1d4ed8', accentColor: '#f59e0b' },
  },
  {
    id: IDS.wsAE, partner_id: IDS.partnerSky, name: 'Dubai Homes', template: 'real_estate', country: 'AE', contacts: 140, dealValue: [900_000, 9_000_000],
    owner: IDS.owner, manager: null, agents: [IDS.aeAgent], sources: ['website', 'facebook', 'bayut', 'property_finder', 'referral', 'whatsapp'],
    first: FIRST_AE, last: LAST_AE, phone: (_r, i) => `+97150${pad(1200000 + i * 37, 7)}`,
    branding: {},
  },
  {
    id: IDS.wsGB, partner_id: IDS.partnerSky, name: 'London Legal', template: 'law', country: 'GB', contacts: 90, dealValue: [2_500, 60_000],
    owner: IDS.owner, manager: null, agents: [IDS.gbAgent], sources: ['website', 'google_ads', 'referral', 'phone', 'manual'],
    first: FIRST_GB, last: LAST_GB, phone: (_r, i) => `+447700900${pad(100 + (i % 900), 3)}`,
    branding: { appName: 'London Legal CRM', logoText: 'LL', primaryColor: '#7c2d12', accentColor: '#b45309' },
  },
  {
    id: IDS.wsPK, partner_id: IDS.partnerHouse, name: 'Lahore Distributors', template: 'distributor', country: 'PK', contacts: 160, dealValue: [150_000, 4_500_000],
    owner: IDS.owner, manager: IDS.pkManager, agents: [IDS.pkAgent], sources: ['field_visit', 'whatsapp', 'referral', 'facebook', 'manual'],
    first: FIRST_PK, last: LAST_PK, phone: (_r, i) => `+92300${pad(4100000 + i * 53, 7)}`,
    branding: { appName: 'Lahore Trade CRM', logoText: 'LT', primaryColor: '#facc15', accentColor: '#16a34a' },
  },
];

const STATUSES = ['new', 'contacted', 'qualified', 'hot', 'cold'];
const TAGS = ['vip', 'investor', 'first_time', 'urgent', 'returning', 'cash_buyer'];
const LOST = ['Price too high', 'Chose a competitor', 'No response', 'Not ready yet', 'Budget changed'];
const WON = ['Best price', 'Fast response', 'Referral trust', 'Right product'];
const MESSAGES_IN = ['Hi, is this still available?', 'Can you send me more details please?', 'What is the best price?', 'Can we schedule a call tomorrow?', 'Thanks, I will think about it.'];
const MESSAGES_OUT = ['Hello! Thanks for reaching out. Yes, it is available.', 'Sure, sending the details now.', 'Would tomorrow at 11 work for a call?'];

function iso(ms: number) {
  return new Date(ms).toISOString();
}

export function buildSeed(now = Date.now()): MockDb {
  const r = prng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const H = 3600_000;
  const D = 24 * H;
  const created = iso(now - 90 * D);

  const users: MUser[] = [
    { id: IDS.owner, name: 'Sarah Mitchell', phone: '+12125550101', email: 'sarah@example.com', partner_admin_of: null, is_super_admin: false, created_at: created },
    { id: IDS.usManager, name: 'Emily Chen', phone: '+12125550103', email: 'emily@example.com', partner_admin_of: null, is_super_admin: false, created_at: created },
    { id: IDS.usAgent, name: 'Jake Turner', phone: '+12125550102', email: 'jake@example.com', partner_admin_of: null, is_super_admin: false, created_at: created },
    { id: IDS.usAgent2, name: 'Maria Lopez', phone: '+12125550104', email: 'maria@example.com', partner_admin_of: null, is_super_admin: false, created_at: created },
    { id: IDS.aeAgent, name: 'Aisha Rahman', phone: '+971501234568', email: 'aisha@example.com', partner_admin_of: null, is_super_admin: false, created_at: created },
    { id: IDS.gbAgent, name: 'Oliver Hughes', phone: '+447700900123', email: 'oliver@example.com', partner_admin_of: null, is_super_admin: false, created_at: created },
    { id: IDS.pkManager, name: 'Sana Iqbal', phone: '+923001234566', email: 'sana@example.com', partner_admin_of: null, is_super_admin: false, created_at: created },
    { id: IDS.pkAgent, name: 'Bilal Ahmed', phone: '+923001234567', email: 'bilal@example.com', partner_admin_of: null, is_super_admin: false, created_at: created },
    { id: IDS.partnerAdmin, name: 'Omar Haddad', phone: '+971501234567', email: 'omar@example.com', partner_admin_of: IDS.partnerSky, is_super_admin: false, created_at: created },
    { id: IDS.superAdmin, name: 'Platform Admin', phone: '+447700900001', email: 'admin@example.com', partner_admin_of: null, is_super_admin: true, created_at: created },
  ];

  const partners: MPartner[] = [
    { id: IDS.partnerHouse, name: 'CRM Platform', slug: 'house', is_house: true, branding: { appName: 'LeadDesk', tagline: 'Respond faster. Close sooner.', logoText: 'LD', primaryColor: '#059669', accentColor: '#f97316', supportEmail: 'support@example.com', supportWhatsapp: '+12125550199' } },
    { id: IDS.partnerSky, name: 'Skyline Partners', slug: 'skyline', is_house: false, branding: { appName: 'Skyline CRM', tagline: 'Every lead, answered.', logoText: 'SK', primaryColor: '#0e7490', accentColor: '#e11d48', supportEmail: 'help@skyline.example', supportWhatsapp: '+971501234567' } },
  ];

  const db: MockDb = {
    version: VERSION, seeded_at: now, users, partners, workspaces: [], memberships: [], contacts: [], pipelines: [], stages: [], deals: [],
    activities: [], tasks: [], notifications: [], conversations: [], messages: [], fields: [], lead_sources: [], assignment: {},
    availability: {}, automations: [], imports: [], invoices: [], domains: [], reasons: {}, notification_settings: {}, otp: {},
  };

  db.domains.push({ id: uid(), partner_id: IDS.partnerSky, domain: 'crm.skyline.example', verified: true, created_at: created });

  for (const s of WS_SEEDS) {
    const region = regionFromCountry(s.country);
    const ws: MWorkspace = {
      id: s.id, partner_id: s.partner_id, name: s.name, template_key: s.template, status: 'active', timezone: region.timezone,
      created_at: created, region, branding: s.branding, has_samples: true, plan: s.partner_id === IDS.partnerHouse ? 'monthly' : 'commission',
    };
    db.workspaces.push(ws);
    const team = [s.owner, ...(s.manager ? [s.manager] : []), ...s.agents];
    db.memberships.push({ id: uid(), user_id: s.owner, workspace_id: s.id, role: 'owner', status: 'active', created_at: created });
    if (s.manager) db.memberships.push({ id: uid(), user_id: s.manager, workspace_id: s.id, role: 'manager', status: 'active', created_at: created });
    for (const a of s.agents) db.memberships.push({ id: uid(), user_id: a, workspace_id: s.id, role: 'agent', status: 'active', created_at: created });

    const tpl = TEMPLATES.find((t) => t.key === s.template)!;
    seedTemplate(db, ws, tpl.key, created);
    const pipeline = db.pipelines.find((p) => p.workspace_id === s.id)!;
    const stages = db.stages.filter((st) => st.pipeline_id === pipeline.id).sort((a, b) => a.position - b.position);

    const sellers = s.agents.concat(s.manager ? [s.manager] : []);
    for (let i = 0; i < s.contacts; i++) {
      const name = `${pick(s.first)} ${pick(s.last)}`;
      // Recent leads cluster near now so Home and "today" have data.
      const ageH = i < 8 ? r() * 6 : i < 30 ? 6 + r() * 72 : 72 + r() * 80 * 24;
      const createdAt = now - ageH * H;
      const owner = i % 23 === 7 ? null : pick(sellers);
      const responded = ageH > 1 && r() > 0.25;
      const firstResp = responded ? createdAt + (r() < 0.6 ? r() * 15 * 60_000 : r() * 6 * H) : null;
      const custom: Record<string, unknown> = {};
      for (const f of tpl.custom_fields.filter((x) => x.entity === 'contact')) {
        if (r() < 0.3) continue;
        if (f.type === 'money') custom[f.key] = Math.round((s.dealValue[0] + r() * (s.dealValue[1] - s.dealValue[0])) / 1000) * 1000;
        else if (f.type === 'select') custom[f.key] = pick(f.options!);
        else if (f.type === 'date') custom[f.key] = new Date(now + (r() * 30 - 5) * D).toISOString().slice(0, 10);
        else custom[f.key] = f.key === 'city' ? pick(['Lahore', 'Gujranwala', 'Sialkot', 'Kasur']) : f.key === 'location' ? pick(['Downtown', 'Marina', 'Uptown', 'Riverside', 'Old Town']) : pick(['Website', 'Partner', 'Friend']);
      }
      const c: MContact = {
        id: uid(), workspace_id: s.id, name, phone_e164: s.phone(r, i), alt_phone: null,
        email: r() < 0.6 ? `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${i}@example.com` : null,
        source: pick(s.sources), owner_id: owner, status: ageH < 24 ? 'new' : pick(STATUSES), tags: r() < 0.35 ? [pick(TAGS)] : [],
        custom, last_activity_at: iso(firstResp ?? createdAt), created_at: iso(createdAt), updated_at: iso(firstResp ?? createdAt), deleted_at: null,
        last_enquiry_at: iso(createdAt), first_response_at: firstResp ? iso(firstResp) : null, last_response_at: firstResp ? iso(firstResp) : null, sample: true,
      };
      db.contacts.push(c);
      db.activities.push({ id: uid(), workspace_id: s.id, contact_id: c.id, deal_id: null, type: 'system', actor_id: null, body: `Lead received from ${c.source}`, meta: { kind: 'lead_received', source_label: c.source }, created_at: c.created_at });
      if (firstResp) db.activities.push({ id: uid(), workspace_id: s.id, contact_id: c.id, deal_id: null, type: 'call', actor_id: owner, body: 'Call: answered', meta: { outcome: 'answered' }, created_at: iso(firstResp) });

      // Deals for roughly half the contacts (fewer for the big workspace).
      if (r() < (s.contacts > 500 ? 0.12 : 0.5)) {
        const stIdx = Math.min(stages.length - 1, Math.floor(r() ** 1.6 * stages.length));
        const st = stages[stIdx];
        const value = Math.round((s.dealValue[0] + r() * (s.dealValue[1] - s.dealValue[0])) / 100) * 100;
        const entered = Math.max(createdAt, now - r() * 40 * D);
        const dealCustom: Record<string, unknown> = {};
        for (const f of tpl.custom_fields.filter((x) => x.entity === 'deal')) {
          if (f.type === 'area') dealCustom[f.key] = Math.round(600 + r() * 4000);
          else if (f.type === 'money') dealCustom[f.key] = Math.round(value / 4 / 1000) * 1000;
          else if (f.type === 'date') dealCustom[f.key] = new Date(now + r() * 40 * D).toISOString().slice(0, 10);
          else if (f.type === 'select') dealCustom[f.key] = pick(f.options!);
          else dealCustom[f.key] = `${String.fromCharCode(65 + Math.floor(r() * 6))}-${100 + Math.floor(r() * 800)}`;
        }
        const d: MDeal = {
          id: uid(), workspace_id: s.id, pipeline_id: pipeline.id, stage_id: st.id, contact_id: c.id,
          title: `${name.split(' ')[0]}: ${s.template === 'law' ? pick(['Lease dispute', 'Will and estate', 'Employment claim', 'Company formation']) : s.template === 'distributor' ? pick(['Monthly supply', 'Starter order', 'Seasonal stock']) : pick(['2-bed apartment', 'Townhouse', 'Villa', 'Studio', 'Office unit'])}`,
          value_minor: value * 100, currency: region.currency, owner_id: owner, expected_close: new Date(now + r() * 60 * D).toISOString().slice(0, 10),
          lost_reason: st.kind === 'lost' ? pick(LOST) : null, won_reason: st.kind === 'won' ? pick(WON) : null, custom: dealCustom,
          stage_entered_at: iso(entered), created_at: iso(createdAt), updated_at: iso(entered), deleted_at: null, sample: true,
        };
        db.deals.push(d);
        if (stIdx > 0) db.activities.push({ id: uid(), workspace_id: s.id, contact_id: c.id, deal_id: d.id, type: 'stage_change', actor_id: owner, body: `Moved to ${st.name}`, meta: { to_stage_id: st.id }, created_at: d.stage_entered_at });
      }
    }

    // Follow-ups: overdue, today and upcoming for each seller.
    const wsContacts = db.contacts.filter((c) => c.workspace_id === s.id);
    for (const u of team) {
      for (let k = 0; k < 9; k++) {
        const c = wsContacts[(k * 7 + team.indexOf(u) * 13) % Math.min(wsContacts.length, 60)];
        const offsetH = [-30, -5, -1.5, 0.5, 2, 4, 26, 50, 120][k];
        const type = (['call', 'whatsapp', 'call', 'meeting', 'call', 'site_visit', 'call', 'whatsapp', 'other'] as const)[k];
        db.tasks.push({
          id: uid(), workspace_id: s.id, contact_id: c.id, deal_id: null, assigned_to: u, created_by: u, type,
          title: `${type === 'call' ? 'Call' : type === 'whatsapp' ? 'WhatsApp' : type === 'meeting' ? 'Meet' : type === 'site_visit' ? 'Viewing with' : 'Follow up with'} ${c.name.split(' ')[0]}`,
          notes: null, due_at: iso(now + offsetH * H), status: 'open', completed_at: null, outcome: null, origin: 'manual', parent_task_id: null,
        });
      }
      // A few done today for "Team today".
      for (let k = 0; k < 2 + Math.floor(r() * 4); k++) {
        const c = wsContacts[(k * 11 + 5) % Math.min(wsContacts.length, 60)];
        db.tasks.push({
          id: uid(), workspace_id: s.id, contact_id: c.id, deal_id: null, assigned_to: u, created_by: u, type: 'call', title: `Call ${c.name.split(' ')[0]}`,
          notes: null, due_at: iso(now - (k + 1) * H), status: 'done', completed_at: iso(now - k * 0.5 * H), outcome: 'answered', origin: 'manual', parent_task_id: null,
        });
      }
      db.availability[`${s.id}:${u}`] = true;
      db.notification_settings[`${s.id}:${u}`] = { events: {}, quiet_hours: true, whatsapp_number: null, devices: 0 };
    }

    // Notifications for every member.
    for (const u of team) {
      const recent = wsContacts.slice(0, 4);
      recent.forEach((c, k) => {
        db.notifications.push({
          id: uid(), workspace_id: s.id, user_id: u, type: k === 0 ? 'lead.untouched' : 'lead.assigned', priority: k === 0 ? 'urgent' : 'normal',
          title: k === 0 ? `${c.name} hasn't been contacted yet` : `New lead: ${c.name}`, body: `Source: ${c.source}`,
          data: { contact_id: c.id }, read_at: k > 1 ? iso(now - H) : null, created_at: c.created_at,
        });
      });
      const t = db.tasks.find((x) => x.assigned_to === u && x.workspace_id === s.id && x.status === 'open' && new Date(x.due_at).getTime() < now);
      if (t) db.notifications.push({ id: uid(), workspace_id: s.id, user_id: u, type: 'task.overdue', priority: 'urgent', title: `Overdue: ${t.title}`, body: null, data: { task_id: t.id, contact_id: t.contact_id }, read_at: null, created_at: t.due_at });
    }

    // WhatsApp conversations.
    wsContacts.slice(0, 12).forEach((c, k) => {
      const conv: MConversation = { id: uid(), workspace_id: s.id, contact_id: c.id, channel: 'whatsapp', assigned_to: k % 4 === 3 ? null : c.owner_id, unread_count: k < 4 ? 1 + (k % 3) : 0, last_message_at: iso(now - k * 2.3 * H) };
      db.conversations.push(conv);
      const n = 2 + (k % 4);
      for (let m = 0; m < n; m++) {
        const inbound = m % 2 === 0;
        db.messages.push({
          id: uid(), workspace_id: s.id, conversation_id: conv.id, direction: inbound ? 'inbound' : 'outbound', type: 'text',
          body: inbound ? MESSAGES_IN[(k + m) % MESSAGES_IN.length] : MESSAGES_OUT[(k + m) % MESSAGES_OUT.length], media_url: null, wa_message_id: null,
          status: inbound ? 'received' : 'read', sent_at: iso(now - k * 2.3 * H - (n - m) * 25 * 60_000 - (k > 6 ? 30 * H : 0)),
        });
      }
      conv.last_message_at = db.messages.filter((x) => x.conversation_id === conv.id).at(-1)!.sent_at;
    });

    // Lead sources, assignment, automations.
    db.lead_sources.push(
      { id: uid(), workspace_id: s.id, type: 'website_form', name: 'Website contact form', source_label: 'website', public_key: `ls_${s.country.toLowerCase()}web01`, is_active: true, settings: { allowed_origins: [], default_tags: [] }, secret: null, created_at: created },
      { id: uid(), workspace_id: s.id, type: 'webhook', name: 'Zapier', source_label: 'webhook', public_key: `ls_${s.country.toLowerCase()}hook01`, is_active: true, settings: {}, secret: 'whsec_demo_secret', created_at: created },
    );
    db.assignment[s.id] = { mode: s.agents.length > 1 ? 'round_robin' : 'manual', agent_ids: s.agents, source_map: {}, fallback: 'round_robin', reassign_after_minutes: null, max_auto_reassigns: 2 };
    for (const key of AUTOMATION_KEYS) {
      db.automations.push({ workspace_id: s.id, key, enabled: key === 'auto_follow_up' || key === 'no_answer_retry', settings: {}, last_run_at: key === 'auto_follow_up' ? iso(now - 2 * H) : null, runs_7d: key === 'auto_follow_up' ? 34 : 0, failed_7d: 0 });
    }
    db.reasons[pipeline.id] = { won: WON, lost: LOST };

    // Billing for direct customers.
    if (s.partner_id === IDS.partnerHouse) {
      for (let m = 3; m >= 1; m--) {
        const issue = new Date(now - m * 30 * D);
        db.invoices.push({
          id: uid(), workspace_id: s.id, partner_id: null, number: `INV-${issue.getUTCFullYear()}${pad(issue.getUTCMonth() + 1, 2)}-${s.country}`,
          period_start: issue.toISOString().slice(0, 10), issue_date: issue.toISOString().slice(0, 10), due_date: new Date(issue.getTime() + 7 * D).toISOString().slice(0, 10),
          status: 'paid', total_minor: 4900 * 100, paid_minor: 4900 * 100, currency: region.currency,
        });
      }
    }
  }

  return db;
}

export const AUTOMATION_KEYS = ['welcome_message', 'auto_follow_up', 'no_answer_retry', 'stage_follow_up', 'stale_deal_alert', 'won_notice'] as const;

/** Creates pipelines, stages and custom fields for a workspace from a template. */
export function seedTemplate(db: MockDb, ws: MWorkspace, templateKey: string, createdAt = new Date().toISOString()) {
  const tpl = TEMPLATES.find((t) => t.key === templateKey) ?? TEMPLATES.find((t) => t.key === 'general')!;
  tpl.pipelines.forEach((p, pi) => {
    const pipeline: MPipeline = { id: uid(), workspace_id: ws.id, name: p.name, position: pi + 1, created_at: createdAt };
    db.pipelines.push(pipeline);
    p.stages.forEach((st, si) => db.stages.push({ id: uid(), workspace_id: ws.id, pipeline_id: pipeline.id, name: st.name, position: si + 1, kind: st.kind }));
    db.reasons[pipeline.id] = { won: ['Best price', 'Fast response', 'Referral trust'], lost: ['Price too high', 'Chose a competitor', 'No response', 'Not ready yet'] };
  });
  tpl.custom_fields.forEach((f, i) =>
    db.fields.push({ id: uid(), workspace_id: ws.id, entity: f.entity, key: f.key, label_en: f.label, type: f.type, options: f.options ?? [], required: false, position: i + 1, hidden: false, created_at: createdAt }),
  );
}

// ------------------------------------------------------------- persistence

let db: MockDb | null = null;

export function getDb(): MockDb {
  if (db) return db;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockDb;
        if (parsed.version === VERSION && Date.now() - parsed.seeded_at < MAX_AGE_MS) {
          db = parsed;
          return db;
        }
      }
    } catch {
      // fall through to a fresh seed
    }
  }
  db = buildSeed();
  persist();
  return db;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
export function persist() {
  if (typeof window === 'undefined' || !db) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      // Quota or private mode: keep in memory only.
    }
  }, 150);
}

export function resetDb() {
  db = buildSeed();
  persist();
  return db;
}
