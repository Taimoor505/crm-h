# Taimoor: what my backend needs from yours

Hi Taimoor. My whole part of the backend (weeks 1–12 of my brief) is in
[Hub-to-Hub/Crm#1](https://github.com/Hub-to-Hub/Crm/pull/1): lead capture, assignment,
tasks, notifications, automations, reports and billing. It's tested (141 tests)
and runs end to end.

Your part wasn't in the repo yet, so I wrote small **stand-ins** for the few
pieces of yours that my code needs. This note says exactly what those are, so
you can replace them with your real code without breaking mine.

---

## 1. First: we need to agree the stack

Both our briefs say **Supabase (Postgres + RLS) + a shared job queue**. Your
plan in the repo (`.aistudio/.../implementation_plan.md`) says **Cloud SQL +
Drizzle + Firebase Auth**, with events in a `domain_events` table.

I built on **Supabase**, as the briefs say:

- SQL migrations in `supabase/migrations/`
- Supabase Auth access tokens (`Authorization: Bearer ...`)
- API routes under `app/api/v1/*` (Next.js)
- Every request runs in a transaction with `set local role authenticated` and
  the JWT claims, so **RLS protects the API too**, not just the UI
- The job queue is a Postgres table (`jobs`), with no Redis

Can we settle on Supabase? If you'd rather go another way, let's talk before
either of us builds more. Moving my side would mean changing the auth check
and the database connection, not the business logic.

---

## 2. Stand-ins you should replace

| My stand-in | What it is | Replace with |
|---|---|---|
| `supabase/migrations/20261118000000_core_stub.sql` | Minimal versions of your tables + RLS | Your real migrations |
| `server/core/phone.ts` | `normalizePhone()` (Pakistani formats to E.164) | Your normaliser |
| `server/core/contacts.ts` | `createOrGetContact()`, `logActivity()` | Your contact service |
| `server/core/whatsapp.ts` | `whatsapp().sendTemplate()` via the Cloud API | Your WhatsApp sender |

My migrations are named `20261118000100_...` onwards, so they run after the
core stub. Your migrations need to run **before** mine, or replace the stub
under the same early position.

---

## 3. Tables and columns I rely on

As long as these exist with these names, my code works:

| Table | Columns I use |
|---|---|
| `partners` | `id`, `name`, `is_house`, `status` |
| `partner_members` (partner admins) | `partner_id`, `user_id`, `status` |
| `workspaces` | `id`, `partner_id`, `name`, `timezone`, `status`, `created_at` |
| `users` | `id`, `name`, `phone` |
| `memberships` | `workspace_id`, `user_id`, `role` (`owner` / `manager` / `agent`), `status` (`active` counts) |
| `contacts` | `id`, `workspace_id`, `name`, `phone_e164`, `email`, `source`, `owner_id`, `tags`, `custom`, `deleted_at`, `created_at` |
| `pipelines` | `id`, `workspace_id`, `position` |
| `stages` | `id`, `pipeline_id`, `name`, `position`, `kind` (`open` / `won` / `lost`) |
| `deals` | `id`, `workspace_id`, `pipeline_id`, `stage_id`, `contact_id`, `title`, `value_pkr`, `owner_id`, `lost_reason`, `stage_entered_at`, `created_at`, `deleted_at` |
| `activities` | `workspace_id`, `contact_id`, `deal_id`, `type`, `actor_id`, `body`, `meta`, `created_at` |

Also needed:

- **A unique index on `contacts (workspace_id, phone_e164)`.** Lead dedupe
  depends on it.
- **These `workspaces.status` values:** `active`, `read_only`, `archived` and
  `suspended`. Billing sets them: unpaid invoices make a workspace read-only,
  then archived.
- **These RLS helper functions** (`SECURITY DEFINER`):
  `is_workspace_member(ws)`, `is_workspace_manager(ws)` and `workspace_role(ws)`.
- **`partner_members` is new**, and isn't in your brief's table list. It records
  which users administer a partner, for partner billing. Keep it, or tell me
  the name of your equivalent.

### Things I added to your tables

- **`contacts` columns:** `first_response_at`, `last_response_at`,
  `last_enquiry_at`, `assigned_at`, `auto_reassign_count` and
  `untouched_alerted_at`.
- **A trigger on `activities`:** it sets `first_response_at` when the first
  call, WhatsApp or note is logged. You don't need to call anything for that.
- **Indexes on `activities`, `contacts`, `deals` and `tasks`** for the reports
  (`20261118000900_report_indexes.sql`). Please keep them.

---

## 4. Events I need you to emit

Emit these **inside the same transaction as the write**, so an event only
exists if the write was saved:

```sql
select public.enqueue_job(
  'deal.won',                          -- event name
  '{"deal_id": "..."}'::jsonb,         -- payload
  '<workspace_id>',                    -- workspace
  now(),                               -- when
  'deal.won:<deal_id>'                 -- dedupe key: same key twice = queued once
);
```

You can also use `enqueue(tx, name, payload, { workspaceId, dedupeKey })` from
`server/queue.ts`.

| Event | When | Payload fields I read |
|---|---|---|
| `contact.created` | Any new contact | `contact_id`, `source` (for `source = "whatsapp"` I treat it as a new lead and assign it) |
| `call.logged` | `POST /contacts/:id/calls` | `contact_id`, `outcome` (e.g. `no_answer`), `actor_id` |
| `deal.stage_changed` | A deal moves stage | `deal_id`, `from_stage_id`, `to_stage_id` |
| `deal.won` | A deal moves to a `won` stage | `deal_id` |

`contact.updated`, `deal.created`, `deal.lost` and `message.received` are fine
to emit too. I don't use them yet, and the worker just marks them done.

**Stage history:** when a deal changes stage, please also write an `activities`
row with `type = 'stage_change'` and `meta.to_stage_id`. The funnel report
reads stage history from those rows.

---

## 5. Hooks into your endpoints

**Call outcome → next follow-up.** The brief says logging a call can create
the next follow-up in the same request. In `POST /contacts/:id/calls`, if the
body has `follow_up: { type, due_at, title?, assigned_to? }`, call this in the
same transaction:

```ts
import { createFollowUpFromCall } from '@/server/tasks/service';
await createFollowUpFromCall(tx, { workspaceId, contactId, actorId, followUp });
```

**Activities that aren't a response.** If you log an activity that shouldn't
count as "first response" for speed-to-lead (e.g. a system note), add
`meta.counts_as_response = false`.

---

## 6. WhatsApp sender

My code sends WhatsApp in three cases: alerts to agents, the automatic welcome
message to new leads, and an optional thank-you when a deal is won. It calls:

```ts
whatsapp().sendTemplate({ workspaceId, to, template, language, params })
```

When you replace `server/core/whatsapp.ts`:

- **`workspaceId` set:** send from that workspace's own WhatsApp number.
- **`workspaceId` null:** send from the platform number. This is for agent
  alerts.
- **Billing:** for every template message *you* send, call
  `recordWhatsAppUsage(tx, workspaceId)` from `server/usage.ts`. That's how
  WhatsApp is billed to partners at cost.

---

## 7. Shared conventions

- **Workspace header:** `X-Workspace-Id` on every authenticated request. I
  check the caller's membership for each request.
- **Errors:** `{ "error": { "code", "message", "details" } }`. Validation
  errors are 422 with `details: [{ path, message }]`.
- **Lists:** cursor pagination, `?cursor=...` and `next_cursor` in the
  response.
- **Times:** stored in UTC; "today" means the workspace timezone (default
  `Asia/Karachi`).
- **jsonb with postgres.js v4:** pass objects with `tx.json(value)`, or the
  `jsonb(tx, value)` helper in `server/db.ts`. A string from `JSON.stringify`
  gets stored as a JSON *string*, not an object. That one cost me an hour.
- **OpenAPI:** my endpoints are in `openapi/huzaifa.yaml`. Let's merge it into
  the shared file once yours exists.

---

## 8. Questions for you

1. Are you OK with Supabase as described in section 1?
2. Are your table and column names the same as in section 3? Anything renamed?
3. Is `partner_members` fine for partner admins, or do you have your own?
4. Can you emit the four events in section 4 with those payload fields?
5. When will your core migrations be ready, so I can delete the stub?

More detail is in `docs/huzaifa-backend.md` in the PR. Thanks!

Huzaifa
