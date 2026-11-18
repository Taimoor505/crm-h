export interface SchemaColumnDoc {
  name: string;
  type: string;
  nullable: boolean;
  key?: 'PK' | 'FK' | 'UNIQUE' | 'GIN';
  references?: string;
  note: string;
}

export interface SchemaTableDoc {
  name: string;
  domain: 'Multi-Tenancy' | 'Templates & Fields' | 'CRM Core' | 'WhatsApp' | 'Governance';
  rlsEnabled: boolean;
  rlsSummary: string;
  indexes: string[];
  columns: SchemaColumnDoc[];
}

export const CORE_SCHEMA_TABLES: SchemaTableDoc[] = [
  {
    name: 'partners',
    domain: 'Multi-Tenancy',
    rlsEnabled: false,
    rlsSummary: 'Top-level white-label resellers + built-in House partner.',
    indexes: ['UNIQUE(slug)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Primary identifier' },
      { name: 'name', type: 'text', nullable: false, note: 'Partner display name' },
      { name: 'slug', type: 'text', nullable: false, key: 'UNIQUE', note: 'URL-safe slug' },
      { name: 'is_house', type: 'boolean', nullable: false, note: 'True for direct Taimoor customers' },
      { name: 'status', type: 'text', nullable: false, note: 'active | suspended' },
      { name: 'default_branding', type: 'jsonb', nullable: false, note: 'Default logo, colors, EN/UR names' },
    ],
  },
  {
    name: 'partner_domains',
    domain: 'Multi-Tenancy',
    rlsEnabled: false,
    rlsSummary: 'Maps incoming request Host header to white-label partner branding.',
    indexes: ['UNIQUE(domain)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Primary identifier' },
      { name: 'partner_id', type: 'uuid', nullable: false, key: 'FK', references: 'partners.id', note: 'Owning partner' },
      { name: 'domain', type: 'text', nullable: false, key: 'UNIQUE', note: 'Custom domain host' },
      { name: 'verified', type: 'boolean', nullable: false, note: 'DNS CNAME/TXT verified' },
    ],
  },
  {
    name: 'workspaces',
    domain: 'Multi-Tenancy',
    rlsEnabled: true,
    rlsSummary: 'SELECT restricted to active members OR owning partner_admin_of.',
    indexes: ['idx_workspaces_partner'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Tenant boundary key' },
      { name: 'partner_id', type: 'uuid', nullable: false, key: 'FK', references: 'partners.id', note: 'Parent partner' },
      { name: 'name', type: 'text', nullable: false, note: 'Client business name' },
      { name: 'industry_template_id', type: 'uuid', nullable: true, key: 'FK', references: 'industry_templates.id', note: 'Source template' },
      { name: 'branding', type: 'jsonb', nullable: false, note: 'Workspace branding overrides' },
      { name: 'locale', type: 'text', nullable: false, note: 'en | ur' },
      { name: 'timezone', type: 'text', nullable: false, note: 'Default Asia/Karachi' },
      { name: 'status', type: 'text', nullable: false, note: 'active | suspended' },
    ],
  },
  {
    name: 'users',
    domain: 'Multi-Tenancy',
    rlsEnabled: false,
    rlsSummary: 'Global user directory indexed by normalized E.164 phone.',
    indexes: ['UNIQUE(phone)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'User UUID' },
      { name: 'phone', type: 'text', nullable: false, key: 'UNIQUE', note: 'E.164 +923XXXXXXXXX' },
      { name: 'email', type: 'text', nullable: false, note: 'Email address' },
      { name: 'name', type: 'text', nullable: false, note: 'Full name (EN/UR)' },
      { name: 'locale', type: 'text', nullable: false, note: 'en | ur' },
      { name: 'partner_admin_of', type: 'uuid', nullable: true, key: 'FK', references: 'partners.id', note: 'Partner support scope' },
    ],
  },
  {
    name: 'memberships',
    domain: 'Multi-Tenancy',
    rlsEnabled: true,
    rlsSummary: 'Visible only within workspaces the actor belongs to.',
    indexes: ['UNIQUE(user_id, workspace_id)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Membership UUID' },
      { name: 'user_id', type: 'uuid', nullable: false, key: 'FK', references: 'users.id', note: 'Member user' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'role', type: 'text', nullable: false, note: 'owner | manager | agent' },
      { name: 'status', type: 'text', nullable: false, note: 'active | invited | suspended' },
    ],
  },
  {
    name: 'industry_templates',
    domain: 'Templates & Fields',
    rlsEnabled: false,
    rlsSummary: 'Catalog of 5 launch JSON templates cloned on workspace creation.',
    indexes: ['UNIQUE(key)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Template UUID' },
      { name: 'key', type: 'text', nullable: false, key: 'UNIQUE', note: 'real_estate | law | distributor | clinic | general' },
      { name: 'name_en', type: 'text', nullable: false, note: 'English template title' },
      { name: 'name_ur', type: 'text', nullable: false, note: 'Urdu template title' },
      { name: 'definition', type: 'jsonb', nullable: false, note: 'Pipelines, stages, custom fields, sample data' },
    ],
  },
  {
    name: 'custom_field_defs',
    domain: 'Templates & Fields',
    rlsEnabled: true,
    rlsSummary: 'Workspace-owned copy of field definitions validated on every write.',
    indexes: ['UNIQUE(workspace_id, entity, key)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Field definition UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'entity', type: 'text', nullable: false, note: 'contact | deal' },
      { name: 'key', type: 'text', nullable: false, note: 'JSONB property key' },
      { name: 'label_en', type: 'text', nullable: false, note: 'English label' },
      { name: 'label_ur', type: 'text', nullable: false, note: 'Urdu label' },
      { name: 'type', type: 'text', nullable: false, note: 'text | number | money | date | select | phone' },
      { name: 'options', type: 'jsonb', nullable: false, note: 'Allowed select options' },
      { name: 'required', type: 'boolean', nullable: false, note: 'Validation enforcement flag' },
      { name: 'position', type: 'integer', nullable: false, note: 'Display order' },
      { name: 'hidden', type: 'boolean', nullable: false, note: 'Soft-hide toggle' },
    ],
  },
  {
    name: 'companies',
    domain: 'CRM Core',
    rlsEnabled: true,
    rlsSummary: 'Workspace-isolated B2B organizations.',
    indexes: ['GIN(custom)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Company UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'name', type: 'text', nullable: false, note: 'Company name (EN/UR)' },
      { name: 'phone', type: 'text', nullable: true, note: 'Normalized E.164 phone' },
      { name: 'custom', type: 'jsonb', nullable: false, key: 'GIN', note: 'Custom attributes' },
    ],
  },
  {
    name: 'contacts',
    domain: 'CRM Core',
    rlsEnabled: true,
    rlsSummary: 'Agents see only owner_id = current_user_id; Managers/Owners see entire workspace; 30-day soft delete.',
    indexes: ['UNIQUE(workspace_id, phone_e164) WHERE deleted_at IS NULL', 'GIN(custom)', 'GIN(tags)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Contact UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'name', type: 'text', nullable: false, note: 'Lead/contact name (supports Urdu)' },
      { name: 'phone_e164', type: 'text', nullable: false, key: 'UNIQUE', note: 'Normalized +923XXXXXXXXX' },
      { name: 'alt_phone', type: 'text', nullable: true, note: 'Secondary E.164 phone' },
      { name: 'email', type: 'text', nullable: true, note: 'Email address' },
      { name: 'company_id', type: 'uuid', nullable: true, key: 'FK', references: 'companies.id', note: 'Linked company' },
      { name: 'source', type: 'text', nullable: false, note: 'Lead acquisition source' },
      { name: 'owner_id', type: 'uuid', nullable: false, key: 'FK', references: 'users.id', note: 'Assigned agent/owner' },
      { name: 'status', type: 'text', nullable: false, note: 'Lead lifecycle status' },
      { name: 'tags', type: 'text[]', nullable: false, key: 'GIN', note: 'Indexed tag array' },
      { name: 'custom', type: 'jsonb', nullable: false, key: 'GIN', note: 'Validated custom fields' },
      { name: 'last_activity_at', type: 'timestamptz', nullable: false, note: 'Latest activity timestamp' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true, note: '30-day soft-delete marker' },
    ],
  },
  {
    name: 'pipelines',
    domain: 'CRM Core',
    rlsEnabled: true,
    rlsSummary: 'Workspace-scoped sales/matter pipelines.',
    indexes: ['(workspace_id, position)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Pipeline UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'name', type: 'text', nullable: false, note: 'Pipeline title' },
      { name: 'position', type: 'integer', nullable: false, note: 'Sort order' },
    ],
  },
  {
    name: 'stages',
    domain: 'CRM Core',
    rlsEnabled: true,
    rlsSummary: 'Ordered pipeline stages categorized as open, won, or lost.',
    indexes: ['(pipeline_id, position)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Stage UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'pipeline_id', type: 'uuid', nullable: false, key: 'FK', references: 'pipelines.id', note: 'Parent pipeline' },
      { name: 'name', type: 'text', nullable: false, note: 'Stage label' },
      { name: 'position', type: 'integer', nullable: false, note: 'Stage sequence' },
      { name: 'kind', type: 'text', nullable: false, note: 'open | won | lost' },
    ],
  },
  {
    name: 'deals',
    domain: 'CRM Core',
    rlsEnabled: true,
    rlsSummary: 'Agents restricted to owner_id; emits deal.created/stage_changed/won/lost events.',
    indexes: ['(workspace_id, pipeline_id, stage_id)', 'GIN(custom)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Deal UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'pipeline_id', type: 'uuid', nullable: false, key: 'FK', references: 'pipelines.id', note: 'Pipeline' },
      { name: 'stage_id', type: 'uuid', nullable: false, key: 'FK', references: 'stages.id', note: 'Current stage' },
      { name: 'contact_id', type: 'uuid', nullable: false, key: 'FK', references: 'contacts.id', note: 'Primary contact' },
      { name: 'title', type: 'text', nullable: false, note: 'Deal title' },
      { name: 'value_pkr', type: 'bigint', nullable: false, note: 'Monetary value in PKR' },
      { name: 'owner_id', type: 'uuid', nullable: false, key: 'FK', references: 'users.id', note: 'Deal owner' },
      { name: 'expected_close', type: 'date', nullable: true, note: 'Target close date' },
      { name: 'lost_reason', type: 'text', nullable: true, note: 'Reason when kind=lost' },
      { name: 'custom', type: 'jsonb', nullable: false, key: 'GIN', note: 'Validated deal fields' },
      { name: 'stage_entered_at', type: 'timestamptz', nullable: false, note: 'Stage SLA timestamp' },
      { name: 'deleted_at', type: 'timestamptz', nullable: true, note: '30-day soft delete' },
    ],
  },
  {
    name: 'activities',
    domain: 'CRM Core',
    rlsEnabled: true,
    rlsSummary: 'Immutable workspace timeline written automatically on every relevant mutation.',
    indexes: ['(workspace_id, contact_id, created_at DESC)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Activity UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'contact_id', type: 'uuid', nullable: true, key: 'FK', references: 'contacts.id', note: 'Linked contact' },
      { name: 'deal_id', type: 'uuid', nullable: true, key: 'FK', references: 'deals.id', note: 'Linked deal' },
      { name: 'type', type: 'text', nullable: false, note: 'note | call | whatsapp | stage_change | assignment | task | system' },
      { name: 'actor_id', type: 'uuid', nullable: true, key: 'FK', references: 'users.id', note: 'Acting user' },
      { name: 'body', type: 'text', nullable: false, note: 'Human-readable summary (EN/UR)' },
      { name: 'meta', type: 'jsonb', nullable: false, note: 'Structured call/stage metadata' },
      { name: 'created_at', type: 'timestamptz', nullable: false, note: 'Event timestamp' },
    ],
  },
  {
    name: 'whatsapp_accounts',
    domain: 'WhatsApp',
    rlsEnabled: true,
    rlsSummary: 'Managers/Owners only; stores AES-256-GCM encrypted access token and metered template counter.',
    indexes: ['(workspace_id)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Account UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'phone_number_id', type: 'text', nullable: false, note: 'Meta Graph phone_number_id' },
      { name: 'waba_id', type: 'text', nullable: false, note: 'WhatsApp Business Account ID' },
      { name: 'token_ref', type: 'text', nullable: false, note: 'Masked reference ID' },
      { name: 'token_ciphertext', type: 'text', nullable: false, note: 'AES-256-GCM encrypted token' },
      { name: 'status', type: 'text', nullable: false, note: 'connected | pending | disconnected' },
      { name: 'template_messages_sent', type: 'integer', nullable: false, note: 'Pass-through billing meter' },
    ],
  },
  {
    name: 'conversations',
    domain: 'WhatsApp',
    rlsEnabled: true,
    rlsSummary: 'Threaded by workspace + contact phone; agents restricted to assigned_to.',
    indexes: ['UNIQUE(workspace_id, contact_id, channel)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Conversation UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'contact_id', type: 'uuid', nullable: false, key: 'FK', references: 'contacts.id', note: 'Contact thread' },
      { name: 'channel', type: 'text', nullable: false, note: 'whatsapp' },
      { name: 'assigned_to', type: 'uuid', nullable: true, key: 'FK', references: 'users.id', note: 'Assigned agent' },
      { name: 'unread_count', type: 'integer', nullable: false, note: 'Unread inbound count' },
      { name: 'last_message_at', type: 'timestamptz', nullable: false, note: 'Thread sorting key' },
    ],
  },
  {
    name: 'messages',
    domain: 'WhatsApp',
    rlsEnabled: true,
    rlsSummary: 'Workspace-scoped inbound/outbound WhatsApp messages.',
    indexes: ['(conversation_id, sent_at ASC)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Message UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'conversation_id', type: 'uuid', nullable: false, key: 'FK', references: 'conversations.id', note: 'Parent conversation' },
      { name: 'direction', type: 'text', nullable: false, note: 'inbound | outbound' },
      { name: 'type', type: 'text', nullable: false, note: 'text | template | image | audio | document' },
      { name: 'body', type: 'text', nullable: false, note: 'UTF-8 EN/UR message body' },
      { name: 'media_url', type: 'text', nullable: true, note: 'Supabase Storage URL' },
      { name: 'wa_message_id', type: 'text', nullable: true, note: 'Meta wamid' },
      { name: 'status', type: 'text', nullable: false, note: 'queued | sent | delivered | read | received' },
      { name: 'sent_at', type: 'timestamptz', nullable: false, note: 'Dispatch/receipt time' },
    ],
  },
  {
    name: 'imports',
    domain: 'Governance',
    rlsEnabled: true,
    rlsSummary: 'Tracks CSV/XLSX bulk import jobs up to 20,000 rows and downloadable error reports.',
    indexes: ['(workspace_id, created_at DESC)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Import job UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'file_url', type: 'text', nullable: false, note: 'Uploaded source path' },
      { name: 'mapping', type: 'jsonb', nullable: false, note: 'Column header mapping' },
      { name: 'status', type: 'text', nullable: false, note: 'queued | processing | completed | failed' },
      { name: 'rows_ok', type: 'integer', nullable: false, note: 'Imported/updated rows' },
      { name: 'rows_failed', type: 'integer', nullable: false, note: 'Rejected rows' },
      { name: 'error_report_url', type: 'text', nullable: true, note: 'Downloadable error CSV link' },
    ],
  },
  {
    name: 'domain_events',
    domain: 'Governance',
    rlsEnabled: true,
    rlsSummary: 'Transactional event outbox consumed by automations and notifications.',
    indexes: ['(workspace_id, emitted_at DESC)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Event UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: false, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'event_name', type: 'text', nullable: false, note: 'contact.created, deal.stage_changed, etc.' },
      { name: 'payload', type: 'jsonb', nullable: false, note: 'Event body' },
      { name: 'emitted_at', type: 'timestamptz', nullable: false, note: 'Emission timestamp' },
    ],
  },
  {
    name: 'audit_logs',
    domain: 'Governance',
    rlsEnabled: true,
    rlsSummary: 'Immutable security log for role changes, deletes, exports, and impersonation.',
    indexes: ['(workspace_id, created_at DESC)'],
    columns: [
      { name: 'id', type: 'uuid', nullable: false, key: 'PK', note: 'Audit UUID' },
      { name: 'workspace_id', type: 'uuid', nullable: true, key: 'FK', references: 'workspaces.id', note: 'Workspace scope' },
      { name: 'actor_id', type: 'uuid', nullable: false, key: 'FK', references: 'users.id', note: 'Acting user' },
      { name: 'action', type: 'text', nullable: false, note: 'membership.role_changed | contact.soft_deleted | data.exported' },
      { name: 'entity_type', type: 'text', nullable: false, note: 'Target entity' },
      { name: 'entity_id', type: 'text', nullable: true, note: 'Target record ID' },
      { name: 'meta', type: 'jsonb', nullable: false, note: 'Before/after metadata' },
    ],
  },
];

