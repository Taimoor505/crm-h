import { z } from 'zod';
import { json, userRoute } from '@/server/http';
import { AUTOMATIONS, effectiveSettings } from '@/server/automations/catalog';

/** JSON Schema of a rule's settings, so the frontend can render the form. */
function settingsSchema(s: z.ZodType) {
  return z.toJSONSchema(s, { io: 'input', unrepresentable: 'any' });
}

// GET /automations: the preset rules with their state, settings and last run.
export const GET = userRoute({}, async ({ tx, workspace }) => {
  const rows = await tx<{ key: string; enabled: boolean; settings: unknown; updated_at: Date }[]>`
    select key, enabled, settings, updated_at from public.automations where workspace_id = ${workspace.id}`;
  const last = await tx<{ automation_key: string; last_run_at: Date; runs_7d: number; failed_7d: number }[]>`
    select automation_key, max(created_at) as last_run_at,
           count(*) filter (where created_at > now() - interval '7 days')::int as runs_7d,
           count(*) filter (where created_at > now() - interval '7 days' and status = 'failed')::int as failed_7d
      from public.automation_runs where workspace_id = ${workspace.id}
     group by automation_key`;
  return json({
    data: AUTOMATIONS.map((def) => {
      const row = rows.find((r) => r.key === def.key);
      const stats = last.find((l) => l.automation_key === def.key);
      return {
        key: def.key,
        name: def.name,
        description: def.description,
        triggers: def.triggers,
        enabled: row?.enabled ?? false,
        settings: effectiveSettings(def, row?.settings),
        settings_schema: settingsSchema(def.settings),
        updated_at: row?.updated_at ?? null,
        last_run_at: stats?.last_run_at ?? null,
        runs_7d: stats?.runs_7d ?? 0,
        failed_7d: stats?.failed_7d ?? 0,
      };
    }),
  });
});
