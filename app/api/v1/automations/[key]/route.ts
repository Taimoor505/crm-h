import { z } from 'zod';
import { jsonb } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { automationByKey, effectiveSettings } from '@/server/automations/catalog';

const schema = z
  .object({ enabled: z.boolean().optional(), settings: z.record(z.string(), z.unknown()).optional() })
  .refine((b) => b.enabled !== undefined || b.settings !== undefined, { message: 'Nothing to update' });

/** Settings a rule needs before it can be switched on. */
const REQUIRED_TO_ENABLE: Record<string, (s: Record<string, unknown>) => string | null> = {
  welcome_message: (s) => (s.template_name ? null : 'Choose a WhatsApp template first'),
  stage_follow_up: (s) => ((s.stage_ids as unknown[]).length ? null : 'Choose at least one stage first'),
  won_notice: (s) => (s.send_thank_you && !s.template_name ? 'Choose a thank-you template, or turn the thank-you off' : null),
};

// PATCH /automations/:key (managers): toggle and/or change settings (merged).
export const PATCH = userRoute<{ key: string }>({ managerOnly: true }, async ({ req, tx, workspace, userId, params }) => {
  const def = automationByKey(params.key);
  if (!def) throw new ApiError(404, 'not_found', 'Unknown automation');
  const body = await readJson(req, schema);

  const [current] = await tx<{ enabled: boolean; settings: Record<string, unknown> }[]>`
    select enabled, settings from public.automations
     where workspace_id = ${workspace.id} and key = ${def.key} for update`;
  const merged = { ...effectiveSettings(def, current?.settings), ...(body.settings ?? {}) };
  const parsed = def.settings.safeParse(merged);
  if (!parsed.success) {
    throw new ApiError(422, 'validation_failed', 'Invalid settings', parsed.error.issues.map((i) => ({
      path: ['settings', ...i.path].join('.'), message: i.message,
    })));
  }
  const settings = parsed.data as Record<string, unknown>;
  const enabled = body.enabled ?? current?.enabled ?? false;
  const missing = enabled ? REQUIRED_TO_ENABLE[def.key]?.(settings) : null;
  if (missing) throw new ApiError(422, 'incomplete_settings', missing);

  await tx`
    insert into public.automations (workspace_id, key, enabled, settings, updated_by)
    values (${workspace.id}, ${def.key}, ${enabled}, ${jsonb(tx, settings)}::jsonb, ${userId})
    on conflict (workspace_id, key) do update set
      enabled = excluded.enabled, settings = excluded.settings, updated_by = excluded.updated_by, updated_at = now()`;
  return json({ data: { key: def.key, enabled, settings } });
});
