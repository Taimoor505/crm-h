import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import {
  Activity,
  AuditLog,
  BrandingConfig,
  Company,
  Contact,
  Conversation,
  CustomFieldDef,
  DatabaseState,
  Deal,
  DomainEvent,
  DomainEventName,
  Membership,
  Message,
  Partner,
  PartnerDomain,
  Pipeline,
  Stage,
  TemplateKey,
  User,
  WhatsappAccount,
  Workspace,
} from './types';
import { LAUNCH_INDUSTRY_TEMPLATES } from './templates';
import { normalizePhoneToE164 } from './phone';
import { encryptSecret } from './crypto';

const STATE_FILE = path.join('/tmp', 'taimoor_core_state_v1.json');

declare global {
  var _taimoorMemoryState: DatabaseState | undefined;
  var _taimoorPgPool: Pool | undefined;
}

import { PARTNER_IDS, USER_IDS, WORKSPACE_IDS } from './constants';
export { PARTNER_IDS, USER_IDS, WORKSPACE_IDS };

export function getDbConnectionStatus() {
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const dbUrl = process.env.SUPABASE_DB_URL || '';
  const supabaseConfigured =
    Boolean(supabaseUrl) &&
    Boolean(serviceKey) &&
    !supabaseUrl.includes('your-project') &&
    !serviceKey.includes('MY_SUPABASE');
  return {
    mode: supabaseConfigured ? ('supabase' as const) : ('sandbox_relational' as const),
    supabaseConfigured,
    directPgConfigured: Boolean(dbUrl),
  };
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const { supabaseConfigured } = getDbConnectionStatus();
  if (!supabaseConfigured) return null;
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export function getPgPool(): Pool | null {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) return null;
  if (!global._taimoorPgPool) {
    global._taimoorPgPool = new Pool({
      connectionString: dbUrl,
      max: 5,
      connectionTimeoutMillis: 10000,
      ssl: { rejectUnauthorized: false },
    });
    global._taimoorPgPool.on('error', (err) => {
      console.error('Unexpected idle pg error:', err.message);
    });
  }
  return global._taimoorPgPool;
}

