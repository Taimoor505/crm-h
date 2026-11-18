/**
 * The frontend's data model. Endpoint functions in lib/api/endpoints adapt
 * backend responses into these shapes, so a backend shape change touches
 * only the adapter. See docs/frontend-endpoint-map.md.
 */
import type { Money, RegionSettings } from '@/lib/format';

export type { Money, RegionSettings };

// ------------------------------------------------------------- identity

export type WorkspaceRole = 'owner' | 'manager' | 'agent';
export type Role = WorkspaceRole | 'partner_admin' | 'super_admin';

export interface User {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  partner_admin_of: string | null;
  is_super_admin: boolean;
}

export interface Membership {
  id: string;
  user_id: string;
  workspace_id: string;
  role: WorkspaceRole;
  status: 'active' | 'invited' | 'suspended';
  workspace_name: string | null;
}

export type WorkspaceStatus = 'active' | 'trialing' | 'read_only' | 'archived' | 'suspended';

export interface Workspace {
  id: string;
  partner_id: string;
  name: string;
  template_key: string;
  status: WorkspaceStatus;
  timezone: string;
  created_at: string;
}

export interface Me {
  user: User;
  workspace: Workspace | null;
  role: Role;
  memberships: Membership[];
}

// ------------------------------------------------------------- branding

export type ModuleKey = 'home' | 'leads' | 'pipeline' | 'follow_ups' | 'inbox' | 'reports';

export interface Branding {
  appName: string;
  tagline: string;
  primaryColor: string;
  accentColor: string | null;
  logoText: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  supportWhatsapp: string | null;
  supportEmail: string | null;
  hideModules: ModuleKey[];
}

export interface ResolvedBranding {
  partner: { id: string; name: string; slug: string; is_house: boolean };
  workspace_id: string | null;
  matched_domain: string | null;
  branding: Branding;
}

export interface WorkspaceSettings extends RegionSettings {
  name: string;
  branding: Partial<Branding>;
}

// ------------------------------------------------------------- templates

export type CustomFieldType = 'text' | 'number' | 'money' | 'date' | 'select' | 'phone' | 'area';

export interface Template {
  key: string;
  name: string;
  description: string;
  pipelines: { name: string; stages: { name: string; kind: StageKind }[] }[];
  custom_fields: { entity: 'contact' | 'deal'; key: string; label: string; type: CustomFieldType; options?: string[] }[];
}

// ------------------------------------------------------------- CRM data

export interface Contact {
  id: string;
  name: string;
  phone_e164: string;
  alt_phone: string | null;
  email: string | null;
  source: string;
  owner_id: string | null;
  status: string;
  tags: string[];
  custom: Record<string, unknown>;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
  total?: number;
}

export type StageKind = 'open' | 'won' | 'lost';

export interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  kind: StageKind;
}

export interface Pipeline {
  id: string;
  name: string;
  position: number;
  stages: Stage[];
}

export interface Deal {
  id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string;
  title: string;
  value: Money | null;
  owner_id: string | null;
  expected_close: string | null;
  lost_reason: string | null;
  won_reason: string | null;
  custom: Record<string, unknown>;
  stage_entered_at: string;
  next_task_due_at: string | null;
  /** TODO(backend): not joined by the sandbox deals list yet. */
  contact: { id: string; name: string; phone_e164: string } | null;
  created_at: string;
  updated_at: string;
}

export type ActivityType = 'note' | 'call' | 'whatsapp' | 'stage_change' | 'assignment' | 'task' | 'system';

