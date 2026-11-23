# Frontend: what exists today

Snapshot of the frontend in `Hub-to-Hub/Crm` as of commit `59002ff` (2026-11-18).

> **Out of date (2026-11-23):** the sandbox store (`lib/taimoor/store.ts`), the developer workbench (`/dev/workbench`) and the `/system/inspector` and `/rls/verify` routes have been removed. Every route now runs on Postgres with Supabase auth. Sections below that mention them describe the earlier state.

## Summary

The repo has **no customer-facing CRM UI yet**. The only screen is a **developer workbench**, a single page at `/` titled "Taimoor Core — White-Label CRM Backend & Schema Explorer". Developers use it to try the backend: call API endpoints, test row-level security, create workspaces from templates, and simulate WhatsApp traffic.

Most of the repo is backend: about 65 API routes under `app/api/v1`, plus `server/`, `worker/` and `supabase/`. The real CRM screens (home, inbox, pipeline, billing and so on) still need to be built. See [What's missing](#whats-missing) below.

| Area | Files | Lines |
|---|---|---|
| Page and layout | `app/page.tsx`, `app/layout.tsx`, `app/globals.css` | ~190 |
| Workbench UI | `components/workbench/*` (7 files) | ~2,500 |
| Hooks and utils | `hooks/use-mobile.ts`, `lib/utils.ts` | ~25 |
| Public scripts | `public/embed/lead-form.js`, `public/push-sw.js` | ~125 |

## Stack

- **Next.js 15** (App Router) with **React 19** and TypeScript
- **Tailwind CSS v4**, configured through `@tailwindcss/postcss`; there is no `tailwind.config` file
- **motion** for tab transitions and **lucide-react** for icons
- Fonts from `next/font/google`: Plus Jakarta Sans (headings), DM Sans (body), JetBrains Mono (code), Noto Sans Arabic (Urdu)
- No component library and no global state library; each component manages its own state with `useState`

## Page structure

```
app/layout.tsx          fonts, metadata, <body>
└── app/page.tsx        server component (force-dynamic): reads the store, builds initial data
    └── WorkbenchShell  client component: sidebar, top bar, tab switching
        ├── OpenApiExplorerTab
        ├── SchemaRlsTab
        ├── TemplatesFieldsTab
        ├── PhoneImportExportTab
        └── WhatsappEventsTab
```

`app/page.tsx` reads `getState()` from `lib/taimoor/store.ts` on the server. It passes two objects to the shell: an `InspectorPayload` (partners, workspaces, users, memberships, templates, schema docs, endpoint catalog, and a snapshot of the active workspace) and the resolved branding. Both types are defined in `components/workbench/types.ts`.

## WorkbenchShell

`components/workbench/WorkbenchShell.tsx`

- **Sidebar:** brand block with logo text, app name and partner name; an **Active Workspace** dropdown; a **Sandbox Actor & Role** dropdown that shows the resolved role (`owner`, `agent`, `partner_admin` and so on); the five tab buttons; a persistence badge ("Supabase Live" or "Relational Sandbox") with contact and deal counts; and a **Reset Seed Data** button.
- **Top bar:** breadcrumb (App / Workspace / Tab), an **EN / اردو** toggle, and a **Download OpenAPI** button that links to `/api/v1/openapi.json`.
- **Responsive:** fixed sidebar at the `lg` breakpoint and above; a slide-in drawer on smaller screens.
- **White-label theming:** when branding resolves, the shell sets these CSS variables on `<html>`: `--brand-primary`, `--brand-primary-hover`, `--brand-surface`, `--brand-ink`. Defaults are emerald and live in `globals.css`.
- **Bilingual:** all UI text comes from `UI_COPY.en` / `UI_COPY.ur` in `types.ts`. Choosing Urdu sets `dir="rtl"` and applies the `.font-urdu` class.
- **Data refresh:** switching workspace, or any action in a tab, calls `GET /api/v1/system/inspector?workspace_id=…` and `GET /api/v1/branding?workspace_id=…`. Reset sends `POST /api/v1/system/inspector { action: 'reset_seed' }`.

## The five tabs

### 1. OpenAPI Explorer (`OpenApiExplorerTab.tsx`)
- Endpoint catalog from `lib/taimoor/openapi.ts`, with search and tag filter
- Request runner: path param, query string and JSON body editor; **Send Request** runs it against the live API as the selected actor and workspace
- Shows status, timing and the JSON response; a **copy as cURL** button
- Branding lookup by hostname, for example `karachi-proptech.crm.pk`, to test partner domain resolution

### 2. Schema & RLS Lab (`SchemaRlsTab.tsx`)
- **RLS isolation tester:** pick an actor, a target workspace and a table (`contacts`, `deals` or `workspaces`), then call `POST /api/v1/rls/verify` to see whether access is allowed or denied
- Browse the schema docs by domain, with columns for each table (from `lib/taimoor/sql-pack.ts`)
- Migration SQL snippets with a copy button

### 3. Templates & Fields (`TemplatesFieldsTab.tsx`)
- Industry templates: `real_estate`, `clinic`, `law`, `distributor`, `general`. Each shows its pipeline stages and preset custom fields, for example `society`, `plot_size` and `bayana_date` for real estate.
- **Create workspace** from a template, in English or Urdu (`POST /api/v1/workspaces`)
- **Add custom field** to a contact or deal, with a key, English and Urdu labels, a type (`text`, `number`, `money`, `date`, `select` or `phone`) and a required flag (`POST /api/v1/custom-fields`)

### 4. Phone & Import/Export (`PhoneImportExportTab.tsx`)
- Pakistani phone normalization and duplicate check, for example `0300-4455667` (`GET /api/v1/contacts/check-duplicate`)
- CSV import, either pasted or uploaded as a file, with a **skip** or **update** strategy for duplicates (`POST /api/v1/imports`)
- Export contacts or deals (`POST /api/v1/exports`)

### 5. WhatsApp & Events (`WhatsappEventsTab.tsx`)
- Click-to-chat: pick a contact and prefill text to get a `wa.me` link, which is also logged (`POST /api/v1/whatsapp/click-log`)
- Simulate an inbound WhatsApp webhook (`POST /api/v1/webhooks/whatsapp`)
- Conversation list for the workspace, plus feeds of domain events and audit logs

## Public scripts (served from `/public`)

- **`embed/lead-form.js`**: a drop-in script for customers' websites. Every `<form data-crm-lead-form>` on the page posts to `/api/v1/hooks/leads/{key}`. The script adds a honeypot field and captures `page_url`, `referrer`, the UTM parameters, `gclid` and `fbclid`. It supports `data-success` and `data-redirect` attributes.
  ```html
  <form data-crm-lead-form> <input name="name"> <input name="phone"> <button type="submit">Send</button> </form>
  <script src="https://<app>/embed/lead-form.js" data-key="ls_..." async></script>
  ```
- **`push-sw.js`**: web push handlers (`push` and `notificationclick`) for the future PWA service worker; load it with `importScripts('/push-sw.js')`. It refers to `/icon-192.png` and `/badge-72.png`, neither of which is in `public/` yet.

## Known caveats

- **The workbench runs against the sandbox store, not Postgres.** `lib/taimoor/store.ts` keeps state in memory and saves it to `/tmp/taimoor_core_state_v1.json`. Huzaifa's routes (leads, tasks, notifications, billing and so on) read and write Postgres directly, so data created in the workbench doesn't appear in those features, and vice versa. Details are in `docs/for-taimoor.md`, section 1.
- **There is no real login.** The actor dropdown sends sandbox identities: `taimoor_tok_<userId>` tokens or the `x-sandbox-user-id` header. Both must be replaced before launch.
- Branding colors only reach the shell. Each tab mostly uses fixed `slate` and `emerald` Tailwind classes.
- `hooks/use-mobile.ts` (`useIsMobile`) exists, but nothing uses it yet.
- There are no frontend tests; `tests/` covers the backend only.

## What's missing

These are the end-user screens. The backend for each already exists, and `docs/huzaifa-backend.md` ("For Habib") lists the endpoints.

| Screen | Endpoints |
|---|---|
| Login (phone OTP) | `POST /auth/otp/send`, `POST /auth/otp/verify` |
| Home dashboard | `GET /home/summary` (`?scope=team` for managers) |
| Contacts list and detail (timeline, notes, calls, merge, assign) | `/contacts/*` |
| Pipeline / deals board | `/pipelines`, `/deals`, `POST /deals/{id}/move` |
| Tasks | `/tasks`, `POST /tasks/{id}/complete` |
| Inbox / conversations | `/conversations`, `/conversations/{id}/messages` |
| Notification bell and settings, web push | `/notifications`, `/notification-settings`, `/push-subscriptions` |
| Lead sources (web form, webhook, Facebook lead ads) | `/lead-sources` |
| Assignment rules and availability | `/assignment-rules`, `/availability` |
| Automations | `/automations` (render forms from `settings_schema`) |
| Reports | `/reports/{sources,speed-to-lead,funnel,agents,won-value,lost-reasons}` |
| Team and invites | `/invites`, `/memberships`, `/workspaces/{id}/members` |
| Billing (partner and direct customer) | `/billing/*` |
| Partner admin (branding, domains, workspaces) | `/partner/*` |
| Super-admin console | `/admin/*` |
| Global error handling | `403 workspace_read_only` (show a "pay your invoice" banner), `403 workspace_suspended` |
