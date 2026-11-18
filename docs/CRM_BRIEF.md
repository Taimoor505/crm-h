# [APP NAME] CRM: Frontend Brief (v3, final)

**Product:** A white-label CRM for small and mid-size businesses in any country: lead management, pipelines, follow-ups and WhatsApp for real estate agencies, law firms, distributors, clinics, service agencies and any business that sells.
**Language:** English only. Every string lives in `messages/en.json`, so other languages can be added later.
**Markets:** Any country. Currency, phone format, timezone, date format and units come from workspace settings. Nothing country-specific is hard-coded.
**Repo:** `Hub-to-Hub/Crm` (Next.js 15, React 19, Tailwind v4). The backend lives in the same repo under `app/api/v1`, `server/`, `worker/` and `supabase/`.
**Frontend owner:** Habib. **Backend:** Taimoor (core data, auth, white-label, WhatsApp) and Huzaifa (lead capture, assignment, tasks, notifications, automations, reports, billing).
**Visual reference:** the design canvas demo (Home, Leads, Contact, Pipeline, Follow-ups, WhatsApp, Reports, partner login and desktop kanban). Follow its layouts and patterns. Its Urdu screen and its lakh/crore and PKR formatting are superseded by this brief.

---

## 1. Starting point (commit 59002ff, 2026-11-18)

- The only UI is a developer workbench at `/`, built from `components/workbench/*`. It has 5 tabs: OpenAPI Explorer, Schema & RLS, Templates & Fields, Phone & Import/Export, and WhatsApp & Events.
- **About 65 API routes** exist under `app/api/v1`. The OpenAPI spec is served at `/api/v1/openapi.json`. The endpoints for the user-facing screens are listed in `docs/huzaifa-backend.md` ("For Habib").
- **Already installed:** `motion` and `lucide-react`. Fonts come from `next/font/google`: Plus Jakarta Sans for headings, DM Sans for body and JetBrains Mono for code.
- **Tailwind v4** is configured through `@tailwindcss/postcss`. There is no `tailwind.config` file, so all tokens live in `app/globals.css` (`@theme`).
- **Branding variables already set by the shell:** `--brand-primary`, `--brand-primary-hover`, `--brand-surface`, `--brand-ink`.
- `public/embed/lead-form.js` is a website lead form script. `public/push-sw.js` holds the web push handlers; its icons (`/icon-192.png`, `/badge-72.png`) are missing.
- **Known problems the frontend must work around:**
  - Taimoor's routes use an in-memory sandbox store, while Huzaifa's routes use Postgres, so the two sets of data don't match.
  - There is no real login yet; requests use sandbox tokens.
  - Branding colors don't reach the workbench tabs.
  - There are no frontend tests.

**Decision:** keep the workbench, but move it to `/dev/workbench`. It is visible only in development or to super-admins. The CRM app takes over `/`.

---

## 2. What we are building (and what we are not)

We are building a **CRM**: capture leads, follow up fast, move deals to closed, and see who on the team is doing the work.

We are **not** building accounting, inventory or invoicing. If a screen starts to look like a ledger, it is off track.

**Test for every screen:** does it help someone respond to a lead faster or close a deal sooner?

---

## 3. Markets and localization

The UI is in English. Formatting follows each workspace's region settings:

```json
{
  "country": "AE",
  "locale": "en-AE",
  "currency": "AED",
  "timezone": "Asia/Dubai",
  "date_format": "dd MMM yyyy",
  "time_format": "12h",
  "week_starts_on": 1,
  "area_unit": "sqft",
  "default_phone_country": "AE"
}
```