export const MIGRATION_SQL_SNIPPETS = [
  {
    id: '001_core_schema.sql',
    title: '01. Core Tables, Constraints & Soft Deletes',
    summary: '17 CRM tables plus domain_events outbox and audit_logs with E.164 phone uniqueness.',
    sql: `-- See /supabase/migrations/001_core_schema.sql for full DDL
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_ws_phone_unique
  ON public.contacts (workspace_id, phone_e164)
  WHERE deleted_at IS NULL;`,
  },
  {
    id: '002_rls_policies.sql',
    title: '02. Multi-Tenant & Agent-Scoped RLS Policies',
    summary: 'Enforces workspace isolation, partner admin support access, and agent owner_id filtering.',
    sql: `CREATE POLICY contacts_role_read ON public.contacts
  FOR SELECT USING (
    deleted_at IS NULL
    AND app.is_workspace_member(workspace_id)
    AND (app.is_manager_or_owner(workspace_id) OR owner_id = app.current_user_id())
  );`,
  },
  {
    id: '003_indexes_and_triggers.sql',
    title: '03. GIN JSONB/Tags & Cursor Pagination Indexes',
    summary: 'High-speed GIN indexes for contacts.custom, contacts.tags, and 50k+ row cursor pagination.',
    sql: `CREATE INDEX IF NOT EXISTS idx_contacts_custom_gin ON public.contacts USING GIN (custom);
CREATE INDEX IF NOT EXISTS idx_contacts_tags_gin ON public.contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_contacts_cursor
  ON public.contacts (workspace_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;`,
  },
];
