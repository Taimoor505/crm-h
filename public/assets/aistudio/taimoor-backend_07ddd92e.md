# Taimoor: Backend Brief

**Product:** White-label CRM for Pakistan. Lead management, pipelines, follow-ups and WhatsApp for real estate, law offices, distributors and any business that sells.
**Your role:** The core platform: auth, multi-tenancy and white-label, the data model and template engine, contacts, pipelines and deals, import/export and WhatsApp.
**Team:** Habib (frontend), Huzaifa (backend: lead capture, assignment, follow-ups, automations, reports, billing).

---

## 1. Scope

**We are building a CRM, not a khata or inventory app.** No ledger, stock or invoicing tables in v1. Every table you design should serve leads, contacts, deals, conversations or the team.

**You own:**
1. Auth, users, workspaces, roles
2. Partner layer and white-label branding
3. Data model, industry templates and custom fields
4. Contacts, companies, notes, tags, activity timeline
5. Pipelines, stages, deals
6. Import and export (Excel/CSV)
7. WhatsApp integration (click-to-chat logging, then Cloud API inbox)
8. The shared API contract (OpenAPI file) and the multi-tenancy rules everyone follows

---

## 2. Stack

- PostgreSQL on Supabase, with row-level security
- Backend framework agreed in week 1 (Node/TypeScript or FastAPI). REST + JSON, versioned under `/api/v1`
- Background jobs: BullMQ or Supabase queues (shared with Huzaifa)
- File storage: Supabase Storage (logos, imports, voice notes, WhatsApp media)

---

## 3. Multi-tenancy and white-label

Three levels, built in from day one even though the partner UI ships later:

```
partner (white-label reseller)
  └── workspace (one client business)
        └── users (via memberships with a role)
```

- A direct customer belongs to a built-in "house" partner, so there's only one code path.
- **Every** business table carries `workspace_id`. RLS policies enforce that a user only reads rows of workspaces they're a member of.
- Partner admins can access their own client workspaces (for support), and nothing else.
- Agents see only records where `owner_id = their user id`, unless they're Manager or Owner. Enforce this in the API and in RLS, not just the UI.

**Branding resolution:** request host → `partner_domains` → partner branding, overridden by workspace branding where set. Exposed at `GET /branding` (no auth needed, so the login page can be branded).

---

## 4. Core tables (your part)

| Table | Key columns |
|---|---|
| `partners` | id, name, status, default_branding (jsonb) |
| `partner_domains` | partner_id, domain, verified |
| `workspaces` | id, partner_id, name, industry_template_id, branding (jsonb), locale, timezone, status |
| `users` | id, phone, email, name, locale |
| `memberships` | user_id, workspace_id, role (owner, manager, agent), status |
| `industry_templates` | id, key (real_estate, law, distributor, clinic, general), name_en, name_ur, definition (jsonb: pipelines, stages, fields, sample data) |
| `custom_field_defs` | workspace_id, entity (contact, deal), key, label_en, label_ur, type (text, number, money, date, select, phone), options, required, position, hidden |
| `contacts` | workspace_id, name, phone_e164, alt_phone, email, company_id, source, owner_id, status, tags (text[]), custom (jsonb), last_activity_at |
| `companies` | workspace_id, name, phone, custom (jsonb) |
| `pipelines` | workspace_id, name, position |
| `stages` | pipeline_id, name, position, kind (open, won, lost) |
| `deals` | workspace_id, pipeline_id, stage_id, contact_id, title, value_pkr, owner_id, expected_close, lost_reason, custom (jsonb), stage_entered_at |
| `activities` | workspace_id, contact_id, deal_id, type (note, call, whatsapp, stage_change, assignment, task, system), actor_id, body, meta (jsonb), created_at |
| `whatsapp_accounts` | workspace_id, phone_number_id, waba_id, token_ref, status |
| `conversations` | workspace_id, contact_id, channel, assigned_to, unread_count, last_message_at |
| `messages` | conversation_id, direction, type, body, media_url, wa_message_id, status, sent_at |
| `imports` | workspace_id, file_url, mapping (jsonb), status, rows_ok, rows_failed, error_report_url |

Huzaifa owns `lead_sources`, `assignment_rules`, `tasks`, `automations`, `notifications` and the billing tables. Agree the foreign keys between your tables and his in week 1.

**Phone numbers:** normalize every phone to E.164 (`+923001234567`) on write. Pakistani users type `0300-1234567`, `3001234567` and `+92 300 1234567`; they must all match. `(workspace_id, phone_e164)` is the duplicate check key.

