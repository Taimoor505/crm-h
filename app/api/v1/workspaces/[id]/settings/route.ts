import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import {
  cleanBranding, loadWorkspace, mergeBranding, regionFromInput, regionOf, settingsOut,
} from '@/server/core/workspaces';
import { normalizePhone } from '@/server/core/phone';

type P = { id: string };
function sameWorkspace(params: P, wsId: string) {
  if (params.id !== wsId) throw new ApiError(400, 'workspace_mismatch', 'URL workspace does not match X-Workspace-Id');
}

// GET /workspaces/:id/settings: region, name, business phone, workspace branding overrides.
export const GET = userRoute<P>({ allowWhenReadOnly: true }, async ({ params, tx, workspace }) => {
  sameWorkspace(params, workspace.id);
  return json({ data: settingsOut(await loadWorkspace(tx, workspace.id)) });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  business_phone: z.string().max(30).nullable().optional(),
  branding: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

// PATCH /workspaces/:id/settings (owner/manager). Branding keys set to null fall back to the partner default.
export const PATCH = userRoute<P>({ managerOnly: true }, async ({ req, params, tx, workspace }) => {
  sameWorkspace(params, workspace.id);
  const b = await readJson(req, patchSchema);
  const current = await loadWorkspace(tx, workspace.id);
  const region = regionFromInput(b as Record<string, unknown>, regionOf(current));
  const branding = b.branding ? mergeBranding(current.branding, cleanBranding(b.branding)) : current.branding;
  let phone = current.business_phone;
  if (b.business_phone !== undefined) {
    phone = b.business_phone ? normalizePhone(b.business_phone, region.default_phone_country) : null;
    if (b.business_phone && !phone) throw new ApiError(422, 'invalid_phone', 'Business phone number is not valid');
  }
  await elevate(tx);
  await tx`
    update public.workspaces set
      name = ${b.name ?? current.name}, branding = ${tx.json(branding as never)}, business_phone = ${phone},
      country = ${region.country}, locale = ${region.locale}, currency = ${region.currency}, timezone = ${region.timezone},
      date_format = ${region.date_format}, time_format = ${region.time_format}, week_starts_on = ${region.week_starts_on},
      area_unit = ${region.area_unit}, default_phone_country = ${region.default_phone_country}
    where id = ${workspace.id}`;
  return json({ data: settingsOut(await loadWorkspace(tx, workspace.id)) });
});
