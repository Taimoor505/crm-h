import { z } from 'zod';
import { elevate } from '@/server/db';
import { ApiError, json, readJson, userRoute } from '@/server/http';
import { normalizePhone } from '@/server/core/phone';
import { createOrGetContact } from '@/server/core/contacts';
import { loadWorkspace } from '@/server/core/workspaces';

const MAX_ROWS = 2000;

const schema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1, 'No rows found in the file').max(MAX_ROWS, `Import up to ${MAX_ROWS} rows at a time`),
  /** field → column header: name, phone, email, source, status, tags, owner_email, custom.<key> */
  mapping: z.record(z.string(), z.string()).default({}),
  duplicate_strategy: z.enum(['skip', 'update']).default('skip'),
  file_name: z.string().max(200).default('import.csv'),
  phone_country: z.string().length(2).optional(),
});

/**
 * POST /imports: rows already parsed in the browser. Runs synchronously and
 * returns the finished job with a per-row error list.
 */
export const POST = userRoute({}, async ({ req, tx, workspace, userId, isManager }) => {
  const b = await readJson(req, schema);
  const ws = await loadWorkspace(tx, workspace.id);
  const m = b.mapping;
  const col = (r: Record<string, unknown>, field: string) => {
    const header = m[field] ?? field;
    const v = r[header];
    return v === undefined || v === null ? '' : String(v).trim();
  };
  const defs = await tx<{ key: string; type: string }[]>`
    select key, type from public.custom_field_defs where workspace_id = ${workspace.id} and entity = 'contact'`;
  const owners = isManager
    ? new Map((await tx<{ email: string; id: string }[]>`
        select lower(u.email) as email, u.id from public.memberships mm join public.users u on u.id = mm.user_id
         where mm.workspace_id = ${workspace.id} and mm.status = 'active'`).map((r) => [r.email, r.id]))
    : new Map<string, string>();
  await elevate(tx);
  const errors: { row: number; phone?: string; reason: string }[] = [];
  let ok = 0;
  for (const [i, r] of b.rows.entries()) {
    const rowNo = i + 2; // header is row 1
    const rawPhone = col(r, 'phone');
    const phone = normalizePhone(rawPhone, b.phone_country ?? ws.default_phone_country);
    const name = col(r, 'name');
    if (!phone) { errors.push({ row: rowNo, phone: rawPhone, reason: 'Invalid phone number' }); continue; }
    if (!name) { errors.push({ row: rowNo, phone, reason: 'Name is missing' }); continue; }
    const custom: Record<string, unknown> = {};
    for (const [field, header] of Object.entries(m)) {
      if (!field.startsWith('custom.')) continue;
      const key = field.slice(7);
      const def = defs.find((d) => d.key === key);
      const v = r[header];
      if (!def || v === undefined || v === null || v === '') continue;
      custom[key] = ['number', 'money', 'area'].includes(def.type) && !Number.isNaN(Number(v)) ? Number(v) : String(v);
    }
    const email = col(r, 'email') || null;
    const tags = col(r, 'tags').split(/[|;,]/).map((t) => t.trim()).filter(Boolean).slice(0, 30);
    const owner = owners.get(col(r, 'owner_email').toLowerCase()) ?? userId;
    const { contact, created } = await createOrGetContact(tx, {
      workspaceId: workspace.id, name, phoneE164: phone, email, source: col(r, 'source') || 'import',
      ownerId: owner, tags, custom,
    });
    if (!created) {
      if (b.duplicate_strategy !== 'update') { errors.push({ row: rowNo, phone, reason: 'Duplicate phone (skipped)' }); continue; }
      if (!isManager && contact.owner_id !== userId) { errors.push({ row: rowNo, phone, reason: 'Belongs to another agent (skipped)' }); continue; }
      await tx`
        update public.contacts set name = ${name}, email = coalesce(${email}, email),
               tags = (select array(select distinct unnest(tags || ${tags}::text[]))),
               custom = custom || ${tx.json(custom as never)}, updated_at = now()
         where id = ${contact.id}`;
    } else if (col(r, 'status')) {
      await tx`update public.contacts set status = ${col(r, 'status').toLowerCase().slice(0, 30)} where id = ${contact.id}`;
    }
    ok++;
  }
  const [job] = await tx`
    insert into public.imports (workspace_id, file_name, duplicate_strategy, mapping, status, rows_ok, rows_failed, errors)
    values (${workspace.id}, ${b.file_name}, ${b.duplicate_strategy}, ${tx.json(m)}, 'completed', ${ok}, ${errors.length},
            ${tx.json(errors.slice(0, 1000) as never)})
    returning *`;
  if (ok === 0 && errors.length === 0) throw new ApiError(422, 'empty_import', 'Nothing to import');
  return json({ import_job: job }, 201);
});