---

## 5. Template and custom-field engine

This is what lets one product serve every industry.

- A template defines pipelines, stages, custom fields and sample data.
- On workspace creation, the chosen template is **copied** into the workspace (pipelines, stages, field defs). After that the workspace owns its copy and can edit it freely.
- Custom values live in the `custom` jsonb column, validated against `custom_field_defs` on write.
- Add GIN indexes on `custom` and `tags` for filtering.
- Launch templates: Real estate, Law office, Distributor / Wholesale, Clinic, General.
- Adding a new industry should mean writing one JSON template, not new code.

---

## 6. Endpoints (your part)

```
POST   /auth/otp/send            POST /auth/otp/verify
GET    /me                        GET  /branding
POST   /workspaces                (with template key)
GET    /workspaces/:id/members    POST /invites   PATCH /memberships/:id

GET/POST          /contacts       (filters: q, source, owner, tag, status, stage, updated_since)
GET/PATCH/DELETE  /contacts/:id
POST              /contacts/:id/merge
GET               /contacts/:id/timeline
POST              /contacts/:id/notes
POST              /contacts/:id/calls     (outcome, duration, note)
GET               /contacts/check-duplicate?phone=

GET/POST    /pipelines         GET/POST/PATCH /pipelines/:id/stages
GET/POST    /deals             PATCH /deals/:id      POST /deals/:id/move
GET/POST    /custom-fields     PATCH /custom-fields/:id

POST  /imports              (upload) → GET /imports/:id (status, errors)
POST  /exports              (contacts, deals) → file URL

POST  /whatsapp/click-log         (logs a click-to-chat send)
GET   /conversations              GET /conversations/:id/messages
POST  /conversations/:id/messages
POST  /webhooks/whatsapp          (Meta Cloud API inbound)

Partner (Phase 2):
GET/POST /partner/workspaces   PATCH /partner/branding   POST /partner/domains
```

Every list endpoint is cursor-paginated. Every write creates an `activities` row where relevant, so the timeline is always complete.

**Events you emit** (on the shared job queue, consumed by Huzaifa's automations and notifications):
`contact.created`, `contact.updated`, `deal.created`, `deal.stage_changed`, `deal.won`, `deal.lost`, `message.received`, `call.logged`.

---

## 7. WhatsApp

- **Phase A (v1):** click-to-chat. The frontend opens `wa.me` with a prefilled message; the backend logs it as an activity. No Meta approval needed.
- **Phase B (v1.1):** Meta Cloud API. Embedded signup per workspace, inbound webhook, conversation threading by phone, template messages, media storage, delivery and read status.
- Verify the webhook signature. Store the access token encrypted, not in plain jsonb.
- Messaging is metered by Meta. Track sent template messages per workspace so Huzaifa can bill them as pass-through.

---

## 8. Import and export

- Accept .xlsx and .csv up to 20,000 rows.
- Column mapping step, with auto-guessing for common headers ("Name", "Mobile", "Phone No", "Cell").
- Run as a background job. Dedupe by phone, skip or update existing contacts (user's choice).
- Downloadable error report for failed rows.
- Export anytime. Data ownership is a selling point, so never block it.

---

## 9. Security and quality

- RLS on every workspace table, with tests proving one workspace can't read another's rows.
- Rate limits on OTP and public endpoints.
- Audit log for role changes, deletes, exports and impersonation.
- Soft delete for contacts and deals (restorable for 30 days).
- Seed script that creates a demo workspace per template.

---

## 10. Timeline (12 weeks)

| Weeks | Deliverable |
|---|---|
| 1–2 | Data model, RLS policies, OpenAPI contract (with Huzaifa and Habib), auth, partner/workspace/membership, branding endpoint |
| 3–5 | Templates and custom fields, contacts, companies, notes, timeline, duplicate check, pipelines and deals |
| 6–8 | Import/export, events on the queue, role-based visibility, click-to-chat logging |
| 9–10 | WhatsApp Cloud API (webhook, inbox, templates), search and filter performance |
| 11–12 | Load testing with 50k contacts, security review, partner endpoints, pilot fixes |

---

## 11. Definition of done

- Endpoint documented in the OpenAPI file and matches it
- RLS and role rules tested
- Activity rows written for timeline-relevant changes
- Events emitted where listed
- Works with Urdu text in every string field
