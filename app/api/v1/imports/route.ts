import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { resolveActorContext } from '@/lib/taimoor/auth';
import { normalizePhoneToE164 } from '@/lib/taimoor/phone';
import { emitDomainEvent, saveState } from '@/lib/taimoor/store';

function autoGuessMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    const clean = h.trim().toLowerCase();
    if (['name', 'full name', 'client', 'contact', 'نام'].includes(clean)) {
      map[h] = 'name';
    } else if (
      ['mobile', 'phone', 'phone no', 'cell', 'whatsapp', 'number', 'فون', 'موبائل'].includes(
        clean
      )
    ) {
      map[h] = 'phone';
    } else if (['email', 'e-mail', 'ای میل'].includes(clean)) {
      map[h] = 'email';
    } else if (['source', 'lead source', 'ذریعہ'].includes(clean)) {
      map[h] = 'source';
    } else if (['status', 'اسٹیٹس'].includes(clean)) {
      map[h] = 'status';
    } else if (['tags', 'tag'].includes(clean)) {
      map[h] = 'tags';
    } else {
      map[h] = `custom.${clean.replace(/[^a-z0-9_]/g, '_')}`;
    }
  }
  return map;
}

export async function GET(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }
  const imports = auth.state.imports
    .filter((i) => i.workspace_id === auth.ctx.workspace.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return NextResponse.json({ data: imports });
}

export async function POST(req: NextRequest) {
  const auth = resolveActorContext(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.err.error }, { status: auth.err.status });
  }

  try {
    const { state, ctx } = auth;
    const contentType = req.headers.get('content-type') || '';

    let fileName = 'upload.csv';
    let duplicateStrategy: 'skip' | 'update' = 'skip';
    let providedMapping: Record<string, string> | null = null;
    let rawRows: Record<string, unknown>[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'Multipart file is required' }, { status: 400 });
      }
      fileName = file.name || 'upload.xlsx';
      duplicateStrategy =
        formData.get('duplicate_strategy') === 'update' ? 'update' : 'skip';
      const mappingStr = formData.get('mapping');
      if (typeof mappingStr === 'string' && mappingStr.trim()) {
        providedMapping = JSON.parse(mappingStr);
      }

      const buf = Buffer.from(await file.arrayBuffer());
      const workbook = XLSX.read(buf, { type: 'buffer' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: '',
      });
    } else {
      const body = await req.json();
      fileName = String(body?.file_name || 'inline_import.csv');
      duplicateStrategy = body?.duplicate_strategy === 'update' ? 'update' : 'skip';
      providedMapping =
        body?.mapping && typeof body.mapping === 'object' ? body.mapping : null;

      if (typeof body?.csv_text === 'string') {
        const workbook = XLSX.read(body.csv_text, { type: 'string' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
          defval: '',
        });
      } else if (Array.isArray(body?.rows)) {
        rawRows = body.rows;
      }
    }

    if (rawRows.length === 0) {
      return NextResponse.json({ error: 'No rows found in import payload' }, { status: 400 });
    }
    if (rawRows.length > 20000) {
      return NextResponse.json(
        { error: 'Maximum import limit is 20,000 rows per job' },
        { status: 413 }
      );
    }

    const headers = Object.keys(rawRows[0] || {});
    const mapping = providedMapping || autoGuessMapping(headers);
    const now = new Date().toISOString();

    let rowsOk = 0;
    let rowsFailed = 0;
    const errors: { row: number; phone?: string; reason: string }[] = [];
    const customDefs = state.custom_field_defs.filter(
      (d) => d.workspace_id === ctx.workspace.id && d.entity === 'contact'
    );
    const allowedCustomKeys = new Set(customDefs.map((d) => d.key));

    rawRows.forEach((raw, idx) => {
      const rowNum = idx + 1;
      let name = '';
      let rawPhone = '';
      let email: string | null = null;
      let source = 'import';
      let status = 'new';
      let tags: string[] = [];
      const custom: Record<string, unknown> = {};

      for (const [col, target] of Object.entries(mapping)) {
        const val = raw[col];
        if (val === undefined || val === null || String(val).trim() === '') continue;
        const str = String(val).trim();
        if (target === 'name') name = str;
        else if (target === 'phone') rawPhone = str;
        else if (target === 'email') email = str;
        else if (target === 'source') source = str;
        else if (target === 'status') status = str;
        else if (target === 'tags') {
          tags = str.split(/[,;]/).map((t) => t.trim()).filter(Boolean);
        } else if (target.startsWith('custom.')) {
          const cKey = target.slice('custom.'.length);
          if (allowedCustomKeys.has(cKey)) {
            custom[cKey] = str;
          }
        }
      }

      if (!name) {
        rowsFailed += 1;
        errors.push({ row: rowNum, phone: rawPhone, reason: 'Missing contact name' });
        return;
      }

      const norm = normalizePhoneToE164(rawPhone);
      if (!norm.valid || !norm.e164) {
        rowsFailed += 1;
        errors.push({
          row: rowNum,
          phone: rawPhone,
          reason: norm.error || 'Invalid phone number',
        });
        return;
      }

      const existing = state.contacts.find(
        (c) =>
          c.workspace_id === ctx.workspace.id &&
          c.phone_e164 === norm.e164 &&
          !c.deleted_at
      );

      if (existing) {
        if (duplicateStrategy === 'skip') {
          rowsFailed += 1;
          errors.push({
            row: rowNum,
            phone: norm.e164,
            reason: `Duplicate phone skipped (${norm.e164})`,
          });
          return;
        }
        existing.name = name;
        if (email) existing.email = email;
        if (tags.length > 0) existing.tags = Array.from(new Set([...existing.tags, ...tags]));
        existing.custom = { ...existing.custom, ...custom };
        existing.updated_at = now;
        rowsOk += 1;
        emitDomainEvent(state, ctx.workspace.id, 'contact.updated', {
          contact_id: existing.id,
          via: 'import',
        });
      } else {
        const newId = crypto.randomUUID();
        state.contacts.push({
          id: newId,
          workspace_id: ctx.workspace.id,
          name,
          phone_e164: norm.e164,
          alt_phone: null,
          email,
          company_id: null,
          source,
          owner_id: ctx.user.id,
          status,
          tags,
          custom,
          last_activity_at: now,
          updated_at: now,
          created_at: now,
          deleted_at: null,
        });
        rowsOk += 1;
        emitDomainEvent(state, ctx.workspace.id, 'contact.created', {
          contact_id: newId,
          via: 'import',
        });
      }
    });

    const jobId = crypto.randomUUID();
    const job = {
      id: jobId,
      workspace_id: ctx.workspace.id,
      file_url: `supabase://imports/${ctx.workspace.id}/${jobId}_${fileName}`,
      file_name: fileName,
      duplicate_strategy: duplicateStrategy,
      mapping,
      status: 'completed' as const,
      rows_ok: rowsOk,
      rows_failed: rowsFailed,
      error_report_url:
        rowsFailed > 0 ? `/api/v1/imports/${jobId}?format=error_csv` : null,
      errors: errors.slice(0, 200),
      created_at: now,
    };

    state.imports.unshift(job);
    saveState(state);

    return NextResponse.json({ import_job: job }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to parse import file' },
      { status: 400 }
    );
  }
}