function buildSeedState(): DatabaseState {
  const now = new Date('2026-11-18T08:00:00.000Z').toISOString();

  const partners: Partner[] = [
    {
      id: PARTNER_IDS.HOUSE,
      name: 'Taimoor House Platform',
      slug: 'taimoor-house',
      is_house: true,
      status: 'active',
      default_branding: {
        appName: 'Taimoor Core',
        appNameUr: 'تیمور کور',
        tagline: 'Pakistan White-Label CRM Platform',
        taglineUr: 'پاکستان کا وائٹ لیبل سی آر ایم پلیٹ فارم',
        primaryColor: '#059669',
        primaryHover: '#047857',
        surfaceTint: '#ecfdf5',
        inkColor: '#065f46',
        logoText: 'TC',
        supportWhatsapp: '+923001112233',
      },
      created_at: now,
    },
    {
      id: PARTNER_IDS.KARACHI_PROPTECH,
      name: 'Karachi PropTech Cloud',
      slug: 'karachi-proptech',
      is_house: false,
      status: 'active',
      default_branding: {
        appName: 'PropFlow Pakistan',
        appNameUr: 'پراپ فلو پاکستان',
        tagline: 'White-Label Real Estate CRM',
        taglineUr: 'رئیل اسٹیٹ ایجنسیوں کا وائٹ لیبل سسٹم',
        primaryColor: '#1d4ed8',
        primaryHover: '#1e40af',
        surfaceTint: '#eff6ff',
        inkColor: '#1e3a8a',
        logoText: 'PF',
        supportWhatsapp: '+923212223344',
      },
      created_at: now,
    },
    {
      id: PARTNER_IDS.LAHORE_LEGAL,
      name: 'Lahore Legal Suite',
      slug: 'lahore-legal',
      is_house: false,
      status: 'active',
      default_branding: {
        appName: 'VakilDesk Pro',
        appNameUr: 'وکیل ڈیسک پرو',
        tagline: 'Chambers & Litigation CRM',
        taglineUr: 'وکلاء اور لاء چیمبرز کا ڈیجیٹل نظام',
        primaryColor: '#7c2d12',
        primaryHover: '#6c240c',
        surfaceTint: '#fff7ed',
        inkColor: '#7c2d12',
        logoText: 'VD',
        supportWhatsapp: '+923334445566',
      },
      created_at: now,
    },
  ];

  const partner_domains: PartnerDomain[] = [
    {
      id: '40000000-0000-0000-0000-000000000001',
      partner_id: PARTNER_IDS.HOUSE,
      domain: 'app.taimoor.pk',
      verified: true,
      created_at: now,
    },
    {
      id: '40000000-0000-0000-0000-000000000002',
      partner_id: PARTNER_IDS.KARACHI_PROPTECH,
      domain: 'karachi-proptech.crm.pk',
      verified: true,
      created_at: now,
    },
    {
      id: '40000000-0000-0000-0000-000000000003',
      partner_id: PARTNER_IDS.LAHORE_LEGAL,
      domain: 'lahore-legal.crm.pk',
      verified: true,
      created_at: now,
    },
  ];

  const users: User[] = [
    {
      id: USER_IDS.OWNER,
      phone: '+923001112233',
      email: 'taimoor@alfaisalestate.pk',
      name: 'Taimoor Asif (تیمور آصف)',
      name_ur: 'تیمور آصف',
      locale: 'en',
      partner_admin_of: null,
      created_at: now,
    },
    {
      id: USER_IDS.MANAGER,
      phone: '+923212223344',
      email: 'huzaifa@alfaisalestate.pk',
      name: 'Huzaifa Raza (حذیفہ رضا)',
      name_ur: 'حذیفہ رضا',
      locale: 'en',
      partner_admin_of: null,
      created_at: now,
    },
    {
      id: USER_IDS.AGENT_1,
      phone: '+923334445566',
      email: 'saad@alfaisalestate.pk',
      name: 'Saad Malik (سعد ملک)',
      name_ur: 'سعد ملک',
      locale: 'ur',
      partner_admin_of: null,
      created_at: now,
    },
    {
      id: USER_IDS.AGENT_2,
      phone: '+923456667788',
      email: 'zainab@alfaisalestate.pk',
      name: 'Zainab Tariq (زینب طارق)',
      name_ur: 'زینب طارق',
      locale: 'en',
      partner_admin_of: null,
      created_at: now,
    },
    {
      id: USER_IDS.PARTNER_ADMIN,
      phone: '+923009998877',
      email: 'habib@karachiproptech.pk',
      name: 'Habib Siddiqui (حبیب صدیقی)',
      name_ur: 'حبیب صدیقی',
      locale: 'en',
      partner_admin_of: PARTNER_IDS.KARACHI_PROPTECH,
      created_at: now,
    },
    {
      id: USER_IDS.LAW_OWNER,
      phone: '+923008887766',
      email: 'kamran@razachambers.pk',
      name: 'Adv. Kamran Gillani (ایڈووکیٹ کامران گیلانی)',
      name_ur: 'ایڈووکیٹ کامران گیلانی',
      locale: 'ur',
      partner_admin_of: null,
      created_at: now,
    },
  ];

  const workspaceConfigs: {
    id: string;
    partner_id: string;
    name: string;
    name_ur: string;
    templateKey: TemplateKey;
    ownerId: string;
    branding: Partial<BrandingConfig>;
  }[] = [
    {
      id: WORKSPACE_IDS.REAL_ESTATE,
      partner_id: PARTNER_IDS.KARACHI_PROPTECH,
      name: 'Al-Faisal Estate & Builders',
      name_ur: 'الفیصل اسٹیٹ اینڈ بلڈرز',
      templateKey: 'real_estate',
      ownerId: USER_IDS.OWNER,
      branding: {
        appName: 'Al-Faisal PropFlow',
        appNameUr: 'الفیصل پراپ فلو',
        logoText: 'AF',
      },
    },
    {
      id: WORKSPACE_IDS.LAW,
      partner_id: PARTNER_IDS.LAHORE_LEGAL,
      name: 'Chambers of Raza & Associates',
      name_ur: 'چیمبرز آف رضا اینڈ ایسوسی ایٹس',
      templateKey: 'law',
      ownerId: USER_IDS.LAW_OWNER,
      branding: {
        appName: 'Raza VakilDesk',
        appNameUr: 'رضا وکیل ڈیسک',
        logoText: 'RC',
      },
    },
    {
      id: WORKSPACE_IDS.DISTRIBUTOR,
      partner_id: PARTNER_IDS.HOUSE,
      name: 'Madina FMCG Distribution',
      name_ur: 'مدینہ ایف ایم سی جی ڈسٹری بیوشن',
      templateKey: 'distributor',
      ownerId: USER_IDS.OWNER,
      branding: {
        appName: 'Madina Trade CRM',
        appNameUr: 'مدینہ ٹریڈ سی آر ایم',
        primaryColor: '#0f766e',
        primaryHover: '#115e59',
        surfaceTint: '#f0fdfa',
        logoText: 'MD',
      },
    },
    {
      id: WORKSPACE_IDS.CLINIC,
      partner_id: PARTNER_IDS.HOUSE,
      name: 'Clifton Aesthetics & Dental',
      name_ur: 'کلفٹن ایستھیٹکس اینڈ ڈینٹل',
      templateKey: 'clinic',
      ownerId: USER_IDS.OWNER,
      branding: {
        appName: 'Clifton Care CRM',
        appNameUr: 'کلفٹن کیئر سی آر ایم',
        primaryColor: '#0284c7',
        primaryHover: '#0369a1',
        surfaceTint: '#f0f9ff',
        logoText: 'CC',
      },
    },
    {
      id: WORKSPACE_IDS.GENERAL,
      partner_id: PARTNER_IDS.HOUSE,
      name: 'Indus Digital & Solar',
      name_ur: 'انڈس ڈیجیٹل اینڈ سولر',
      templateKey: 'general',
      ownerId: USER_IDS.OWNER,
      branding: {
        appName: 'Indus CRM',
        appNameUr: 'انڈس سی آر ایم',
        logoText: 'ID',
      },
    },
  ];

  const workspaces: Workspace[] = [];
  const memberships: Membership[] = [];
  const custom_field_defs: CustomFieldDef[] = [];
  const companies: Company[] = [];
  const contacts: Contact[] = [];
  const pipelines: Pipeline[] = [];
  const stages: Stage[] = [];
  const deals: Deal[] = [];
  const activities: Activity[] = [];
  const whatsapp_accounts: WhatsappAccount[] = [];
  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  const domain_events: DomainEvent[] = [];
  const audit_logs: AuditLog[] = [];

  for (const cfg of workspaceConfigs) {
    const tpl = LAUNCH_INDUSTRY_TEMPLATES.find((t) => t.key === cfg.templateKey)!;
    workspaces.push({
      id: cfg.id,
      partner_id: cfg.partner_id,
      name: cfg.name,
      name_ur: cfg.name_ur,
      industry_template_id: tpl.id,
      template_key: tpl.key,
      branding: cfg.branding,
      locale: 'en',
      timezone: 'Asia/Karachi',
      status: 'active',
      created_at: now,
    });

    memberships.push({
      id: crypto.randomUUID(),
      user_id: cfg.ownerId,
      workspace_id: cfg.id,
      role: 'owner',
      status: 'active',
      created_at: now,
    });

    if (cfg.id === WORKSPACE_IDS.REAL_ESTATE) {
      memberships.push(
        {
          id: crypto.randomUUID(),
          user_id: USER_IDS.MANAGER,
          workspace_id: cfg.id,
          role: 'manager',
          status: 'active',
          created_at: now,
        },
        {
          id: crypto.randomUUID(),
          user_id: USER_IDS.AGENT_1,
          workspace_id: cfg.id,
          role: 'agent',
          status: 'active',
          created_at: now,
        },
        {
          id: crypto.randomUUID(),
          user_id: USER_IDS.AGENT_2,
          workspace_id: cfg.id,
          role: 'agent',
          status: 'active',
          created_at: now,
        }
      );
    }

    // Clone custom fields from template
    tpl.definition.custom_fields.forEach((cf, idx) => {
      custom_field_defs.push({
        id: crypto.randomUUID(),
        workspace_id: cfg.id,
        entity: cf.entity,
        key: cf.key,
        label_en: cf.label_en,
        label_ur: cf.label_ur,
        type: cf.type,
        options: cf.options || [],
        required: cf.required,
        position: idx + 1,
        hidden: false,
        created_at: now,
      });
    });

    // Clone pipelines & stages from template
    const createdStages: Stage[] = [];
    let firstPipelineId = '';
    tpl.definition.pipelines.forEach((p, pIdx) => {
      const pId = crypto.randomUUID();
      if (pIdx === 0) firstPipelineId = pId;
      pipelines.push({
        id: pId,
        workspace_id: cfg.id,
        name: p.name,
        position: pIdx + 1,
        created_at: now,
      });
      p.stages.forEach((s, sIdx) => {
        const st: Stage = {
          id: crypto.randomUUID(),
          workspace_id: cfg.id,
          pipeline_id: pId,
          name: s.name,
          position: sIdx + 1,
          kind: s.kind,
        };
        stages.push(st);
        createdStages.push(st);
      });
    });

    // Seed company & WhatsApp account
    const compId = crypto.randomUUID();
    companies.push({
      id: compId,
      workspace_id: cfg.id,
      name: `${cfg.name} Partner Group`,
      phone: '+924235761200',
      custom: {},
      created_at: now,
    });

    whatsapp_accounts.push({
      id: crypto.randomUUID(),
      workspace_id: cfg.id,
      phone_number_id: `105900${workspaces.length}`,
      waba_id: `waba_pk_${workspaces.length}`,
      token_ref: `wa_tok_ref_ws_${workspaces.length}`,
      token_ciphertext: encryptSecret(`EAA_MOCK_META_TOKEN_${cfg.templateKey}`),
      status: 'connected',
      template_messages_sent: cfg.id === WORKSPACE_IDS.REAL_ESTATE ? 42 : 8,
      created_at: now,
    });

    // Clone sample contacts & deals
    tpl.definition.sample_contacts.forEach((sc, idx) => {
      const norm = normalizePhoneToE164(sc.phone);
      const contactId = crypto.randomUUID();
      // For Real Estate workspace, assign 1st contact to AGENT_1 and 2nd contact to AGENT_2 to showcase RLS agent isolation!
      const ownerId =
        cfg.id === WORKSPACE_IDS.REAL_ESTATE
          ? idx === 0
            ? USER_IDS.AGENT_1
            : USER_IDS.AGENT_2
          : cfg.ownerId;

      contacts.push({
        id: contactId,
        workspace_id: cfg.id,
        name: sc.name,
        phone_e164: norm.e164 || `+92300000000${idx}`,
        alt_phone: null,
        email: sc.email || null,
        company_id: idx === 0 ? compId : null,
        source: sc.source,
        owner_id: ownerId,
        status: sc.status,
        tags: sc.tags,
        custom: sc.custom,
        last_activity_at: now,
        updated_at: now,
        created_at: now,
        deleted_at: null,
      });

      activities.push({
        id: crypto.randomUUID(),
        workspace_id: cfg.id,
        contact_id: contactId,
        deal_id: null,
        type: 'system',
        actor_id: ownerId,
        body: `Contact imported from ${tpl.name_en} template`,
        meta: { template_key: tpl.key },
        created_at: now,
      });

      if (sc.deal && firstPipelineId && createdStages.length > 0) {
        const targetStage = createdStages[sc.deal.stage_index] || createdStages[0];
        const dealId = crypto.randomUUID();
        deals.push({
          id: dealId,
          workspace_id: cfg.id,
          pipeline_id: firstPipelineId,
          stage_id: targetStage.id,
          contact_id: contactId,
          title: sc.deal.title,
          value_pkr: sc.deal.value_pkr,
          owner_id: ownerId,
          expected_close: '2026-12-10',
          lost_reason: null,
          custom: sc.deal.custom,
          stage_entered_at: now,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        });

        activities.push({
          id: crypto.randomUUID(),
          workspace_id: cfg.id,
          contact_id: contactId,
          deal_id: dealId,
          type: 'stage_change',
          actor_id: ownerId,
          body: `Deal "${sc.deal.title}" placed in stage ${targetStage.name}`,
          meta: { stage_id: targetStage.id, stage_name: targetStage.name },
          created_at: now,
        });
      }

      if (idx === 0) {
        const convId = crypto.randomUUID();
        conversations.push({
          id: convId,
          workspace_id: cfg.id,
          contact_id: contactId,
          channel: 'whatsapp',
          assigned_to: ownerId,
          unread_count: 1,
          last_message_at: now,
        });
        messages.push({
          id: crypto.randomUUID(),
          workspace_id: cfg.id,
          conversation_id: convId,
          direction: 'inbound',
          type: 'text',
          body: 'Assalam-o-Alaikum, برائے مہربانی تفصیلات اور قیمت واٹس ایپ پر بھیج دیں۔',
          media_url: null,
          wa_message_id: `wamid.seed.${workspaces.length}`,
          status: 'received',
          sent_at: now,
        });
      }
    });
  }

  domain_events.push({
    id: crypto.randomUUID(),
    workspace_id: WORKSPACE_IDS.REAL_ESTATE,
    event_name: 'contact.created',
    payload: {
      source: 'Zameen.com',
      phone_e164: '+923004455667',
      template: 'real_estate',
    },
    emitted_at: now,
  });

  audit_logs.push({
    id: crypto.randomUUID(),
    workspace_id: WORKSPACE_IDS.REAL_ESTATE,
    actor_id: USER_IDS.OWNER,
    action: 'workspace.provisioned',
    entity_type: 'workspace',
    entity_id: WORKSPACE_IDS.REAL_ESTATE,
    meta: { template_key: 'real_estate', cloned_custom_fields: 5 },
    created_at: now,
  });

  return {
    partners,
    partner_domains,
    workspaces,
    users,
    memberships,
    industry_templates: LAUNCH_INDUSTRY_TEMPLATES,
    custom_field_defs,
    companies,
    contacts,
    pipelines,
    stages,
    deals,
    activities,
    whatsapp_accounts,
    conversations,
    messages,
    imports: [],
    domain_events,
    audit_logs,
    otp_challenges: [],
  };
}

