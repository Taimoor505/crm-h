# Huzaifa's backend: lead capture to billing

Everything in the backend brief, weeks 1–12: lead capture (website form,
webhooks, Meta lead ads, quick-add with voice note, WhatsApp inbound),
assignment, tasks and follow-ups, notifications (in-app, web push, agent
WhatsApp), preset automations, reports, and plans/billing for partners.

API reference: [`openapi/huzaifa.yaml`](../openapi/huzaifa.yaml) (38 paths).
Tests: 141, against real Postgres with RLS (`npm test`).

## Stack decisions

| | Choice | Why |
|---|---|---|
| Database | Supabase Postgres, migrations in `supabase/migrations/` | As per the brief. Apply with `supabase db push`. |
| API | Next.js route handlers under `app/api/v1/*` | The repo is already Next.js; one deployable for API and app. |
| DB access | [`postgres`](https://github.com/porsager/postgres) v4, one transaction per request | Each request runs `set local role authenticated` plus the JWT claims, like PostgREST, so **the same RLS policies protect our API and direct Supabase access**. |
| Auth | Supabase access token (`Authorization: Bearer`), verified with `jose` (JWKS, or the HS256 secret on legacy projects) | No extra auth service. |
| Workspace | `X-Workspace-Id` header, checked against `memberships` on every request | Users can belong to several workspaces. |
| Job queue | Postgres table `jobs`, `FOR UPDATE SKIP LOCKED` | No Redis. Events are queued **inside** the writer's transaction, so an event exists only if its write committed. |
| Scheduler | `npm run worker` (`worker/`), ticks every 20 s | Each (job, time window) is claimed via the `scheduler_runs` primary key: safe with several workers, every run logged. |
| Validation | `zod` v4 | Errors are `422 validation_failed` with `details[{path, message}]`. |

## Running it

```bash
npm install
cp .env.example .env.local      # fill in the Supabase section, ENCRYPTION_KEY, VAPID keys
supabase db push                # applies supabase/migrations/* (incl. storage buckets)
npm run dev                     # API on :3000
npm run worker                  # separate, always-on process: queue + scheduler
```

Tests need a local PostgreSQL 15+ (no Supabase): they rebuild `crm_test` from
`supabase/tests/00_supabase_shim.sql` plus every migration and call the route
handlers with real signed JWTs.

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/crm_test npm test
```

Before going live: create the Meta app webhook, an approved `agent_alert`
WhatsApp template (two body params), VAPID keys, and add yourself to
`platform_admins`.

## What runs in the background

| Scheduled job | Every | Does |
|---|---|---|
| `leads.auto_reassign` | 1 min | Moves untouched new leads after N minutes (off by default) |
| `leads.untouched_alerts` | 1 min | Lead not contacted 30 min after enquiring → owner + managers (urgent) |
| `tasks.reminders` | 1 min | 15 minutes before a follow-up is due → assignee |
| `tasks.overdue_alerts` | 5 min | Follow-up just went overdue → assignee (urgent) |
| `digest.overdue` | 15 min | Once a day after 09:00 local: overdue count per agent → managers |
| `automations.stale_deals` | 60 min | Stale deal alert rule |
| `billing.monthly_run` | 60 min | Bills each subscription once per month (`billing_runs`) |
| `billing.enforce` | 60 min | Overdue → read-only → archived |
| `jobs.recover_stale`, `housekeeping` | 5 / 60 min | Requeue jobs from dead workers; purge 30-day lead payloads, old jobs |

Queue handlers: `contact.created` (inbound WhatsApp leads), `lead.received`,
`call.logged`, `deal.stage_changed`, `deal.won` (automations),
`meta.fetch_lead`, `notification.dispatch`, `notification.deliver`.

## Contract with the core schema (for Taimoor)

`supabase/migrations/20261118000000_core_stub.sql`, `server/core/*` are a
**stub** of Taimoor's part so this work runs and is tested. Replace them. My code
relies on exactly this:

**Tables / columns:** `partners(id, name, is_house, status)`,
`partner_members(partner_id, user_id, status)` (partner admins),
`workspaces(id, partner_id, name, timezone, status ∈ active|read_only|archived|suspended, created_at)`,
`memberships(workspace_id, user_id, role ∈ owner|manager|agent, status='active')`,
`users(id, name, phone)`,
`contacts(id, workspace_id, name, phone_e164, email, source, owner_id, tags, custom, deleted_at, created_at)` with a unique index on `(workspace_id, phone_e164)`,
`pipelines(id, workspace_id, position)`, `stages(id, pipeline_id, name, position, kind ∈ open|won|lost)`,
`deals(id, workspace_id, pipeline_id, stage_id, contact_id, title, value_pkr, owner_id, lost_reason, stage_entered_at, created_at, deleted_at)`,
`activities(workspace_id, contact_id, deal_id, type, actor_id, body, meta, created_at)`.

**Columns I add to `contacts`:** `first_response_at`, `last_response_at`,
`last_enquiry_at`, `assigned_at`, `auto_reassign_count`, `untouched_alerted_at`.
**Indexes I add** for reports (`…0900_report_indexes.sql`).

**RLS helpers:** `is_workspace_member(ws)`, `is_workspace_manager(ws)`, `workspace_role(ws)`.

**Functions from `server/core/`:** `normalizePhone`, `createOrGetContact`
(race-safe dedupe on phone, emits `contact.created` once), `logActivity`, and
`whatsapp().sendTemplate({ workspaceId, to, template, language, params })`.
Your sender should route by workspace (its own number) and use the platform
number when `workspaceId` is null (agent alerts). Call
`recordWhatsAppUsage(tx, workspaceId)` (`server/usage.ts`) for every template you
send so it's billed as pass-through.

**Events to emit** (inside the write's transaction):
`select public.enqueue_job('<name>', '<payload>'::jsonb, workspace_id, now(), '<dedupe key>')`
or `enqueue()` from `server/queue.ts`.

| Event | Payload I read |
|---|---|
| `contact.created` | `contact_id`, `source` (I handle `source = 'whatsapp'` as a new lead) |
| `call.logged` | `contact_id`, `outcome` (e.g. `no_answer`), `actor_id` |
| `deal.stage_changed` | `deal_id`, `from_stage_id`, `to_stage_id` |
| `deal.won` | `deal_id` |

Also write `stage_change` activities with `meta.to_stage_id`; the funnel report
reads stage history from them.

**Call outcome → follow-up:** in `POST /contacts/:id/calls`, when the body has
`follow_up: { type, due_at, title?, assigned_to? }`, call
`createFollowUpFromCall(tx, …)` from `server/tasks/service.ts` in the same transaction.

**First response:** a trigger on `activities` sets `contacts.first_response_at`
on the first `call`, `whatsapp` or `note` logged by a user. Nothing to call.
Set `meta.counts_as_response = false` on activities that shouldn't count.

## For Habib

* **Home:** `GET /home/summary` (agents) or `?scope=team` (managers).
* **Bell:** `GET /notifications`, `POST /notifications/read`. Settings page:
  `GET/PUT /notification-settings`.
* **Web push:** subscribe with `push.vapid_public_key` from the settings, `POST /push-subscriptions`;
  in the service worker `importScripts('/push-sw.js')`; `DELETE /push-subscriptions` on logout.
* **Website form:** create a `website_form` source; paste its `embed_snippet`.
* **Zapier / Make / n8n:** a `webhook` source gives `endpoint_url` + `secret` (shown once).
* **Facebook lead ads:** Facebook Login with `pages_manage_metadata`, `leads_retrieval`,
  `pages_show_list`; then `POST /lead-sources { type: 'meta_leadgen', meta: { page_id, page_access_token, form_ids? } }`.
* **Automations page:** `GET /automations` includes `settings_schema` (JSON Schema) to render each form.
* **Reports:** `GET /reports/{sources|speed-to-lead|funnel|agents|won-value|lost-reasons}?from&to&pipeline_id&source&agent_id`.
* **Billing page** (partner admin: `X-Partner-Id`; direct customer owner: `X-Workspace-Id`):
  `GET /billing/plans`, `GET/POST /billing/subscription`, `GET /billing/invoices`,
  `POST /billing/payments` (multipart with `proof`), `GET /billing/commission-statement`,
  `PUT /billing/collections`.
* **Super-admin console:** `/admin/partners`, `/admin/payments`, `/admin/payments/:id/confirm`,
  `/admin/trials/:id/extend`, `/admin/partners/:id/suspend`, `/admin/workspaces/:id/suspend`, `/admin/billing/run`.
* Errors to handle globally: `403 workspace_read_only` (show "pay your invoice" banner; personal actions still work),
  `403 workspace_suspended`.

## Behaviour worth knowing

**Leads.** A known phone never creates a duplicate: it's logged "Re-enquired via X" and
routed as a fresh lead (stays with its owner if they're available, untouched clock restarts).
Raw payloads are kept 30 days in `lead_events`.

**Assignment.** Manual (default; managers alerted), round-robin, or by source with
fallback. Unavailable agents are skipped; rotation keeps its place. Optional
auto-reassign of untouched leads, at most `max_auto_reassigns` times.

**Notifications.** In-app always. Push and WhatsApp per user and event type
(WhatsApp defaults on only for urgent items: new lead, re-enquiry, untouched lead,
overdue follow-up, billing). Quiet hours 23:00–08:00 workspace time hold push and
WhatsApp until 08:00. Every delivery is in `notification_deliveries` with status;
3 attempts, then `failed`. Agent WhatsApp alerts are counted for billing.

**Automations.** Six presets, all off by default: welcome message, auto follow-up,
no-answer retry (tomorrow 11:00 local), stage follow-up, stale deal alert, won notice
(+ optional thank-you). Each rule runs once per trigger; a failing rule is logged
and doesn't block the others. `GET /automation-runs` answers "why did this go out?".

**Reports.** Live queries (the brief allows this up to ~50k contacts per workspace;
add a nightly rollup then). Dates are workspace-local days; agents only see their own numbers.

**Billing.**
* The billing unit is a subscription: a partner's covers all its client workspaces;
  a direct customer's covers its one workspace.
* **Free first month** once per real business (NTN / CNIC / phone, not brand name),
  first 5 workspaces free, extras billed. Paid billing starts on the 1st after the trial.
* **Prepaid** plans are billed per workspace at the start of each period; a workspace
  added mid-period pays the months left. **Commission** is billed in arrears: 30% of
  what the partner reported collecting (`PUT /billing/collections`), minimum Rs. 300
  per workspace per month. **WhatsApp** is billed at cost on every plan.
* Plan changes apply at the end of the paid period (immediately during the trial).
* Invoices are due 7 days after issue. Unpaid then → **read-only**; 30 days after issue
  → **archived** (data kept, reads and export work). Owners and managers are notified.
  A confirmed payment restores access. An archived account can't start a fresh
  subscription; it pays to restore.
* Payments are manual: partner uploads a screenshot, a super-admin confirms.
  JazzCash/Easypaisa links can be added later behind the same `payments` table.

## Known limits

* `server/core/*` and the core stub migration are placeholders for Taimoor's code.
* No mid-month proration: a workspace added mid-month starts paying from the next 1st.
* Commission collections are self-reported by partners (as the brief says: manual
  settlement first, automate later).
