# Going live with real data

The code, the database schema and the deployment are ready. Four settings can
only be entered in the Supabase and Vercel dashboards, because they hold
secrets or account settings. After that, the demo data switches off and the
site runs on the real backend.

## 1. Vercel: add two secrets

Vercel → project **hub-to-hub-crm** → Settings → Environment Variables. Add
each one for Production and Preview and mark it Sensitive.

| Key | Where to find it in Supabase |
|---|---|
| `SUPABASE_DB_URL` | Project Settings → Database → Connection string → **Transaction pooler** (port 6543). Put in the database password. |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API Keys → **Secret key** (`sb_secret_…`). Used for team invites and logo uploads. |

These are optional, for WhatsApp and Meta later: `ENCRYPTION_KEY` (32 random
bytes, base64), `META_APP_SECRET`, `META_VERIFY_TOKEN`.

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
