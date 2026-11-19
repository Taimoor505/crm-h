# Frontend QA against the definition of done

Checked against brief §11, on branch `frontend/crm-app` with the mock backend (`NEXT_PUBLIC_API_MOCKING=all`). The mock is seeded with the four test workspaces: US Realty, Dubai Homes, London Legal and Lahore Distributors.

**How each rule was checked:**
- Automated tests: the 7 Playwright flows in `e2e/flows.spec.ts` (at 360px and 1366px), plus 31 unit tests for formatting, phone and palette (`npm run test:web`).
- Manual review: screenshots at 360px and 1366px.
- Code review: the remaining rules.

**Legend:** ✅ pass · ⚠️ pass with a backend dependency (see `docs/frontend-endpoint-map.md`).

| Screen | 360px + desktop | 4 test workspaces | Rebrands | Loading / empty / error | Read-only | Roles | No hard-coded strings or colors | Real endpoint |
|---|---|---|---|---|---|---|---|---|
| Login | ✅ | ✅ phone picker, E.164 | ✅ by hostname | ✅ | n/a | n/a | ✅ | ⚠️ sandbox OTP (§12.7) |
| Onboarding | ✅ | ✅ region pre-fill | ✅ | ✅ | n/a | n/a | ✅ | ⚠️ templates, region (Missing) |
| Home | ✅ | ✅ money, times, today/overdue | ✅ | ✅ | ✅ hides Done/Add | ✅ Team today for managers only | ✅ | ✅ `/home/summary`, `/reports/agents` |
| Leads | ✅ virtualized, 1,200 rows | ✅ phone formats | ✅ | ✅ | ✅ hides bulk | ✅ owner filter for managers | ✅ | ✅ `/contacts` (bulk loops, no bulk endpoint) |
| Contact detail | ✅ | ✅ custom fields by type, area | ✅ | ✅ | ✅ hides actions | ✅ assign/merge for managers | ✅ | ✅ |
| Pipeline | ✅ kanban / stage tabs | ✅ compact totals | ✅ | ✅ | ✅ drag disabled | ✅ agents see own deals | ✅ | ⚠️ `value_pkr` (§12.3), `won_reason` |
| Follow-ups | ✅ | ✅ buckets in workspace timezone | ✅ | ✅ | ✅ | ✅ Team toggle for managers | ✅ | ✅ `/tasks` |
| Call outcome | ✅ | n/a | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ `/calls` + `/tasks/{id}/complete` |
| Inbox | ✅ two-pane on desktop | ✅ `wa.me` from E.164 | ✅ | ✅ | ✅ composer hidden | ✅ Mine/Unassigned for managers | ✅ | ⚠️ saved replies, templates, read (Missing) |
| Reports | ✅ | ✅ ranges in workspace timezone | ✅ charts use brand color | ✅ | n/a | ✅ agents see own numbers | ✅ | ⚠️ `*_pkr` (§12.3) |
| Notifications | ✅ page on mobile, popover on desktop | ✅ | ✅ | ✅ | ✅ allowed | ✅ | ✅ | ✅ |
| Settings (all 11 pages) | ✅ | ✅ region preview | ✅ live branding preview | ✅ | ✅ | ✅ gated per page | ✅ | ⚠️ region, reasons, stage delete (Missing) |
| Billing | ✅ | ⚠️ PKR from the API | ✅ | ✅ | ✅ stays usable | ✅ owners only | ✅ | ⚠️ `*_pkr` |
| Partner admin | ✅ | ✅ region per client | ✅ | ✅ | n/a | ✅ partner admins only | ✅ | ⚠️ domains list, `GET /partner/branding` (Missing) |
| Suspended | ✅ | n/a | ✅ | n/a | n/a | n/a | ✅ | ✅ |

## Performance (brief §10)

- **Home size:** `/home` first-load JS is 178 kB, against a 200 kB budget (`npm run build` output). Quick add, call outcome, search, Recharts, dnd-kit, the xlsx parser and the MSW handlers all load on demand.
- **Lists:** Leads is virtualized (TanStack Virtual). Follow-ups, notifications and the timeline are paginated.
- **PWA:** the service worker caches the app shell and the last-viewed lists. "Add lead" and "Add note" queue in IndexedDB while offline and sync on reconnect. The PWA registers only when mocks are off, because MSW needs the same service-worker scope.

## Not verified here

- **Lighthouse scores, install on a real Android device, and push delivery:** these need a production build against the real backend with VAPID keys.
- **Real-backend runs:** every Postgres route needs Supabase credentials, which aren't in the repo. Each screen has been run against the mock only. Real shapes are covered by the adapters in `lib/api/adapters.ts` and the type checks in `lib/api/contract.ts`.
