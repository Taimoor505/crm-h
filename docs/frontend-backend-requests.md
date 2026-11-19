# Backend requests from the frontend

For Taimoor and Huzaifa. Brief §12 plus what came up while building the screens. Each item is already handled on the frontend with an adapter or an MSW mock (`mocks/handlers/missing.ts`). Full details are in `docs/frontend-endpoint-map.md`.

## New endpoints (currently mocked)

| Endpoint | Used by | Owner |
|---|---|---|
| `GET/PATCH /workspaces/{id}/settings` (region + workspace branding) | Everything that formats; Settings → Workspace, Branding | Taimoor |
| `GET /templates` | Onboarding, partner "new workspace" | Taimoor |
| `POST /workspaces/{id}/clear-samples` | Sample data banner | Taimoor |
| `GET/PUT /pipelines/{id}/reasons` | Won/Lost reason sheet, Settings → Pipelines | Taimoor |
| `DELETE /pipelines/{id}/stages/{stageId}?move_to=` | Settings → Pipelines | Taimoor |
| `GET /whatsapp/saved-replies`, `GET /whatsapp/templates`, `POST /conversations/{id}/read` | Inbox | Taimoor |
| `GET /partner/branding`, `GET /partner/domains`, `DELETE /partner/domains/{id}` | Partner area | Taimoor |
| `POST /contacts/bulk` | Leads bulk actions (today one request per lead) | Taimoor |

## Changes to existing endpoints

1. **Money as `*_minor` + `currency`** on deals, home, reports and billing (brief §12.3).
2. **International phones:** `normalizePhoneToE164(input, country)`. Today the sandbox rejects non-Pakistani E.164 numbers (brief §12.2).
3. **Deals list:** join `contact { id, name, phone_e164 }` and `next_task_due_at`. `POST /deals/{id}/move` should also store `won_reason`.
4. **`/me`:** add `is_super_admin`.
5. **Branding:** add `accentColor`, `supportEmail`, `hideModules`, `logoUrl` and `faviconUrl` (brief §12.8).
6. **Custom field type `area`:** the templates' `size` field is stored in square feet and shown in the workspace unit.
7. **One error shape** (brief §12.9), **real sessions from OTP** (brief §12.7), and **one data store** (brief §12.6).
