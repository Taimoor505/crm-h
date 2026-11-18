import {
  Activity,
  AuditLog,
  BrandingConfig,
  Contact,
  Conversation,
  CustomFieldDef,
  Deal,
  DomainEvent,
  ImportJob,
  IndustryTemplate,
  Membership,
  Message,
  Partner,
  PartnerDomain,
  Pipeline,
  Stage,
  User,
  Workspace,
} from '@/lib/taimoor/types';
import { EndpointCatalogItem } from '@/lib/taimoor/openapi';
import { SchemaTableDoc } from '@/lib/taimoor/sql-pack';

export type WorkbenchTab =
  | 'openapi'
  | 'schema_rls'
  | 'templates'
  | 'import_export'
  | 'whatsapp_events';

export type UiLang = 'en' | 'ur';

export interface InspectorPayload {
  db_status: {
    mode: 'supabase' | 'sandbox_relational';
    supabaseConfigured: boolean;
    directPgConfigured: boolean;
  };
  partners: Partner[];
  partner_domains: PartnerDomain[];
  workspaces: Workspace[];
  users: User[];
  memberships: Membership[];
  industry_templates: IndustryTemplate[];
  schema_tables: SchemaTableDoc[];
  migration_snippets: {
    id: string;
    title: string;
    summary: string;
    sql: string;
  }[];
  endpoints: EndpointCatalogItem[];
  active_workspace_snapshot: {
    workspace_id: string;
    custom_fields: CustomFieldDef[];
    pipelines: Pipeline[];
    stages: Stage[];
    contacts: Contact[];
    deals: Deal[];
    conversations: (Conversation & {
      contact: Contact | null;
      messages: Message[];
    })[];
    whatsapp_accounts: {
      id: string;
      workspace_id: string;
      phone_number_id: string;
      waba_id: string;
      token_ref: string;
      token_encrypted_preview: string;
      status: string;
      template_messages_sent: number;
    }[];
    imports: ImportJob[];
    activities: Activity[];
  };
  domain_events: DomainEvent[];
  audit_logs: AuditLog[];
}

export interface ResolvedBrandingResponse {
  partner: { id: string; name: string; slug: string; is_house: boolean };
  workspace: {
    id: string;
    name: string;
    name_ur?: string;
    template_key: string;
    locale: 'en' | 'ur';
  } | null;
  matched_domain: string | null;
  branding: BrandingConfig;
}

export const UI_COPY = {
  en: {
    tabs: {
      openapi: 'OpenAPI Explorer',
      schema_rls: 'Schema & RLS Lab',
      templates: 'Templates & Fields',
      import_export: 'Phone & Import/Export',
      whatsapp_events: 'WhatsApp & Events',
    },
    workspaceLabel: 'Active Workspace',
    actorLabel: 'Sandbox Actor & Role',
    downloadSpec: 'Download OpenAPI',
    persistenceSupabase: 'Supabase Live',
    persistenceSandbox: 'Relational Sandbox',
    sendRequest: 'Send Request',
    running: 'Running...',
    resetSeed: 'Reset Seed Data',
  },
  ur: {
    tabs: {
      openapi: 'اوپن اے پی آئی ایکسپلورر',
      schema_rls: 'اسکیما اور آر ایل ایس لیب',
      templates: 'ٹیمپلیٹس اور کسٹم فیلڈز',
      import_export: 'فون اور امپورٹ/ایکسپورٹ',
      whatsapp_events: 'واٹس ایپ اور ایونٹس',
    },
    workspaceLabel: 'فعال ورک اسپیس',
    actorLabel: 'ایکٹر اور رول سیاق و سباق',
    downloadSpec: 'اوپن اے پی آئی ڈاؤن لوڈ',
    persistenceSupabase: 'سپابیس لائیو',
    persistenceSandbox: 'ریلیشنل سینڈ باکس',
    sendRequest: 'ریکویسٹ بھیجیں',
    running: 'جاری ہے...',
    resetSeed: 'سیمپل ڈیٹا ری سیٹ',
  },
} as const;
