# Taimoor Core — Backend API, Multi-Tenant Schema & RLS Explorer

Taimoor Core is a bilingual (English/Urdu) backend workbench and live OpenAPI 3.1 explorer for Pakistan's white-label CRM platform. It pairs a real Cloud SQL (PostgreSQL) multi-tenant database and versioned `/api/v1` REST API with an interactive developer console for testing OpenAPI endpoints, inspecting the 17-table relational schema, verifying Row-Level Security (RLS) isolation across partners, workspaces, and agent roles, and validating Pakistani E.164 phone normalization, industry template cloning, bulk imports, and WhatsApp event flows.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX choices were confirmed during discovery and govern the build. Please review the remaining operational gates before approving.

- **Confirmed Scope — Backend API & Schema Explorer**: The interface is built strictly as an engineering and API workbench (OpenAPI Contract & Live Runner, PostgreSQL Schema & RLS Tester, Template & Custom Field Sandbox, Phone/Import/WhatsApp Event Simulator) rather than an end-user sales CRM UI.
- **Confirmed Persistence — Cloud SQL (PostgreSQL) + Real API Routes**: All endpoints under `/api/v1/*` execute real database queries via Drizzle ORM against a hosted Cloud SQL PostgreSQL instance with GIN indexes, E.164 uniqueness constraints, and database-level RLS policies.
- **Confirmed Templates — All 5 Launch Industries + Live Switcher**: Seeded out of the box with `real_estate`, `law`, `distributor`, `clinic`, and `general` templates (including Urdu labels and sample records) across a built-in "House" partner and white-label reseller partners.
- **Confirmed Visual Identity — Crisp Light Bilingual EN/UR + White-Label Theming**: Clean white/slate developer workspace with an instant English/Urdu (`LTR`/`RTL`) toggle and dynamic white-label brand color/logo injection driven by `GET /api/v1/branding`.
- **Cloud SQL & Auth Provisioning Gate (Approval Required Next)**: After you approve this plan, building begins by checking Cloud SQL eligibility and prompting you via the Cloud SQL setup card to select a region/project, followed by automatic Google Sign-In (Firebase Auth) configuration to secure API endpoints.
- **OTP & Meta WhatsApp Cloud API Sandbox Mode**: Because Meta Business verification and Pakistani telco SMS gateways require external merchant credentials, `POST /api/v1/auth/otp/send` and `POST /api/v1/conversations/:id/messages` will persist real database state and emit genuine queue events while returning verifiable sandbox delivery receipts and HMAC-signed webhook test payloads.

---

## 1. Overview & Core Concept

- **What It Does**: Provides Taimoor's core platform engineering team (backend, frontend, and partner integrators) with a live, testable reference implementation of the multi-tenant CRM backend—covering every table, REST endpoint, OpenAPI 3.1 specification, RLS rule, E.164 normalizer, template cloner, and event outbox defined in the backend brief.
- **Target Audience / Persona**: Backend engineers (Taimoor, Huzaifa), frontend engineers (Habib) consuming the OpenAPI contract, and white-label reseller admins validating workspace isolation and custom branding.
- **Key Value**: Eliminates contract drift between frontend, automations, and database layers by letting engineers execute real requests against Cloud SQL, inspect generated SQL/RLS execution context, and verify English + Urdu UTF-8 data round-trips before shipping client apps.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Authentication & White-Label Context Selection**:
   - Users land on the API & Schema Explorer with public branding already resolved via `GET /api/v1/branding` (simulating host-header lookup via `partner_domains` -> `partners.default_branding` -> `workspaces.branding`).
   - Signing in with Google (Firebase Auth) upserts the user into PostgreSQL `users` and unlocks authenticated `/api/v1/*` mutations, while an embedded **Actor & Role Context Switcher** lets developers test requests as a Partner Admin, Workspace Owner, Manager, or Agent.
2. **OpenAPI Contract & Live Request Runner**:
   - Browse all endpoints grouped by domain (Auth & Branding, Workspaces & Members, Contacts & Timeline, Pipelines & Deals, Custom Fields, Import/Export, WhatsApp & Webhooks, Partner Phase 2).
   - Select any endpoint to inspect its OpenAPI 3.1 request/response schema, cursor-pagination parameters, and emitted event contracts, then click **Send Request** with editable JSON payloads or Urdu sample strings to see live HTTP status, latency, JSON response, and newly created `activities` + `domain_events` rows.
