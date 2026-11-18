export type Role = 'owner' | 'manager' | 'agent';
export type MembershipStatus = 'active' | 'invited' | 'suspended';
export type PartnerStatus = 'active' | 'suspended';
export type TemplateKey = 'real_estate' | 'law' | 'distributor' | 'clinic' | 'general';
export type CustomFieldEntity = 'contact' | 'deal';
export type CustomFieldType = 'text' | 'number' | 'money' | 'date' | 'select' | 'phone';
export type StageKind = 'open' | 'won' | 'lost';
export type ActivityType =
  | 'note'
  | 'call'
  | 'whatsapp'
  | 'stage_change'
  | 'assignment'
  | 'task'
  | 'system';

export type DomainEventName =
  | 'contact.created'
  | 'contact.updated'
  | 'deal.created'
  | 'deal.stage_changed'
  | 'deal.won'
  | 'deal.lost'
  | 'message.received'
  | 'call.logged';

export interface BrandingConfig {
  appName: string;
  appNameUr: string;
  tagline: string;
  taglineUr: string;
  primaryColor: string;
  primaryHover: string;
  surfaceTint: string;
  inkColor: string;
  logoText: string;
  supportWhatsapp?: string;
}

export interface Partner {
  id: string;
  name: string;
  slug: string;
  is_house: boolean;
  status: PartnerStatus;
  default_branding: BrandingConfig;
  created_at: string;
}

export interface PartnerDomain {
  id: string;
  partner_id: string;
  domain: string;
  verified: boolean;
  created_at: string;
}

export interface Workspace {
  id: string;
  partner_id: string;
  name: string;
  name_ur?: string;
  industry_template_id: string;
  template_key: TemplateKey;
  branding: Partial<BrandingConfig>;
  locale: 'en' | 'ur';
  timezone: string;
  status: 'active' | 'suspended';
  created_at: string;
}

export interface User {
  id: string;
  phone: string;
  email: string;
  name: string;
  name_ur?: string;
  locale: 'en' | 'ur';
  partner_admin_of?: string | null;
  created_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  workspace_id: string;
  role: Role;
  status: MembershipStatus;
  created_at: string;
}

export interface TemplatePipelineDef {
  name: string;
  name_ur: string;
  stages: {
    name: string;
    name_ur: string;
    kind: StageKind;
  }[];
}

export interface TemplateCustomFieldDef {
  entity: CustomFieldEntity;
  key: string;
  label_en: string;
  label_ur: string;
  type: CustomFieldType;
  options?: string[];
  required: boolean;
}

export interface IndustryTemplateDefinition {
  pipelines: TemplatePipelineDef[];
  custom_fields: TemplateCustomFieldDef[];
  sample_contacts: {
    name: string;
    phone: string;
    email?: string;
    source: string;
    status: string;
    tags: string[];
    custom: Record<string, unknown>;
    deal?: {
      title: string;
      value_pkr: number;
      stage_index: number;
      custom: Record<string, unknown>;
    };
  }[];
}

export interface IndustryTemplate {
  id: string;
  key: TemplateKey;
  name_en: string;
  name_ur: string;
  description_en: string;
  description_ur: string;
  definition: IndustryTemplateDefinition;
}

export interface CustomFieldDef {
  id: string;
  workspace_id: string;
  entity: CustomFieldEntity;
  key: string;
  label_en: string;
  label_ur: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  position: number;
  hidden: boolean;
  created_at: string;
}

export interface Company {
  id: string;
  workspace_id: string;
  name: string;
  phone: string | null;
  custom: Record<string, unknown>;
  created_at: string;
}

export interface Contact {
  id: string;
  workspace_id: string;
  name: string;
  phone_e164: string;
  alt_phone: string | null;
  email: string | null;
  company_id: string | null;
  source: string;
  owner_id: string;
  status: string;
  tags: string[];
  custom: Record<string, unknown>;
  last_activity_at: string;
  updated_at: string;
  created_at: string;
  deleted_at: string | null;
}

export interface Pipeline {
  id: string;
  workspace_id: string;
  name: string;
  position: number;
  created_at: string;
}

export interface Stage {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  name: string;
  position: number;
  kind: StageKind;
}

export interface Deal {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string;
  title: string;
  value_pkr: number;
  owner_id: string;
  expected_close: string | null;
  lost_reason: string | null;
  custom: Record<string, unknown>;
  stage_entered_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Activity {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  deal_id: string | null;
  type: ActivityType;
  actor_id: string | null;
  body: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface WhatsappAccount {
  id: string;
  workspace_id: string;
  phone_number_id: string;
  waba_id: string;
  token_ref: string;
  token_ciphertext: string;
  status: 'connected' | 'pending' | 'disconnected';
  template_messages_sent: number;
  created_at: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  contact_id: string;
  channel: 'whatsapp';
  assigned_to: string | null;
  unread_count: number;
  last_message_at: string;
}

export interface Message {
  id: string;
  workspace_id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'template' | 'image' | 'audio' | 'document';
  body: string;
  media_url: string | null;
  wa_message_id: string | null;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'received' | 'failed';
  sent_at: string;
}

export interface ImportJob {
  id: string;
  workspace_id: string;
  file_url: string;
  file_name: string;
  duplicate_strategy: 'skip' | 'update';
  mapping: Record<string, string>;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  rows_ok: number;
  rows_failed: number;
  error_report_url: string | null;
  errors: { row: number; phone?: string; reason: string }[];
  created_at: string;
}

export interface DomainEvent {
  id: string;
  workspace_id: string;
  event_name: DomainEventName;
  payload: Record<string, unknown>;
  emitted_at: string;
}

export interface AuditLog {
  id: string;
  workspace_id: string | null;
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface OtpChallenge {
  id: string;
  phone_e164: string;
  code: string;
  expires_at: string;
  verified: boolean;
}

export interface DatabaseState {
  partners: Partner[];
  partner_domains: PartnerDomain[];
  workspaces: Workspace[];
  users: User[];
  memberships: Membership[];
  industry_templates: IndustryTemplate[];
  custom_field_defs: CustomFieldDef[];
  companies: Company[];
  contacts: Contact[];
  pipelines: Pipeline[];
  stages: Stage[];
  deals: Deal[];
  activities: Activity[];
  whatsapp_accounts: WhatsappAccount[];
  conversations: Conversation[];
  messages: Message[];
  imports: ImportJob[];
  domain_events: DomainEvent[];
  audit_logs: AuditLog[];
  otp_challenges: OtpChallenge[];
}
