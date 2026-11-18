# Frontend rules

You are building the customer-facing frontend of a white-label, multi-country CRM inside the existing repo Hub-to-Hub/Crm.
Spec: docs/CRM_BRIEF.md (v3). Read it before every task. It wins over your assumptions.
Backend endpoint notes: docs/huzaifa-backend.md ("For Habib"), docs/for-taimoor.md, and the live spec at /api/v1/openapi.json.
Current endpoint status and deviations: docs/frontend-endpoint-map.md.

## Repo rules
- Next.js 15 App Router, React 19, TypeScript strict, Tailwind v4 (NO tailwind.config: tokens live in app/globals.css @theme).
- Do NOT modify app/api/**, server/**, worker/**, supabase/**, lib/taimoor/** or tests/** unless explicitly asked. If the frontend needs a backend change, write it to docs/frontend-backend-requests.md instead.
- Keep the developer workbench working; it lives at /dev/workbench (development or super-admin only).
- The repo has no src/ folder. Put new code in: app/(auth), app/(app), app/partner, app/dev, components/ui (shadcn), components/crm, components/layout, lib/api, lib/format, lib/phone, lib/theme, lib/permissions, lib/auth, hooks, messages/en.json.
- Already installed: motion, lucide-react. Fonts: Plus Jakarta Sans (headings) and DM Sans (body) via next/font. Don't add other UI or icon libraries.

## Product rules
- CRM only: leads, pipelines, follow-ups, WhatsApp inbox, reports. No accounting, inventory or invoicing.
- Phone first (design at 360px, then desktop). Touch targets at least 44px. Add a lead in under 10 seconds.
- UI words: Lead, Follow-up, Deal. The API calls follow-ups "tasks"; the UI always says "Follow-up".
- Bottom nav on mobile, stage tabs instead of kanban on mobile, bottom sheets for actions on mobile and dialogs on desktop.

## Language and localization (never break these)
- English only. NO user-facing string literals in components: everything goes in messages/en.json through next-intl.
- Use logical Tailwind classes (ms-, me-, ps-, pe-, start-, end-, text-start), never left/right.
- Money, numbers, dates, relative time and area only through lib/format, using the workspace locale, currency, timezone and area unit from useWorkspaceSettings(). Never write "$", "Rs", "AED", "PKR" or a date pattern in a component.
- Phones: input with the country picker; send E.164 to the API; display through lib/phone.
- Field labels for templates and custom fields come from the API. Never hard-code "Society", "Plot size" or similar.

## API rules
- Components never call fetch. Use the endpoint functions in lib/api and the TanStack Query hooks in hooks/queries (query keys in hooks/queries/keys.ts). Optimistic updates for: move deal, complete task, add note, assign.
- Every request goes through the session module in lib/auth. Sandbox tokens (taimoor_tok_*, x-sandbox-user-id) are allowed ONLY in development, behind lib/auth/dev-session.ts.
- Global errors: 401 → /login; 403 workspace_read_only → read-only banner and hide write actions; 403 workspace_suspended → /suspended.
- If an endpoint does not exist, add an MSW handler in mocks/ marked TODO, and add it to docs/frontend-endpoint-map.md under "Missing".

## Theming rules
- Brand colors only through CSS variables: --brand-primary, --brand-primary-hover, --brand-surface, --brand-ink, --brand-on-primary, --brand-accent, --brand-on-accent, mapped to Tailwind colors in @theme (bg-brand, text-brand-ink, bg-brand-surface, text-on-brand, bg-accent, text-on-accent).
- No brand hex values anywhere else. Neutrals come from Tailwind's gray scale.
- hide_modules removes nav items, and their routes redirect to /home.

## Permissions
- Roles: owner, manager, agent, partner_admin, super_admin (brief section 9). Use usePermissions() and <Can>. Hide what a role can't use; never show disabled buttons for permissions.

## Quality
- Every screen: skeleton, empty and error states, and a read-only state.
- Lists over 50 items: virtualized or paginated.
- Accessible: real <button>/<a>, labels on inputs, aria-label on icon-only buttons, contrast at least 4.5:1.
- Never add features or libraries that are not in the brief without asking first.