export function getState(): DatabaseState {
  if (global._taimoorMemoryState) {
    return global._taimoorMemoryState;
  }
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as DatabaseState;
      if (parsed && Array.isArray(parsed.workspaces) && parsed.workspaces.length > 0) {
        global._taimoorMemoryState = parsed;
        return parsed;
      }
    }
  } catch {
    // Re-seed if cache file is unreadable
  }
  const seeded = buildSeedState();
  saveState(seeded);
  return seeded;
}

export function saveState(state: DatabaseState): void {
  global._taimoorMemoryState = state;
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state), 'utf8');
  } catch {
    // Ignore read-only fs errors in restricted runtimes
  }
}

export function resetSeedState(): DatabaseState {
  const fresh = buildSeedState();
  saveState(fresh);
  return fresh;
}

export function emitDomainEvent(
  state: DatabaseState,
  workspaceId: string,
  eventName: DomainEventName,
  payload: Record<string, unknown>
): DomainEvent {
  const evt: DomainEvent = {
    id: crypto.randomUUID(),
    workspace_id: workspaceId,
    event_name: eventName,
    payload,
    emitted_at: new Date().toISOString(),
  };
  state.domain_events.unshift(evt);
  if (state.domain_events.length > 200) {
    state.domain_events = state.domain_events.slice(0, 200);
  }
  return evt;
}

