export interface EndpointCatalogItem {
  id: string;
  tag:
    | 'Auth & Branding'
    | 'Workspaces & Team'
    | 'Contacts & Timeline'
    | 'Pipelines & Deals'
    | 'Custom Fields'
    | 'Import & Export'
    | 'WhatsApp & Webhooks'
    | 'Partner (Phase 2)';
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  summary_ur: string;
  authRequired: boolean;
  rlsRule: string;
  emits: string[];
  queryHint?: string;
  sampleBody?: Record<string, unknown>;
}

export const OPENAPI_ENDPOINTS: EndpointCatalogItem[] = [
  {
    id: 'auth-otp-send',
    tag: 'Auth & Branding',
    method: 'POST',
    path: '/api/v1/auth/otp/send',
    summary: 'Send rate-limited OTP to Pakistani E.164 mobile number',
    summary_ur: 'پاکستانی موبائل نمبر پر OTP کوڈ بھیجیں',
    authRequired: false,
    rlsRule: 'Public rate-limited (5 req/min per phone). Normalizes 03XX-XXXXXXX to +92.',
    emits: [],
    sampleBody: { phone: '0300-1112233' },
  },
  {
    id: 'auth-otp-verify',
    tag: 'Auth & Branding',
    method: 'POST',
    path: '/api/v1/auth/otp/verify',
    summary: 'Verify OTP and return bearer session token + user profile',
    summary_ur: 'OTP کی تصدیق کریں اور سیشن ٹوکن حاصل کریں',
    authRequired: false,
    rlsRule: 'Upserts user by normalized E.164 phone.',
    emits: [],
    sampleBody: { phone: '0300-1112233', code: '482910' },
  },
  {
    id: 'me-get',
    tag: 'Auth & Branding',
    method: 'GET',
    path: '/api/v1/me',
    summary: 'Fetch current user profile, memberships, and partner scope',
    summary_ur: 'موجودہ صارف کی پروفائل اور ورک اسپیس ممبرشپ حاصل کریں',
    authRequired: true,
    rlsRule: 'Returns only memberships belonging to the authenticated actor.',
    emits: [],
  },
  {
    id: 'branding-get',
    tag: 'Auth & Branding',
    method: 'GET',
    path: '/api/v1/branding',
    summary: 'Resolve partner -> workspace white-label branding by host',
    summary_ur: 'ڈومین یا ورک اسپیس کے مطابق وائٹ لیبل برانڈنگ حاصل کریں',
    authRequired: false,
    rlsRule: 'Public endpoint so login pages render partner colors/logos before auth.',
    emits: [],
    queryHint: 'host=karachi-proptech.crm.pk',
  },
  {
    id: 'workspaces-post',
    tag: 'Workspaces & Team',
    method: 'POST',
    path: '/api/v1/workspaces',
    summary: 'Provision workspace by cloning chosen industry template',
    summary_ur: 'انڈسٹری ٹیمپلیٹ کلون کر کے نیا ورک اسپیس بنائیں',
    authRequired: true,
    rlsRule: 'Creates workspace, owner membership, cloned pipelines, stages & custom_field_defs.',
    emits: [],
    sampleBody: {
      name: 'Lahore DHA Realty (لاہور ڈی ایچ اے رئیلٹی)',
      template_key: 'real_estate',
      locale: 'ur',
      seed_samples: true,
    },
  },
  {
    id: 'workspace-members-get',
    tag: 'Workspaces & Team',
    method: 'GET',
    path: '/api/v1/workspaces/{id}/members',
    summary: 'List members & roles inside a workspace',
    summary_ur: 'ورک اسپیس کے تمام ممبران اور ان کے رولز دیکھیں',
    authRequired: true,
    rlsRule: 'Requires active membership in target workspace or partner admin.',
    emits: [],
  },
  {
    id: 'invites-post',
    tag: 'Workspaces & Team',
    method: 'POST',
    path: '/api/v1/invites',
    summary: 'Invite user by E.164 phone into workspace role',
    summary_ur: 'نئے ٹیم ممبر کو ورک اسپیس میں مدعو کریں',
    authRequired: true,
    rlsRule: 'Manager/Owner only. Writes audit_logs entry.',
    emits: [],
    sampleBody: {
      name: 'Bilal Qureshi (بلال قریشی)',
      phone: '0302-4455661',
      email: 'bilal@agency.pk',
      role: 'agent',
    },
  },
  {
    id: 'memberships-patch',
    tag: 'Workspaces & Team',
    method: 'PATCH',
    path: '/api/v1/memberships/{id}',
    summary: 'Update member role or status (owner/manager/agent)',
    summary_ur: 'ممبر کا رول یا اسٹیٹس تبدیل کریں',
    authRequired: true,
    rlsRule: 'Manager/Owner only. Writes mandatory security audit_logs row.',
    emits: [],
    sampleBody: { role: 'manager', status: 'active' },
  },
  {
    id: 'contacts-get',
    tag: 'Contacts & Timeline',
    method: 'GET',
    path: '/api/v1/contacts',
    summary: 'Cursor-paginated contacts list with search, tag & owner filters',
    summary_ur: 'رابطوں کی فہرست تلاش اور فلٹرز کے ساتھ دیکھیں',
    authRequired: true,
    rlsRule: 'Agents see ONLY owner_id = current_user_id; Managers/Owners see all.',
    emits: [],
    queryHint: 'limit=10&q=Tariq',
  },
  {
    id: 'contacts-post',
    tag: 'Contacts & Timeline',
    method: 'POST',
    path: '/api/v1/contacts',
    summary: 'Create contact with E.164 normalization & custom field validation',
    summary_ur: 'نیا رابطہ E.164 فون نارملائزیشن اور کسٹم فیلڈز کے ساتھ بنائیں',
    authRequired: true,
    rlsRule: 'Checks (workspace_id, phone_e164) uniqueness; validates custom JSONB.',
    emits: ['contact.created'],
    sampleBody: {
      name: 'Faisal Mehmood (فیصل محمود)',
      phone: '0300-7654321',
      source: 'WhatsApp',
      status: 'new',
      tags: ['Lahore', 'VIP'],
      custom: {
        society: 'DHA Lahore Phase 6-8',
        budget_pkr: 35000000,
      },
    },
  },
  {
    id: 'contacts-duplicate-get',
    tag: 'Contacts & Timeline',
    method: 'GET',
    path: '/api/v1/contacts/check-duplicate',
    summary: 'Check duplicate contact by Pakistani phone before insert',
    summary_ur: 'فون نمبر کے ذریعے ڈپلیکیٹ رابطہ چیک کریں',
    authRequired: true,
    rlsRule: 'Normalizes any local format (0300-..., 300...) to +92 before lookup.',
    emits: [],
    queryHint: 'phone=0300-4455667',
  },
  {
    id: 'contacts-id-get',
    tag: 'Contacts & Timeline',
    method: 'GET',
    path: '/api/v1/contacts/{id}',
    summary: 'Get single contact detail (RLS owner-checked)',
    summary_ur: 'ایک رابطے کی مکمل تفصیل حاصل کریں',
    authRequired: true,
    rlsRule: '403 Forbidden if agent does not own contact.',
    emits: [],
  },
  {
    id: 'contacts-id-patch',
    tag: 'Contacts & Timeline',
    method: 'PATCH',
    path: '/api/v1/contacts/{id}',
    summary: 'Update contact fields, custom JSONB, or restore soft-delete',
    summary_ur: 'رابطے کی معلومات یا کسٹم فیلڈز اپ ڈیٹ کریں',
    authRequired: true,
    rlsRule: 'Validates custom JSONB; emits contact.updated + timeline row.',
    emits: ['contact.updated'],
    sampleBody: {
      status: 'qualified',
      tags: ['DHA Phase 8', 'Site Visit Done'],
    },
  },
  {
    id: 'contacts-id-delete',
    tag: 'Contacts & Timeline',
    method: 'DELETE',
    path: '/api/v1/contacts/{id}',
    summary: '30-day soft delete contact with audit log',
    summary_ur: 'رابطہ 30 دن کے لیے سافٹ ڈیلیٹ کریں',
    authRequired: true,
    rlsRule: 'Sets deleted_at timestamp (restorable 30 days) and records audit_logs.',
    emits: [],
  },
  {
    id: 'contacts-merge',
    tag: 'Contacts & Timeline',
    method: 'POST',
    path: '/api/v1/contacts/{id}/merge',
    summary: 'Merge duplicate secondary contact into primary contact',
    summary_ur: 'ڈپلیکیٹ رابطے کو بنیادی رابطے میں ضم کریں',
    authRequired: true,
    rlsRule: 'Moves deals, activities, conversations; unions tags; soft-deletes secondary.',
    emits: ['contact.updated'],
    sampleBody: { secondary_contact_id: '<paste-secondary-contact-id>' },
  },
  {
    id: 'contacts-timeline',
    tag: 'Contacts & Timeline',
    method: 'GET',
    path: '/api/v1/contacts/{id}/timeline',
    summary: 'Cursor-paginated contact activity timeline (notes, calls, WA, stages)',
    summary_ur: 'رابطے کی مکمل سرگرمیوں کی ٹائم لائن دیکھیں',
    authRequired: true,
    rlsRule: 'Scoped to workspace and contact owner visibility.',
    emits: [],
  },
  {
    id: 'contacts-notes',
    tag: 'Contacts & Timeline',
    method: 'POST',
    path: '/api/v1/contacts/{id}/notes',
    summary: 'Append bilingual note to contact timeline',
    summary_ur: 'رابطے کی ٹائم لائن میں نوٹ شامل کریں',
    authRequired: true,
    rlsRule: 'Writes activities row of type note.',
    emits: [],
    sampleBody: {
      body: 'کلائنٹ نے ہفتہ کو سائٹ وزٹ کی تصدیق کر دی ہے۔ Client confirmed Saturday visit.',
    },
  },
  {
    id: 'contacts-calls',
    tag: 'Contacts & Timeline',
    method: 'POST',
    path: '/api/v1/contacts/{id}/calls',
    summary: 'Log phone call outcome & duration + emit call.logged event',
    summary_ur: 'فون کال کا ریکارڈ اور دورانیہ محفوظ کریں',
    authRequired: true,
    rlsRule: 'Writes activities row of type call and emits call.logged.',
    emits: ['call.logged'],
    sampleBody: {
      outcome: 'answered',
      duration_sec: 185,
      note: 'Discussed 1 Kanal plot payment schedule.',
    },
  },
  {
    id: 'pipelines-get',
    tag: 'Pipelines & Deals',
    method: 'GET',
    path: '/api/v1/pipelines',
    summary: 'List workspace pipelines with ordered stages',
    summary_ur: 'ورک اسپیس کی پائپ لائنز اور اسٹیجز دیکھیں',
    authRequired: true,
    rlsRule: 'Workspace-scoped.',
    emits: [],
  },
  {
    id: 'pipelines-stages-post',
    tag: 'Pipelines & Deals',
    method: 'POST',
    path: '/api/v1/pipelines/{id}/stages',
    summary: 'Add stage (open | won | lost) to a pipeline',
    summary_ur: 'پائپ لائن میں نیا اسٹیج شامل کریں',
    authRequired: true,
    rlsRule: 'Manager/Owner only.',
    emits: [],
    sampleBody: { name: 'Legal Verification', kind: 'open' },
  },
  {
    id: 'deals-get',
    tag: 'Pipelines & Deals',
    method: 'GET',
    path: '/api/v1/deals',
    summary: 'Cursor-paginated deals list (PKR values, stage, owner)',
    summary_ur: 'ڈیلز کی فہرست اور PKR مالیت دیکھیں',
    authRequired: true,
    rlsRule: 'Agents see ONLY owner_id = current_user_id; Managers/Owners see all.',
    emits: [],
  },
  {
    id: 'deals-post',
    tag: 'Pipelines & Deals',
    method: 'POST',
    path: '/api/v1/deals',
    summary: 'Create deal with PKR value and validated custom fields',
    summary_ur: 'نئی ڈیل بنائیں اور کسٹم فیلڈز کی تصدیق کریں',
    authRequired: true,
    rlsRule: 'Validates custom fields against workspace custom_field_defs.',
    emits: ['deal.created'],
    sampleBody: {
      title: '5 Marla Commercial Plot — Bahria Town',
      contact_id: '<contact-uuid>',
      pipeline_id: '<pipeline-uuid>',
      stage_id: '<stage-uuid>',
      value_pkr: 18500000,
      custom: { plot_size: 'Commercial 4 Marla' },
    },
  },
  {
    id: 'deals-move',
    tag: 'Pipelines & Deals',
    method: 'POST',
    path: '/api/v1/deals/{id}/move',
    summary: 'Move deal stage, update stage_entered_at & emit stage/won/lost events',
    summary_ur: 'ڈیل کو اگلے اسٹیج پر منتقل کریں',
    authRequired: true,
    rlsRule: 'Logs stage_change activity; emits deal.stage_changed (+ deal.won or deal.lost).',
    emits: ['deal.stage_changed', 'deal.won', 'deal.lost'],
    sampleBody: { stage_id: '<target-stage-uuid>' },
  },
  {
    id: 'custom-fields-get',
    tag: 'Custom Fields',
    method: 'GET',
    path: '/api/v1/custom-fields',
    summary: 'List workspace custom_field_defs (EN/UR labels & types)',
    summary_ur: 'ورک اسپیس کے کسٹم فیلڈز دیکھیں',
    authRequired: true,
    rlsRule: 'Workspace-scoped.',
    emits: [],
  },
  {
    id: 'custom-fields-post',
    tag: 'Custom Fields',
    method: 'POST',
    path: '/api/v1/custom-fields',
    summary: 'Define new bilingual custom field for contacts or deals',
    summary_ur: 'رابطے یا ڈیل کے لیے نیا اردو/انگریزی کسٹم فیلڈ بنائیں',
    authRequired: true,
    rlsRule: 'Manager/Owner only. Enforced immediately on next write.',
    emits: [],
    sampleBody: {
      entity: 'contact',
      key: 'whatsapp_preferred_lang',
      label_en: 'Preferred Language',
      label_ur: 'پسندیدہ زبان',
      type: 'select',
      options: ['Urdu', 'English', 'Punjabi'],
      required: false,
    },
  },
  {
    id: 'imports-post',
    tag: 'Import & Export',
    method: 'POST',
    path: '/api/v1/imports',
    summary: 'Bulk import CSV/JSON rows with E.164 dedupe & error report',
    summary_ur: 'CSV یا ایکسل ڈیٹا بلک امپورٹ کریں',
    authRequired: true,
    rlsRule: 'Auto-maps Mobile/Phone No/Cell; supports skip or update strategy.',
    emits: ['contact.created', 'contact.updated'],
    sampleBody: {
      file_name: 'lahore_leads_nov.csv',
      duplicate_strategy: 'skip',
      rows: [
        { Name: 'Kamran Akmal', Mobile: '0300-8811223', City: 'Lahore' },
        { Name: 'Bad Row', Mobile: '1234', City: 'Karachi' },
      ],
    },
  },
  {
    id: 'exports-post',
    tag: 'Import & Export',
    method: 'POST',
    path: '/api/v1/exports',
    summary: 'Export workspace contacts or deals as UTF-8 CSV + audit log',
    summary_ur: 'رابطے یا ڈیلز CSV فائل میں ایکسپورٹ کریں',
    authRequired: true,
    rlsRule: 'Never blocked; records audit_logs entry for data governance.',
    emits: [],
    sampleBody: { entity: 'contacts' },
  },
  {
    id: 'whatsapp-click-log',
    tag: 'WhatsApp & Webhooks',
    method: 'POST',
    path: '/api/v1/whatsapp/click-log',
    summary: 'Log Phase-A click-to-chat wa.me launch on contact timeline',
    summary_ur: 'واٹس ایپ کلک ٹو چیٹ سرگرمی محفوظ کریں',
    authRequired: true,
    rlsRule: 'Returns ready wa.me URL and writes whatsapp activity.',
    emits: [],
    sampleBody: {
      contact_id: '<contact-uuid>',
      prefill_text: 'السلام علیکم، آپ کی پراپرٹی انکوائری کے حوالے سے رابطہ کر رہے ہیں۔',
    },
  },
  {
    id: 'conversations-get',
    tag: 'WhatsApp & Webhooks',
    method: 'GET',
    path: '/api/v1/conversations',
    summary: 'List threaded WhatsApp conversations with unread counts',
    summary_ur: 'واٹس ایپ گفتگو کی فہرست دیکھیں',
    authRequired: true,
    rlsRule: 'Agents see assigned conversations; Managers/Owners see all.',
    emits: [],
  },
  {
    id: 'webhooks-whatsapp',
    tag: 'WhatsApp & Webhooks',
    method: 'POST',
    path: '/api/v1/webhooks/whatsapp',
    summary: 'Meta Cloud API inbound webhook with HMAC-SHA256 verification',
    summary_ur: 'میٹا واٹس ایپ کلاؤڈ API ان باؤنڈ ویب ہک',
    authRequired: false,
    rlsRule: 'Verifies X-Hub-Signature-256, threads by phone_e164, emits message.received.',
    emits: ['message.received'],
    sampleBody: {
      phone_number_id: '1059001',
      from: '923004455667',
      wa_message_id: 'wamid.live.1001',
      body: 'جی بالکل، کل دوپہر 3 بجے ملاقات طے کر لیں۔',
    },
  },
  {
    id: 'partner-workspaces-get',
    tag: 'Partner (Phase 2)',
    method: 'GET',
    path: '/api/v1/partner/workspaces',
    summary: 'List client workspaces owned by authenticated partner admin',
    summary_ur: 'پارٹنر ایڈمن کے ماتحت کلائنٹ ورک اسپیس دیکھیں',
    authRequired: true,
    rlsRule: 'Strict partner_admin_of isolation; cannot see other partners.',
    emits: [],
  },
  {
    id: 'partner-branding-patch',
    tag: 'Partner (Phase 2)',
    method: 'PATCH',
    path: '/api/v1/partner/branding',
    summary: 'Update partner default white-label branding theme',
    summary_ur: 'پارٹنر کی وائٹ لیبل برانڈنگ اپ ڈیٹ کریں',
    authRequired: true,
    rlsRule: 'Partner Admin only.',
    emits: [],
    sampleBody: {
      appName: 'PropFlow Pakistan',
      primaryColor: '#1d4ed8',
    },
  },
  {
    id: 'partner-domains-post',
    tag: 'Partner (Phase 2)',
    method: 'POST',
    path: '/api/v1/partner/domains',
    summary: 'Register custom white-label domain for partner branding lookup',
    summary_ur: 'پارٹنر کے لیے کسٹم وائٹ لیبل ڈومین شامل کریں',
    authRequired: true,
    rlsRule: 'Partner Admin only.',
    emits: [],
    sampleBody: { domain: 'portal.lahoreestate.pk' },
  },
];

