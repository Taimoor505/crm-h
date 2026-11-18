# Lead capture, assignment and follow-ups (Huzaifa)

Weeks 1–5 of the backend brief: schema and job queue, plan/subscription tables,
lead capture (website form, generic webhook, quick-add with voice note),
assignment rules, tasks and follow-ups, notifications (in-app), and
`/home/summary`. API reference: [`openapi/huzaifa.yaml`](../openapi/huzaifa.yaml).

## Stack decisions

| | Choice | Why |
|---|---|---|
| Database | Supabase Postgres, migrations in `supabase/migrations/` | As per the brief. Apply with `supabase db push`. |
| API | Next.js route handlers under `app/api/v1/*` | The repo is already Next.js; one deployable for API and app. |
| DB access | [`postgres`](https://github.com/porsager/postgres) (v4), one transaction per request | Each request runs `set local role authenticated` plus JWT claims, exactly like PostgREST, so **the same RLS policies protect our API and direct Supabase access**. |
| Auth | Supabase access token (`Authorization: Bearer`), verified with `jose` (JWKS, or HS256 secret on legacy projects) | No extra auth service. |
| Workspace | `X-Workspace-Id` header, checked against `memberships` on every request | A user can belong to several workspaces. |
| Job queue | Postgres table `jobs` worked with `FOR UPDATE SKIP LOCKED` | No Redis to run. Events are enqueued **inside** the writer's transaction, so an event exists only if its write committed. Swappable for BullMQ later behind `server/queue.ts`. |
| Scheduler | `npm run worker` (`worker/`), ticks every 20 s | Each job/window is claimed via the `scheduler_runs` primary key, so running several workers is safe and every run is logged. |
| Validation | `zod` v4 | Errors come back as `422 validation_failed` with `details[{path, message}]`. |

## Running it

```bash
npm install
cp .env.example .env.local      # fill in the Supabase section
supabase db push                # applies supabase/migrations/*
npm run dev                     # API on :3000
npm run worker                  # separate process: queue + scheduler
```

Tests run against a local PostgreSQL 15+ (no Supabase needed). They rebuild a
`crm_test` database from `supabase/tests/00_supabase_shim.sql` (roles,
`auth.uid()`) plus every migration, then call the route handlers with real
signed JWTs, so RLS is exercised for real:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/crm_test npm test
```

## Contract with the core schema (for Taimoor)

`supabase/migrations/20261118000000_core_stub.sql` and `server/core/*` are a
**stub** of Taimoor's part, written only so this work runs and is tested. Replace
them with the real thing. My code depends on exactly this:

**Tables / columns:** `workspaces(id, timezone, status)`,
`memberships(workspace_id, user_id, role in owner|manager|agent, status='active')`,
`users(id, name)`, `contacts(id, workspace_id, name, phone_e164, email, source,
owner_id, tags, custom, deleted_at, created_at)` with a unique index on
`(workspace_id, phone_e164)`, `activities(workspace_id, contact_id, deal_id,
type, actor_id, body, meta, created_at)`, `deals(id)`.

**Columns I add to `contacts`** (in `…0200_lead_capture.sql`): `first_response_at`,
`last_response_at`, `last_enquiry_at`, `assigned_at`, `auto_reassign_count`.

**RLS helpers:** `is_workspace_member(ws)`, `is_workspace_manager(ws)`,
`workspace_role(ws)`, all `SECURITY DEFINER`.

**Functions from `server/core/`:** `normalizePhone(input) → '+92…' | null`,
`createOrGetContact(tx, …) → { contact, created }` (race-safe dedupe on phone,
emits `contact.created` once), `logActivity(tx, …)`.

**Events:** emit with `select public.enqueue_job('contact.created', '{"contact_id": …}'::jsonb, workspace_id, now(), 'contact.created:<id>')`
(or `enqueue()` from `server/queue.ts`), inside the same transaction as the write.
The last argument is a dedupe key. I consume `contact.created` (for
`source = 'whatsapp'`, to assign inbound WhatsApp leads); the others are acked
until the automations land in weeks 9–10.

**Call outcome → follow-up:** in `POST /contacts/:id/calls`, when the body has
`follow_up: { type, due_at, title?, assigned_to? }`, call
`createFollowUpFromCall(tx, { workspaceId, contactId, actorId, followUp })`
from `server/tasks/service.ts` in the same transaction.

**First response:** a trigger on `activities` sets `contacts.first_response_at`
on the first `call`, `whatsapp` or `note` logged by a user (inbound messages have
no `actor_id`, so they don't count). Nothing to call. Add
`meta.counts_as_response = false` to an activity that shouldn't count.

## For Habib

* Website form: create a `website_form` source; the response has `embed_snippet`
  (form plus `<script src="/embed/lead-form.js" data-key="…">`). Plain HTML forms
  work too (set `settings.redirect_url`).
* Zapier / Make / n8n: create a `webhook` source, then give them `endpoint_url` and
  the `secret` (shown once; `PATCH {rotate_secret: true}` for a new one).
* Home screen: `GET /home/summary` (agents) or `?scope=team` (managers).
* Bell: `GET /notifications`, `POST /notifications/read`. `priority: urgent` is
  for new leads; push and agent-WhatsApp delivery come in weeks 6–8.
* "I'm off today" toggle: `PUT /availability {available:false}`.

## Behaviour worth knowing

* **Duplicate phone** → no new contact. The timeline gets "Re-enquired via X" and
  it's routed as a fresh lead: it stays with the current owner if they're active
  and available (re-alerted, untouched clock restarts), otherwise the rules pick
  someone. Existing name/email aren't overwritten; gaps are filled.
* **Manual mode** (default) leaves new leads unassigned and alerts owners/managers.
* **Round-robin** keeps its position per rotation (`rr_state`), skips unavailable
  or disabled people, and holds a row lock so simultaneous leads don't double up.
* **Auto-reassign** (off by default): leads that enquired in the last 24 h and
  have had no response for `reassign_after_minutes` move to the next person, at
  most `max_auto_reassigns` times. Both agents are notified.
* **Read-only workspaces** (unpaid billing) get `403 workspace_read_only` on
  every write; reads keep working. The status flip itself comes with the billing
  run in weeks 11–12.
* **lead_events** keep raw payloads 30 days (hourly housekeeping deletes older).

## Not in this slice (per the timeline)

Weeks 6–8: reminders 15 min before due, overdue digest, untouched-lead alerts,
web push and agent-WhatsApp channels, notification settings, quiet hours, Meta lead
ads (`/hooks/meta/leadgen`). Weeks 9–10: preset automations, reports. Weeks 11–12:
billing run, payments, admin endpoints. The tables for billing exist already
(`…0600_billing.sql`, plans seeded with the brief's prices).