3. **PostgreSQL Schema, Indexes & RLS Isolation Tester**:
   - Inspect all core tables (`partners` through `imports`, plus `domain_events` and `audit_logs`), column types, foreign keys, GIN indexes on `contacts.custom`/`contacts.tags`, and `(workspace_id, phone_e164)` unique constraints.
   - Run one-click **RLS Verification Scenarios** (e.g., *Cross-Workspace Read Attempt*, *Agent Reading Another Owner's Lead*, *Manager Reading Workspace Deals*, *Partner Admin Cross-Client Support Read*) that execute real PostgreSQL transactions with `SET LOCAL` session variables and display row counts proving isolation passes or fails.
4. **Template Engine, Custom Fields & Workspace Provisioner**:
   - Switch between the 5 seeded industry templates (`real_estate`, `law`, `distributor`, `clinic`, `general`) in English or Urdu, inspect their JSON definitions, provision a new workspace via `POST /api/v1/workspaces` (verifying deep-copy cloning of pipelines, stages, and `custom_field_defs`), and test dynamic JSONB validation against custom field rules.
5. **Pakistani Phone Normalization, Bulk Import/Export & WhatsApp Event Lab**:
   - Test E.164 normalization (`0300-1234567`, `3001234567`, `+92 300 1234567` → `+923001234567`) and duplicate checks (`GET /api/v1/contacts/check-duplicate`).
   - Upload a `.csv` or `.xlsx` file (up to 20,000 rows), review auto-mapped headers (`Name`, `Mobile`, `Phone No`, `Cell`), choose *Skip* or *Update* on duplicate phone numbers, trigger `POST /api/v1/imports`, inspect failed-row error reports, and export CSVs via `POST /api/v1/exports`.
   - Trigger `POST /api/v1/whatsapp/click-log` and simulate HMAC-signed Meta Cloud API inbound webhooks (`POST /api/v1/webhooks/whatsapp`) to watch conversation threading and `message.received` events appear in real time.

### Visual Identity & Theme

- **Aesthetic Direction**: High-craft, utilitarian developer workbench inspired by crisp API documentation and PostgreSQL inspection tools—airy light surfaces, sharp 1px structural borders, zero ornamental clutter, and effortless English/Urdu (`LTR`/`RTL`) switching.
- **Color Palette & Mood (60-30-10 Discipline)**:
  - *60% Neutral Canvas*: Crisp white (`#FFFFFF`) primary reading panes and subtle cool slate (`#F8FAFC`) workspace backdrop.
  - *30% Structural Surfaces*: Cool gray hairlines (`#E2E8F0`), slate secondary panels (`#F1F5F9`), deep ink slate text (`#0F172A`), and muted secondary labels (`#475569`).
  - *10% Dynamic White-Label Accent*: Defaults to Pakistan-emerald (`#059669` primary / `#047857` hover) for the House partner, and dynamically shifts via CSS variables (`--brand-primary`, `--brand-surface`) when switching to seeded white-label reseller partners (e.g., *Karachi PropTech Reseller* in deep navy `#1D4ED8` or *Lahore Legal Cloud* in warm charcoal `#334155`).
  - *Semantic States (Paired with Text Labels)*: Green (`#16A34A` · `200 OK` / `RLS PASS`), Amber (`#D97706` · `409 DUPLICATE` / `PARTIAL`), Crimson (`#DC2626` · `403 FORBIDDEN` / `RLS BLOCKED`).
- **Typography & Hierarchy**:
  - *Display & Navigation*: `Plus Jakarta Sans` (SemiBold 600 / Bold 700, `text-wrap: balance` on headings).
  - *Body & Bilingual Urdu Support*: `DM Sans` for Latin prose paired with `Noto Nastaliq Urdu` / `Noto Sans Arabic` fallback for crisp Urdu script rendering at 14px–16px (`1.6` line-height, automatic `dir="rtl"` on Urdu-active fields).
  - *API Payloads, Phone Numbers & Metrics*: `JetBrains Mono` with strict `font-variant-numeric: tabular-nums` for HTTP status codes, row counts, PKR deal values, timestamps, and JSON bodies.
- **Component Styling & Layout (Domain Reference Compliant)**:
  - Fixed `256px` left sidebar navigation on desktop (collapsible drawer on mobile) + minimal top breadcrumb bar (`Workspace / Module / Active Endpoint`) with at most 2 right-aligned controls (Language `EN | اردو` toggle + `Sign In` / Account trigger), strictly single-line (`whitespace-nowrap shrink-0`).
  - Single-elevation flat containers using 1px hairline borders—no nested card sandwiches, no thick left accent stripes, no pill badge clutter (HTTP methods, status codes, and metadata use crisp unboxed typographic separators `·` or minimal square code tags), and no fake telemetry tickers.
- **Interactive Feedback & Motion**:
  - Transitions settle in $\le 200\text{ms}$ (`cubic-bezier(0.16, 1, 0.3, 1)`) using compositor-only `opacity`/`transform`.
  - Complete populated, empty, skeleton-loading, and inline error states on every query table, endpoint response pane, and RLS runner.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dual-Layer Multi-Tenancy Enforcement (API Guard + PostgreSQL RLS)**
  - *Chosen Approach*: Enforce `workspace_id` and `owner_id` scoping both in TypeScript API route middleware and via native PostgreSQL Row-Level Security policies using transaction-local session claims (`app.user_id`, `app.workspace_id`, `app.role`, `app.partner_id`).
  - *Why*: Matches the backend brief's security requirement that RLS itself blocks unauthorized cross-workspace or agent-to-agent reads, and lets the RLS Tester demonstrate real database-level enforcement rather than mocked checks.
  - *Alternatives Considered*: Application-only `WHERE` clauses (rejected because a single missed filter leaks tenant data).

- **Decision 2: Live Code-Backed OpenAPI 3.1 Generator**
  - *Chosen Approach*: Define request/response schemas and endpoint metadata in a single shared TypeScript registry that simultaneously generates `/api/v1/openapi.json`, powers input validation, and drives the interactive API Explorer UI.
  - *Why*: Guarantees the OpenAPI file never drifts from the actual `/api/v1/*` handlers ("Endpoint documented in the OpenAPI file and matches it").
  - *Alternatives Considered*: Hand-maintaining a static `openapi.yaml` file (rejected due to drift risk across 25+ endpoints).

- **Decision 3: Transactional Outbox for Emitted Queue Events & Audit Logs**
  - *Chosen Approach*: Record emitted events (`contact.created`, `deal.stage_changed`, `deal.won`, `message.received`, etc.) and security audit entries (`audit_logs`) inside the same PostgreSQL transaction as the mutation, exposed via an inspectable Queue/Audit feed.
  - *Why*: Eliminates external Redis/BullMQ infrastructure dependencies in Cloud Run while giving Huzaifa's automation layer and the developer explorer a reliable, ordered event log.
  - *Alternatives Considered*: In-memory `EventEmitter` (rejected because events are lost across serverless requests).

- **Decision 4: Firebase Auth Session + Developer Role Simulator**
  - *Chosen Approach*: Require Firebase Google Sign-In for authenticated workspace access (per Cloud SQL security standards), while allowing signed-in users to switch active test personas/roles (`Owner`, `Manager`, `Agent`, `Partner Admin`) across seeded demo workspaces inside the sandbox.
  - *Why*: Satisfies strict backend route authentication while allowing a single engineer to test multi-role and cross-tenant RLS behavior without managing four separate Google accounts.
  - *Alternatives Considered*: Separate email/password accounts per role (rejected as high-friction for API exploration and unsupported by default OAuth setup).

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Browser Workbench (Next.js App Router · Bilingual EN/UR · White-Label CSS)  │
│  ┌──────────────┐ ┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ OpenAPI 3.1  │ │ Schema & RLS     │ │ Template &   │ │ Import/Export &  │ │
│  │ Live Runner  │ │ Isolation Tester │ │ Field Engine │ │ WhatsApp Lab     │ │
│  └──────┬───────┘ └────────┬─────────┘ └──────┬───────┘ └────────┬─────────┘ │
│         └──────────────────┴──────────────────┴──────────────────┘           │
│                            │  Authorization: Bearer <Firebase ID Token>      │
│                            │  X-Workspace-Id / X-Simulate-Role (sandbox)     │
└────────────────────────────┼─────────────────────────────────────────────────┘
                             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Next.js Server Layer (/api/v1/* Route Handlers)                             │
│  ┌──────────────────────┐  ┌───────────────────────┐  ┌───────────────────┐  │
│  │ Auth & Tenant Guard  │  │ E.164 Phone & Custom  │  │ OpenAPI 3.1 Spec  │  │
│  │ (firebase-admin +    │  │ Field JSONB Validator │  │ Registry & XLSX/  │  │
│  │  Membership Lookup)  │  │ (+92 Normalization)   │  │ CSV Stream Parser │  │
│  └──────────┬───────────┘  └───────────┬───────────┘  └─────────┬─────────┘  │
│             └──────────────────────────┴────────────────────────┘            │
│                                        │ Drizzle ORM (pg Pool · ObjectCfg)   │
└────────────────────────────────────────┼─────────────────────────────────────┘
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Cloud SQL PostgreSQL (17 Core Tables + Domain Events & Audit Logs)          │
│  • SET LOCAL app.workspace_id / app.user_id / app.role per transaction       │
│  • RLS Policies on every workspace table (Owner/Manager/Agent/Partner)       │
│  • GIN Indexes on contacts.custom & contacts.tags · UNIQUE(ws_id, phone_e164)│
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **Multi-Tenancy & Branding**: `partners` (`id`, `name`, `status`, `default_branding` jsonb), `partner_domains` (`partner_id`, `domain`, `verified`), `workspaces` (`id`, `partner_id`, `name`, `industry_template_id`, `branding` jsonb, `locale`, `timezone`, `status`), `users` (`id`, `uid` Firebase Auth UID, `phone`, `email`, `name`, `locale`), `memberships` (`user_id`, `workspace_id`, `role` enum `owner|manager|agent`, `status`).
- **Template & Custom Field Engine**: `industry_templates` (`id`, `key`, `name_en`, `name_ur`, `definition` jsonb), `custom_field_defs` (`workspace_id`, `entity` `contact|deal`, `key`, `label_en`, `label_ur`, `type` `text|number|money|date|select|phone`, `options`, `required`, `position`, `hidden`).
- **CRM Core & Timeline**: `companies`, `contacts` (`phone_e164`, `tags` `text[]`, `custom` `jsonb`, `deleted_at` for 30-day soft delete), `pipelines`, `stages` (`kind`: `open|won|lost`), `deals` (`value_pkr`, `stage_entered_at`, `deleted_at`), `activities` (`type`: `note|call|whatsapp|stage_change|assignment|task|system`).
- **WhatsApp, Imports & Governance**: `whatsapp_accounts` (encrypted/masked token ref), `conversations`, `messages`, `imports` (`mapping` jsonb, `rows_ok`, `rows_failed`, `error_rows` jsonb), plus `domain_events` (queue outbox) and `audit_logs` (role changes, soft deletes, exports, impersonation).

### Interactive Component & State Mapping

- **Global Workbench Shell**: Holds active Firebase auth session, resolved branding theme (`GET /api/v1/branding`), active UI locale (`en` / `ur`), active `workspace_id`, and active test role (`owner` / `manager` / `agent` / `partner_admin`). Changing workspace re-fetches branding tokens and updates CSS accent variables immediately.
- **OpenAPI Explorer & Request Runner**: Left endpoint catalog filters by resource tag or search query; right runner pre-populates path params, cursor query params, and realistic Pakistani EN/UR JSON bodies, executes real `fetch('/api/v1/...')`, displays status/headers/formatted JSON, and offers a side tab showing emitted `domain_events` and `activities` triggered by that call.
- **Schema & RLS Isolation Tester**: Displays table DDL/column metadata from live `information_schema` + Drizzle definitions, and provides interactive test cards where selecting an Actor Role + Target Workspace runs a real `BEGIN ... SET LOCAL ... SELECT ... ROLLBACK` transaction against Cloud SQL to display the exact rows returned vs. blocked by RLS.
- **Template & Custom Field Lab**: Lets users inspect any of the 5 templates, provision a fresh workspace via `POST /api/v1/workspaces`, toggle Urdu/English field labels, add custom fields, and test validation errors against sample contact/deal payloads.
- **Phone, Import/Export & WhatsApp Lab**:
  - Live E.164 normalizer input + duplicate check query against the active workspace.
  - Drag-and-drop CSV/XLSX importer with column auto-mapper (`Name`, `Mobile`, `Phone No`, `Cell`), duplicate strategy toggle (`skip` vs `update`), job progress/result summary, downloadable error CSV, and one-click `POST /api/v1/exports`.
  - WhatsApp click-to-chat logger (`wa.me` link generator + activity logger) and Meta Cloud API webhook simulator that computes a real HMAC-SHA256 `X-Hub-Signature-256` header and posts to `/api/v1/webhooks/whatsapp`.

### Key Sequences & Integrations

1. **Workspace Creation Sequence**: `POST /api/v1/workspaces` validates `template_key`, inserts the `workspaces` row and `owner` membership in a single transaction, clones `pipelines`, `stages`, and `custom_field_defs` from `industry_templates.definition`, seeds optional template sample contacts/deals, and writes an `audit_logs` entry.
2. **Deal Move Sequence**: `POST /api/v1/deals/:id/move` verifies membership/ownership, updates `stage_id` and `stage_entered_at`, records a `stage_change` row in `activities`, and emits `deal.stage_changed` (plus `deal.won` or `deal.lost` if `stages.kind` is terminal) into `domain_events`.
3. **Import Sequence**: `POST /api/v1/imports` parses up to 20,000 CSV/XLSX rows, normalizes phones to `+92...`, validates `custom` JSONB against `custom_field_defs`, upserts or skips duplicates on `(workspace_id, phone_e164)`, stores error details for failed rows, and emits `contact.created` / `contact.updated` events.
