<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/f3746cf0-1283-4747-9983-9535d99d915f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## CRM frontend

The customer-facing CRM (brief: [`docs/CRM_BRIEF.md`](docs/CRM_BRIEF.md)) is a Next.js App Router app with Tailwind v4, TanStack Query and next-intl (English only, every string in `messages/en.json`).

```bash
npm install
npm run dev          # http://localhost:3000 → /login
```

**Running without a database:** with no `SUPABASE_DB_URL`, the frontend runs against an in-browser fake backend (MSW) seeded with four test workspaces: US Realty, Dubai Homes, London Legal and Lahore Distributors. To sign in:

1. Enter one of the numbers below.
2. Use the code `482910`.

| Number | Who |
|---|---|
| `+1 212 555 0101` | Owner of all four test workspaces |
| `+1 212 555 0102` | Agent |
| `+971 50 123 4567` | Partner admin |

Any other number goes through onboarding. In development, the bug button in the bottom-left corner switches the user, the workspace and the workspace status (read-only, suspended). Mock modes and backend gaps are documented in [`docs/frontend-endpoint-map.md`](docs/frontend-endpoint-map.md).

| Command | What it does |
|---|---|
| `npm run typecheck` | TypeScript, including the API contract checks in `lib/api/contract.ts` |
| `npm run test:web` | Frontend unit tests (formatting, phone, palette) |
| `npm run test:e2e` | Playwright: the seven critical flows at 360px and desktop |
| `npm run gen:api` | Regenerate API types from both OpenAPI specs |

| Path | What's there |
|---|---|
| `/dev/tokens` | Design tokens and formatting for the four test workspaces |

QA status is in [`docs/frontend-qa.md`](docs/frontend-qa.md), and the changes the frontend needs from the backend are in [`docs/frontend-backend-requests.md`](docs/frontend-backend-requests.md).
