# Going live with real data

The code, the database schema and the deployment are ready. Four settings can
only be entered in the Supabase and Vercel dashboards, because they hold
secrets or account settings. After that, the demo data switches off and the
site runs on the real backend.

## 1. Connect Supabase to Vercel (one click, no copying secrets)

Open https://vercel.com/integrations/supabase → **Add Integration** → choose
the **hth15** team and the **hub-to-hub-crm** project → link the existing
Supabase project **hubtohub12-devs's Project** → approve.

Supabase then copies the database connection (`POSTGRES_URL`) and the keys
(`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, …) into Vercel and keeps
them in sync. The app reads those names directly.

(Manual alternative: add `SUPABASE_DB_URL`, the Transaction pooler string on
port 6543, and `SUPABASE_SERVICE_ROLE_KEY` in Vercel → Settings → Environment
Variables, marked Sensitive.)

## 2. Supabase Auth: allow the site's address

Supabase → Authentication → **URL Configuration**:

- **Site URL**: `https://hub-to-hub-crm.vercel.app`
- **Redirect URLs**: add `https://hub-to-hub-crm.vercel.app/**`, plus each
  partner's custom domain later, for example `https://crm.partner.com/**`.

Without this, links in confirmation, reset and invite emails are rejected.

## 3. Supabase Auth: send email from your own domain

Supabase's built-in email only reaches members of your Supabase team and
sends a few emails an hour. For real users, set up a mail provider:

Authentication → **Emails** → SMTP Settings → enable custom SMTP. Use
credentials from a provider such as Resend, Postmark, SendGrid or Amazon SES,
with a sender address like `no-reply@yourdomain.com`.

The email templates under Authentication → Emails work as they are: their
links land on `/auth/callback`, which signs the person in.

## 4. Tell me when 1–3 are done

I'll then switch `NEXT_PUBLIC_API_MOCKING` to `off`, redeploy, and test the
whole flow on the live site: sign up, confirm email, create a workspace, add
leads, deals, follow-ups, branding, and invite a teammate.

## What works after go-live

- Sign up, sign in, forgot/reset password and invites by email. Sessions renew
  themselves, so idle users stay signed in.
- Every screen reads and writes the Supabase database: leads, deals,
  pipelines, follow-ups, notes, calls, imports, exports, reports and
  notifications.
- Settings: location (country, time zone, currency, date format, area unit,
  phone country), business phone, logo, browser icon, colours, font, app name
  and hidden modules, for each workspace and for the partner by default.
- WhatsApp inbox: incoming messages arrive through the Meta webhook at
  `/api/v1/webhooks/whatsapp` once a number is connected.

## Still needs a home

The background worker (`npm run worker`) sends reminders, overdue alerts,
automations and monthly billing. Vercel can't keep it running. Any always-on
host works, for example Railway, Render or Fly.io: same repository, start
command `npm run worker`, and the same `SUPABASE_DB_URL`.

## Google Calendar sync (optional)

Each user connects their own Google account in **Settings → Google Calendar**. Their follow-ups become
30-minute events with a 10-minute reminder; rescheduling updates the event, done adds "✓", cancel removes it,
reassign moves it to the new owner's calendar. Until the two keys below are set, the page says "not set up".

1. Go to https://console.cloud.google.com → create a project (e.g. "Hub to Hub CRM").
2. **APIs & Services → Library** → search "Google Calendar API" → **Enable**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding/Audience):
   - User type **External**, app name, support email.
   - Data access / scopes: add `.../auth/calendar.events`.
   - Audience: while in **Testing**, add every user's Gmail under **Test users** (max 100).
     To open it to everyone, click **Publish app** (Google may ask for verification of the calendar scope).
4. **Credentials → Create credentials → OAuth client ID** → type **Web application**.
   - Authorised redirect URI: `https://hub-to-hub-crm.vercel.app/api/v1/integrations/google/callback`
     (add one per custom domain, same path).
5. In Vercel → project **hub-to-hub-crm** → Settings → Environment Variables (Production), add
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from that client, then redeploy.

Refresh tokens are stored encrypted (AES-256-GCM). The key is `ENCRYPTION_KEY` if set, otherwise derived from
`SUPABASE_JWT_SECRET`. Set a dedicated `ENCRYPTION_KEY` (32 random bytes, base64) before real use; changing it
later means users reconnect Google.