export interface Activity {
  id: string;
  contact_id: string | null;
  deal_id: string | null;
  type: ActivityType;
  actor_id: string | null;
  body: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface CustomFieldDef {
  id: string;
  entity: 'contact' | 'deal';
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  required: boolean;
  position: number;
  hidden: boolean;
}

export interface TeamMember {
  membership_id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: WorkspaceRole;
  status: 'active' | 'invited' | 'suspended';
}

export interface DuplicateCheck {
  normalized_e164: string | null;
  duplicate: { id: string; name: string; phone_e164: string; owner_id: string | null } | null;
}

export type CallOutcome = 'answered' | 'no_answer' | 'busy' | 'wrong_number';

// ------------------------------------------------------------- tasks (follow-ups)

export type TaskType = 'call' | 'whatsapp' | 'meeting' | 'site_visit' | 'other';
export type TaskBucket = 'today' | 'overdue' | 'upcoming';

export interface Task {
  id: string;
  contact_id: string | null;
  deal_id: string | null;
  assigned_to: string;
  type: TaskType;
  title: string;
  notes: string | null;
  due_at: string;
  status: 'open' | 'done' | 'cancelled';
  completed_at: string | null;
  outcome: string | null;
  is_overdue: boolean;
  contact: { id: string; name: string | null; phone_e164: string | null } | null;
}

export interface FollowUpInput {
  type?: TaskType;
  due_at: string;
  title?: string;
  notes?: string;
  assigned_to?: string;
}

// ------------------------------------------------------------- home

export interface HomeSummary {
  scope: 'me' | 'team';
  timezone: string;
  me: { user_id: string; role: string; available: boolean };
  tasks: { overdue: number; due_today: number; upcoming: number; next: Task[] };
  leads: {
    new_today: number;
    awaiting_first_response: number;
    unassigned: number | null;
    recent: {
      id: string;
      name: string | null;
      phone_e164: string;
      source: string;
      owner_id: string | null;
      last_enquiry_at: string;
      awaiting_response: boolean;
    }[];
  };
  speed_to_lead_today: { median_seconds: number | null; responded: number };
  notifications: { unread: number };
}

// ------------------------------------------------------------- notifications

export interface AppNotification {
  id: string;
  type: string;
  priority: 'normal' | 'urgent';
  title: string;
  body: string | null;
  data: { contact_id?: string; task_id?: string; deal_id?: string; [k: string]: unknown };
  read_at: string | null;
  created_at: string;
}

export interface NotificationSettings {
  events: { type: string; label: string; in_app: true; push: boolean; whatsapp: boolean }[];
  quiet_hours: boolean;
  quiet_hours_window: string;
  whatsapp_number: string | null;
  whatsapp_number_effective: string | null;
  push: { vapid_public_key: string | null; devices: number };
}

// ------------------------------------------------------------- inbox

export interface Conversation {
  id: string;
  contact_id: string;
  assigned_to: string | null;
  unread_count: number;
  last_message_at: string;
  contact: { id: string; name: string; phone_e164: string } | null;
  last_message: Message | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  type: 'text' | 'template' | 'image' | 'audio' | 'document';
  body: string;
  status: string;
  sent_at: string;
}

export interface SavedReply {
  id: string;
  title: string;
  body: string;
}

export interface WhatsAppTemplate {
  name: string;
  language: string;
  body: string;
  params: number;
}

// ------------------------------------------------------------- reports

export interface ReportFilters {
  from?: string;
  to?: string;
  pipeline_id?: string;
  source?: string;
  agent_id?: string;
}

export interface SourcesReport {
  from: string;
  to: string;
  total: number;
  by_source: { source: string; leads: number; new: number; reenquiries: number }[];
  by_day: { day: string; source: string; leads: number }[];
}

export interface SpeedRow {
  agent_id?: string | null;
  agent_name?: string | null;
  leads: number;
  responded: number;
  median_seconds: number | null;
  p90_seconds: number | null;
  within_5_min: number;
  within_1_hour: number;
  response_rate_pct: number | null;
}

export interface SpeedToLeadReport {
  from: string;
  to: string;
  overall: SpeedRow | null;
  by_agent: SpeedRow[];
}

export interface FunnelReport {
  from: string;
  to: string;
  pipeline: { id: string; name: string };
  deals: number;
  won: number;
  lost: number;
  open: number;
  win_rate_pct: number | null;
  stages: { id: string; name: string; kind: StageKind; position: number; reached: number; current: number; conversion_from_previous_pct: number | null }[];
}

export interface AgentsReport {
  from: string;
  to: string;
  agents: {
    agent_id: string;
    agent_name: string | null;
    role: string;
    assigned: number;
    contacted: number;
    follow_ups_done: number;
    overdue: number;
    deals_won: number;
    won_value: Money;
  }[];
}

export interface WonValueReport {
  from: string;
  to: string;
  total: Money;
  total_deals: number;
  months: { month: string; deals: number; value: Money }[];
}

export interface LostReasonsReport {
  from: string;
  to: string;
  total_deals: number;
  reasons: { reason: string; deals: number; value: Money; share_pct: number | null }[];
}

// ------------------------------------------------------------- settings

export interface LeadSource {
  id: string;
  type: 'website_form' | 'webhook' | 'meta_leadgen' | 'whatsapp' | 'manual' | 'import';
  name: string;
  source_label: string;
  public_key: string;
  is_active: boolean;
  endpoint_url: string | null;
  embed_snippet: string | null;
  settings: { allowed_origins?: string[]; redirect_url?: string; default_tags?: string[] };
  created_at: string;
  secret?: string;
}

export interface AssignmentRules {
  mode: 'manual' | 'round_robin' | 'by_source';
  agent_ids: string[];
  source_map: Record<string, string[]>;
  fallback: 'round_robin' | 'unassigned';
  reassign_after_minutes: number | null;
  max_auto_reassigns: number;
  members: { user_id: string; name: string | null; role: WorkspaceRole; available: boolean }[];
}

export interface JsonSchema {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  format?: string;
  items?: JsonSchema;
  'x-widget'?: string;
}

export interface Automation {
  key: string;
  name: string;
  description: string;
  triggers: string[];
  enabled: boolean;
  settings: Record<string, unknown>;
  settings_schema: JsonSchema;
  last_run_at: string | null;
  runs_7d: number;
  failed_7d: number;
}

export interface ImportJob {
  id: string;
  file_name: string;
  duplicate_strategy: 'skip' | 'update';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  rows_ok: number;
  rows_failed: number;
  errors: { row: number; phone?: string; reason: string }[];
  created_at: string;
}

export interface ReasonPresets {
  won: string[];
  lost: string[];
}

// ------------------------------------------------------------- billing

export interface Invoice {
  id: string;
  number: string;
  period_start: string;
  issue_date: string;
  due_date: string;
  status: string;
  total: Money;
  paid: Money;
}

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: Money | null;
}

export interface Subscription {
  plan: { id: string; name: string } | null;
  status: string;
  trial_ends_at: string | null;
  pending_plan: { id: string; name: string } | null;
  pending_plan_effective: string | null;
  workspaces: { id: string; name: string; status: string }[];
  outstanding: Money | null;
  overdue_invoices: number;
}

export interface PartnerWorkspace {
  id: string;
  name: string;
  template_key: string;
  status: string;
  country: string | null;
  plan: string | null;
  seats: number | null;
  created_at: string;
}

export interface PartnerDomain {
  id: string;
  domain: string;
  verified: boolean;
  dns: { type: string; name: string; value: string } | null;
}

export interface CommissionStatement {
  month: string;
  applies: boolean;
  rate: number;
  workspaces: { workspace_id: string; workspace_name: string; collected: Money; commission: Money; floor_applied: boolean; status: string }[];
  total_commission: Money | null;
}