export function writeAuditLog(
  state: DatabaseState,
  entry: Omit<AuditLog, 'id' | 'created_at'>
): AuditLog {
  const log: AuditLog = {
    id: crypto.randomUUID(),
    ...entry,
    created_at: new Date().toISOString(),
  };
  state.audit_logs.unshift(log);
  if (state.audit_logs.length > 200) {
    state.audit_logs = state.audit_logs.slice(0, 200);
  }
  return log;
}

/**
 * Resolves white-label branding:
 * request host -> partner_domains -> partner default_branding -> overridden by workspace branding
 */
export function resolveBranding(
  state: DatabaseState,
  options: { host?: string | null; workspaceId?: string | null }
): {
  partner: Partner;
  workspace: Workspace | null;
  matched_domain: string | null;
  branding: BrandingConfig;
} {
  let workspace: Workspace | null = null;
  let partner: Partner | undefined;
  let matchedDomain: string | null = null;

  if (options.workspaceId) {
    workspace = state.workspaces.find((w) => w.id === options.workspaceId) || null;
    if (workspace) {
      partner = state.partners.find((p) => p.id === workspace!.partner_id);
    }
  }

  if (!partner && options.host) {
    const cleanHost = options.host.split(':')[0].toLowerCase().trim();
    const pd = state.partner_domains.find((d) => d.domain.toLowerCase() === cleanHost);
    if (pd) {
      matchedDomain = pd.domain;
      partner = state.partners.find((p) => p.id === pd.partner_id);
    }
  }

  if (!partner) {
    partner = state.partners.find((p) => p.is_house) || state.partners[0];
  }

  const branding: BrandingConfig = {
    ...partner.default_branding,
    ...(workspace?.branding || {}),
  };

  return { partner, workspace, matched_domain: matchedDomain, branding };
}

/**
 * Syncs core records into Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are configured.
 * Non-blocking best-effort mirror so preview continues smoothly even if schema hasn't been applied yet.
 */
export async function syncToSupabaseIfConfigured(
  table: string,
  row: Record<string, unknown>
): Promise<{ synced: boolean; error?: string }> {
  const client = getSupabaseAdmin();
  if (!client) return { synced: false };
  try {
    const { error } = await client.from(table).upsert(row);
    if (error) {
      return { synced: false, error: error.message };
    }
    return { synced: true };
  } catch (err: unknown) {
    return { synced: false, error: err instanceof Error ? err.message : 'Supabase sync failed' };
  }
}