export function buildOpenApiSpec(serverOrigin = 'http://localhost:3000') {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const ep of OPENAPI_ENDPOINTS) {
    const openApiPath = ep.path.replace('/api/v1', '');
    const methodKey = ep.method.toLowerCase();
    if (!paths[openApiPath]) paths[openApiPath] = {};

    const pathParams = [...ep.path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    }));

    paths[openApiPath][methodKey] = {
      operationId: ep.id,
      tags: [ep.tag],
      summary: ep.summary,
      description: `${ep.summary}\n\n**RLS / Security:** ${ep.rlsRule}${
        ep.emits.length ? `\n\n**Emits Events:** ${ep.emits.join(', ')}` : ''
      }`,
      security: ep.authRequired ? [{ BearerAuth: [] }] : [],
      parameters: [
        ...pathParams,
        ...(ep.authRequired
          ? [
              {
                name: 'X-Workspace-Id',
                in: 'header',
                required: false,
                schema: { type: 'string', format: 'uuid' },
                description: 'Active tenant workspace scope',
              },
            ]
          : []),
      ],
      ...(ep.sampleBody
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { type: 'object' },
                  example: ep.sampleBody,
                },
              },
            },
          }
        : {}),
      responses: {
        '200': {
          description: 'Successful JSON response',
        },
        '401': { description: 'Unauthorized' },
        '403': { description: 'RLS / Role Forbidden' },
      },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Taimoor Core — White-Label CRM API',
      version: '1.0.0',
      description:
        'Shared OpenAPI 3.1 contract for Taimoor CRM (Pakistan): multi-tenancy, white-label branding, industry template engine, E.164 contacts, pipelines & deals, bulk import/export, and WhatsApp Cloud API.',
    },
    servers: [{ url: `${serverOrigin}/api/v1`, description: 'Active API Server' }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    paths,
  };
}
