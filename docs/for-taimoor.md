# Taimoor: how my backend plugs into yours

> **Out of date (2026-11-23):** the sandbox store (`lib/taimoor/store.ts`), the developer workbench (`/dev/workbench`) and the `/system/inspector` and `/rls/verify` routes have been removed. Every route now runs on Postgres with Supabase auth. Sections below that mention them describe the earlier state.

Hi Taimoor. My part (weeks 1–12 of my brief) is in
[Hub-to-Hub/Crm#1](https://github.com/Hub-to-Hub/Crm/pull/1): lead capture, assignment,
tasks, notifications, automations, reports and billing.

I've **merged your `main` into it**. Your migrations (`001`–`003`) are now
the core schema, and my code runs on top of them: 143 tests pass and the whole
app builds. Everything I had to change on your side, or need from you, is below.

---

## 1. The big one: your routes still use the sandbox store

Your `/api/v1/*` routes read and write `lib/taimoor/store.ts`, which is
in-memory state saved to `/tmp/taimoor_core_state_v1.json`. Supabase only gets a
best-effort copy (`syncToSupabaseIfConfigured`). My routes read and write
Postgres directly, so **today our two halves don't see each other's data**:

- **Your contacts and deals never reach Postgres.** A contact created through
  your `POST /contacts` doesn't show up in my reports or automations, and
  can't get tasks.
- **My leads never reach your store.** A lead from my webhook or quick-add
  doesn't show up in your `GET /contacts`.

Moving your routes onto Postgres is what joins them. How I do it, if it helps:

- `server/db.ts`: `withUser(userId, tx => ...)` opens a transaction with
  `set local role authenticated` and the JWT claims, so **your RLS policies
  apply to the API itself**. `withService` is for trusted server work.
- `server/http.ts`: `userRoute()` verifies the Supabase token, checks
  `X-Workspace-Id` and membership (partner admins included), and runs the
  handler in that transaction.

You're welcome to reuse both; then we share one auth and DB path.

Your sandbox auth also needs replacing before launch:
- **A default user when no token is sent.** With no token, `resolveActorContext`
  acts as the seeded owner.
- **Guessable tokens.** `taimoor_tok_<userId>` and the `x-sandbox-user-id`
  header let anyone act as any user.

---

## 2. What I changed in your schema (`20261118000000_core_compat.sql`)

This runs right after your `003`. Please fold it into your migrations or tell
me if you disagree:

| Change | Why |
|---|---|
| `grant usage on schema app` and execute on its functions, to `authenticated`, `service_role` | Supabase doesn't grant custom schemas to API roles, so **every policy that calls `app.*` fails with "permission denied for schema app"** without this. |
| `public.is_workspace_member / is_workspace_manager / workspace_role` | These are wrappers around your `app.*` functions, so membership has one definition (partner admins count as managers, as in yours). |
| `workspaces.status` now allows `read_only` and `archived` | Billing makes unpaid workspaces read-only, then archived (data kept). |
| `contacts.owner_id` can be NULL | A new lead can be unassigned (manual assignment mode, or nobody available). Managers are alerted to assign it; agents still only see their own. |
| Insert policy on `activities` | Your `002` only has read policies. Assignments, task events and notes are written by signed-in users. |

Two more things I did on top of your schema:

- **A trigger on `domain_events`.** Every row becomes a job in my queue, in the
  same transaction. So once your events are written to Postgres, my worker
  picks them up with no other change on your side.
- **Columns and indexes for my features:** contact columns (`first_response_at`,
  `last_response_at`, `last_enquiry_at`, `assigned_at`, `auto_reassign_count`,
  `untouched_alerted_at`), a trigger on `activities` that sets
  `first_response_at`, and report indexes. Please keep them.

---

## 3. Your code that I reuse

- **`lib/taimoor/phone.ts`.** My `server/core/phone.ts` now just calls your
  `normalizePhoneToE164`, so there's one normaliser.
- **`users.partner_admin_of`.** My billing and workspace access use it for
  partner admins. I dropped the separate table I had.
- **Your event names and payloads.** Your `contact.created`, `call.logged`,
  `deal.stage_changed` and `deal.won` payloads already have the fields my
  automations read: `contact_id`, `actor_id`, `outcome`, `deal_id` and
  `to_stage_id`. I also accept your `"WhatsApp Inbound"` source for new
  WhatsApp leads.

---

## 4. What I still need from you

1. **Move your routes to Postgres** (section 1), writing events to `domain_events`
   (or calling `public.enqueue_job(...)`) in the same transaction as the write.
2. **Stage history:** keep writing `stage_change` activities with
   `meta.to_stage_id`; the funnel report reads them. You already do this in the
   sandbox `deals/[id]/move`.
3. **Call outcome → next follow-up:** in `POST /contacts/:id/calls`, if the body
   has `follow_up: { type, due_at, title?, assigned_to? }`, call
   `createFollowUpFromCall(tx, { workspaceId, contactId, actorId, followUp })`
   from `server/tasks/service.ts` in the same transaction.
4. **WhatsApp sender.** My code calls
   `whatsapp().sendTemplate({ workspaceId, to, template, language, params })`
   (`server/core/whatsapp.ts`):
   - **`workspaceId` set:** send from that workspace's number, using your
     `whatsapp_accounts`.
   - **`workspaceId` null:** send from the platform number (agent alerts).
   - **Billing:** call `recordWhatsAppUsage(tx, workspaceId)` from
     `server/usage.ts` for every template message you send. That's how WhatsApp
     is billed to partners at cost.
5. **Encryption key:** `lib/taimoor/crypto.ts` silently uses a hard-coded
   default when `TOKEN_ENCRYPTION_KEY` is missing. In production that would
   encrypt every WhatsApp token with a public key. Please make it fail instead.

---

## 5. Env and tooling

- **One database URL.** `SUPABASE_DB_URL` (your name) is the direct Postgres
  connection for both of us; my code also accepts `DATABASE_URL`.
  `.env.example` now has both our sections.
- **Lockfiles.** I updated `bun.lock` and `package-lock.json` with my
  dependencies (`postgres`, `zod`, `jose`, `web-push`).
- **OpenAPI.** My endpoints are in `openapi/huzaifa.yaml`; yours are served at
  `/api/v1/openapi.json`. Let's merge them into one file.

---

## 6. Questions for you

1. When can your routes move from the sandbox store to Postgres?
2. Are the schema changes in section 2 OK to fold into your migrations?
3. Do you want to reuse my `userRoute` / `withUser`, or keep your own auth layer?
4. Who sends WhatsApp from which number: your sender for workspace numbers, and
   the platform number for agent alerts?

More detail is in `docs/huzaifa-backend.md`. Thanks!

Huzaifa