- **Money:** always format through `lib/format`, which uses `Intl.NumberFormat(locale, { style: "currency", currency })`. Compact views use `notation: "compact"`. Never write a currency symbol in code. Money comes from the API as an amount and a currency code.
- **Phone numbers:** the input has a country picker (default `default_phone_country`) and uses `libphonenumber-js`. Send numbers to the API in E.164 format and display them in national or international format.
- **Dates and times:** the API returns ISO UTC. Display them in the workspace timezone. "Today", "Overdue" and report date ranges use that timezone. Relative times use `Intl.RelativeTimeFormat`.
- **Units:** area fields use the workspace `area_unit` (`sqft` or `sqm`).
- **Labels:** template and custom field labels come from the API (English label). Never hard-code field names such as "Society" or "Plot size".
- **Future languages:** no string literals in components. Use logical Tailwind classes (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`).

Where the backend is still Pakistan-specific, see section 12. The frontend is still built the international way and falls back gracefully.

---

## 4. Design principles

- **Phone first:** design at 360px, then scale up to desktop. Touch targets are at least 44px.
- **Two taps from Home** to add a lead, call, WhatsApp, log a follow-up or move a deal.
- **Add a lead in under 10 seconds.** Only name and phone are required.
- **Plain words:** say Lead, Follow-up and Deal. Never Entity, Object or Record. The API calls follow-ups `tasks`; the UI always says "Follow-up".
- **White-label:** every brand color, logo and app name comes from branding.
- **Accessible:** contrast at least 4.5:1, real buttons and links, labels on inputs, and an `aria-label` on icon-only buttons.

---

## 5. Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 App Router, React 19, TypeScript strict (already in repo) |
| Styling | Tailwind v4, with tokens in `app/globals.css` `@theme` (already in repo) |
| Components | shadcn/ui (Tailwind v4 version), built on the brand tokens |
| Icons and motion | lucide-react, motion (already in repo) |
| API types | `openapi-typescript`, generated from `/api/v1/openapi.json` |
| API client | `openapi-fetch` wrapped in `lib/api` |
| Server state | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| i18n | next-intl, `en` only |
| Phone | libphonenumber-js |
| Charts | Recharts |
| Kanban | dnd-kit |
| Long lists | TanStack Virtual |
| PWA | Serwist; imports `public/push-sw.js` |
| Tests | Vitest + Testing Library, Playwright |
| Mocks | MSW, **only** for endpoints that don't exist yet (listed in `docs/frontend-endpoint-map.md`) |

---

## 6. White-label theming

Branding comes from `GET /api/v1/branding?workspace_id=…` (or from the hostname, for partner domains).

**Reuse the existing variables and add the missing ones:**

| Variable | Status | Use |
|---|---|---|
| `--brand-primary` | exists | Buttons, active nav, links |
| `--brand-primary-hover` | exists | Hover and pressed states |
| `--brand-surface` | exists | Light tint backgrounds, selected rows |
| `--brand-ink` | exists | Dark brand text on tints (values, badges) |
| `--brand-on-primary` | **add** | Black or white text on the primary color, whichever passes 4.5:1 |
| `--brand-accent` | **add** | The floating "Add lead" button and highlights |
| `--brand-on-accent` | **add** | Text on the accent color |

- Generate hover, surface, ink and on-primary from the primary color, so any partner color stays legible.
- Map the variables to Tailwind colors in `@theme` (`bg-brand`, `text-brand-ink`, `bg-brand-surface` and so on). No brand hex values anywhere else.
- The login page, PWA name and icon, favicon and page title all use branding.
- Modules listed in `hide_modules` disappear from navigation, and their routes redirect to `/home`.

---

## 7. Routes

```
/login                     (auth)  phone OTP
/onboarding                (auth)  business type, region, team
/home                      (app)
/leads                     (app)   contacts list ("Leads")
/contacts/[id]             (app)
/pipeline                  (app)   ?pipeline=&stage=
/follow-ups                (app)   tasks
/inbox                     (app)   WhatsApp conversations
/inbox/[conversationId]    (app)
/reports                   (app)
/notifications             (app)   mobile full page; desktop uses the bell popover
/settings/...              (app)   workspace, pipelines, fields, team, lead-sources,
                                   assignment, automations, import-export,
                                   notifications, branding, billing
/partner/...               (partner admins)  clients, branding, domains, billing
/admin/...                 (super-admins, Phase 2)
/dev/workbench             (development or super-admin only)
```

---

## 8. Screens

### 8.1 Login and onboarding
- **Login:** branded page with phone OTP and a country picker (`POST /auth/otp/send`, `POST /auth/otp/verify`). Shows a 6-digit code screen with a resend timer and a support link from branding.
- **Onboarding:**
  1. Business type: Real estate, Law firm, Distributor / Wholesale, Clinic, Agency / Services, General. Show the template's stages and fields before the user confirms.
  2. Region: country pre-fills currency, timezone, phone country and units; each stays editable.
  3. Solo or team: if team, invite by phone or email.
  4. Create the workspace (`POST /workspaces`) and land on Home with a "Clear sample data" banner.

### 8.2 Home (`GET /home/summary`; managers and owners add `?scope=team`)
Four blocks, in this order:
1. **Today's follow-ups:** due today plus overdue, with one-tap Call / WhatsApp / Done.
2. **New leads:** with a source badge and the time since arrival, which turns red after 30 minutes.
3. **Pipeline snapshot:** count and compact value per stage.
4. **Team today** (owners and managers only): calls, follow-ups done and untouched leads per agent.

Plus a floating "+ Add lead" button with a voice-note option.

### 8.3 Leads (`/contacts/*`)
- Search, source chips and a filter sheet (status, owner, tag), with filters kept in the URL.
- A virtualized list with infinite scroll.
- Bulk actions: assign, tag, add to pipeline, export.
- A duplicate warning with Merge or View existing.

### 8.4 Contact detail
- Header: name, phone, email, source, owner, tags, stage.
- Action row: Call, WhatsApp, Add follow-up, Add note, Move stage.
- Tabs:
  - **Timeline:** calls with outcome, WhatsApp, notes, stage changes, assignments, tasks.
  - **Details:** custom fields rendered by type.
  - **Deals:** linked deals.
- Actions: Merge and Assign.

### 8.5 Pipeline (`/pipelines`, `/deals`, `POST /deals/{id}/move`)
- **Desktop:** kanban with drag and drop.
- **Mobile:** stage tabs with a "Move to [next stage]" button on each card.
- **Cards:** contact, value, owner, days in stage, next follow-up.
- **Won or Lost:** always asks for a reason, chosen in one tap.
- **Pipelines:** a workspace can have several.

### 8.6 Follow-ups (`/tasks`, `POST /tasks/{id}/complete`)
- Today, Overdue and Upcoming tabs.
- Reschedule chips: In 1 hour, Tomorrow, Next week, Pick date.
- A call outcome sheet: Answered, No answer, Busy or Wrong number, plus a note and the next follow-up.

### 8.7 Inbox / WhatsApp (`/conversations`, `/conversations/{id}/messages`, click-to-chat log)
- A conversation list with unread counts and the assigned agent.
- A chat view with saved replies and templates.
- Click-to-chat: opens `wa.me` and logs the message.
- Sending through the Cloud API sits behind a feature flag.

### 8.8 Notifications (`/notifications`, `/notification-settings`, `/push-subscriptions`)
- A bell with an unread count.
- A list that marks items read and links to the related lead, deal or follow-up.
- Notification preferences.
- A web push opt-in prompt, shown after the user's first useful action, never on first load.

### 8.9 Reports (`/reports/{sources,speed-to-lead,funnel,agents,won-value,lost-reasons}`)
- A date range picker in the workspace timezone.
- KPI cards, charts for leads by source and the funnel, and a speed-to-lead chart.
- An agent table and a breakdown of lost reasons.
- Export.
- Agents see only their own numbers.

### 8.10 Settings
- **Workspace and region:** name, country, currency, timezone, date and time format, units.
- **Pipelines and stages:** add, rename, reorder, plus Won/Lost reason presets.
- **Custom fields:** types text, number, money, date, select and phone.
- **Team:** invites (`/invites`), roles and deactivation (`/memberships`, `/workspaces/{id}/members`).
- **Lead sources** (`/lead-sources`):
  - Web form: show the `lead-form.js` embed snippet with the source key and a copy button.
  - Webhook: show the URL and secret.
  - Facebook lead ads: connect.
- **Assignment:** manual or round-robin (`/assignment-rules`), plus agent availability (`/availability`).
- **Automations** (`/automations`): each preset has an on/off toggle, and its settings form is generated from `settings_schema`. There is no workflow builder.
- **Import and export:** CSV/XLSX import with column mapping, phone country, a 5-row preview, and a skip or update strategy for duplicates.
- **Notification preferences.**
- **Branding:** owners and partners only.
- **Billing:** owners only.

### 8.11 Billing and account state (`/billing/*`)
- Plan, seats, invoices and payment method, for both partners and direct customers.
- `403 workspace_read_only`: show a site-wide, non-dismissable "Your workspace is read-only. Pay the open invoice to continue." banner with a link to billing. Hide all write actions.
- `403 workspace_suspended`: show a full-page suspended screen with a support contact.

### 8.12 Partner admin (`/partner/*`)
- Client workspaces with status (trial, active, past due), plan, seats and country.
- Create a workspace, apply branding, manage custom domains, and impersonate a workspace for support.
- Billing summary and commission statement.

### 8.13 Super-admin console (`/admin/*`, Phase 2)
- Partners, workspaces, plans, system health.
- The `/dev/workbench` link lives here.

---

## 9. Roles

| Role | Sees |
|---|---|
| Owner | Everything in the workspace, including billing, branding and region |
| Manager | All leads and deals, team view, reports, and settings except billing and branding |
| Agent | Only their own leads, deals and follow-ups. Reports show only their own numbers |
| Partner admin | Partner area plus impersonation into client workspaces |
| Super-admin | Admin console and the workbench |

Hide what a role can't use. Never show disabled buttons for permissions. Resolve the role from the session or membership, never from the URL.

---

## 10. Performance and offline

- First load under 3 seconds on a mid-range Android phone over 4G. Initial JS stays under 200 KB gzipped for `/home`.
- Lists of 50 or more items use pagination or virtual scrolling.
- Cache the app shell and the last-viewed lists. Queue "Add lead" and "Add note" while offline (v1.1; design for it now).

---

## 11. Definition of done (per screen)

- Works at 360px and at desktop width.
- Correct in all four test workspaces below: money, phone numbers, dates, today/overdue and units.
- Rebrands correctly with a different primary color and logo.
- Loading, empty and error states are built, including read-only mode.
- Role permissions are respected.
- No hard-coded strings and no hard-coded brand colors.
- Uses the real `/api/v1` endpoint. Any MSW mock still in use is listed in the endpoint map.

| Test workspace | Country | Locale | Currency | Timezone | Area unit |
|---|---|---|---|---|---|
| US Realty | US | en-US | USD | America/New_York | sqft |
| Dubai Homes | AE | en-AE | AED | Asia/Dubai | sqft |
| London Legal | GB | en-GB | GBP | Europe/London | sqm |
| Lahore Distributors | PK | en-PK | PKR | Asia/Karachi | sqft |

---

## 12. Backend changes needed for multi-country (send to Taimoor and Huzaifa)

The repo snapshot shows a backend built for Pakistan first. The frontend needs the items below, or an agreed replacement. Confirm each one in the shared OpenAPI file.

1. **Workspace region settings.** Add country, locale, currency, timezone, date and time format, week start, area unit and default phone country to the workspace, with read and update endpoints. They are set during onboarding.
2. **Phone numbers.** Normalize to E.164 for any country, not only Pakistani formats such as `0300-4455667`. `check-duplicate` and imports should accept a default country.
3. **Money.** Deals, the home summary and reports return an amount (minor units) plus a currency code. Don't assume PKR.
4. **Templates.** Use generic English keys and labels (for example `location`, `size`, `deposit_date` instead of `society`, `plot_size`, `bayana_date`). Add an Agency / Services template. The Urdu label becomes optional.
5. **Time.** Every timestamp is ISO UTC. Task buckets (today, overdue) and report ranges accept the workspace timezone.
6. **One data store.** Move Taimoor's sandbox-store routes to Postgres, so workspaces, contacts and branding are shared with Huzaifa's routes.
7. **Real auth.** Replace the `taimoor_tok_*` and `x-sandbox-user-id` sandbox identities with real sessions from the OTP flow.
8. **Branding.** Add `accent_color`, `support_email` and `hide_modules`. Partner domains must work on any domain, not only `*.crm.pk`.
9. **Error contract.** Use one JSON error shape, `{ code, message, details }`, everywhere, including `workspace_read_only` and `workspace_suspended`.

---

## 13. Timeline (12 weeks)

| Weeks | Deliverable |
|---|---|
| 1 | Endpoint map, move the workbench, tokens and theming, format and phone utilities, generated API types, auth/session module |
| 2 | App shell, navigation, permissions, notifications bell, quick add, error and read-only handling |
| 3–5 | Login, onboarding, Home, Leads, Contact detail |
| 6–8 | Pipeline, Follow-ups and call outcome, Settings (region, pipelines, fields, team, lead sources, assignment, import) |
| 9–10 | Inbox, Reports, Automations, Notifications, Billing |
| 11–12 | Partner admin, PWA and push, performance, Playwright tests, pilot fixes |
