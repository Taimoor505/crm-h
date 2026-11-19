'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStartImport } from '@/hooks/queries/admin';
import { useFields } from '@/hooks/queries/crm';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { exportCsv } from '@/lib/api/endpoints/crm';
import { parsePhone } from '@/lib/phone';
import type { ImportJob } from '@/lib/api/types';
import { SettingsCard, SettingsPage } from '@/components/settings/SettingsCard';
import { CountryPicker } from '@/components/crm/CountryPicker';
import { Chip } from '@/components/crm/DuePicker';
import { cn, downloadText } from '@/lib/utils';

type Row = Record<string, string>;
const BASE_FIELDS = ['name', 'phone', 'email', 'source', 'tags'] as const;

/** Guesses the CRM field for a spreadsheet column header. */
function guess(header: string): string {
  const h = header.toLowerCase();
  if (/(^|\b)(name|full name|contact)\b/.test(h)) return 'name';
  if (/phone|mobile|cell|whatsapp|tel/.test(h)) return 'phone';
  if (/mail/.test(h)) return 'email';
  if (/source|channel/.test(h)) return 'source';
  if (/tag|label/.test(h)) return 'tags';
  return '';
}

async function readFile(file: File): Promise<{ headers: string[]; rows: Row[] }> {
  const XLSX = await import('xlsx');
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { headers, rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '').trim()]))) };
}

export default function ImportExportPage() {
  const t = useTranslations('settings.import');
  const n = useTranslations('settings');
  const s = useWorkspaceSettings();
  const fields = useFields();
  const start = useStartImport();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: Row[] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [country, setCountry] = useState(s.default_phone_country);
  const [strategy, setStrategy] = useState<'skip' | 'update'>('skip');
  const [result, setResult] = useState<ImportJob | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  const crmFields = [
    ...BASE_FIELDS.map((f) => ({ value: f, label: t(f) })),
    ...(fields.data ?? []).filter((f) => f.entity === 'contact').map((f) => ({ value: `custom.${f.key}`, label: f.label })),
  ];
  const colFor = (field: string) => Object.entries(mapping).find(([, f]) => f === field)?.[0];
  const ready = Boolean(colFor('name') && colFor('phone'));

  const preview = useMemo(() => {
    if (!file) return [];
    const nameCol = colFor('name');
    const phoneCol = colFor('phone');
    return file.rows.slice(0, 5).map((r, i) => {
      const phone = phoneCol ? parsePhone(r[phoneCol], country) : null;
      const error = !nameCol || !r[nameCol] ? t('missingName') : phoneCol && !phone?.ok ? t('invalidPhone') : null;
      return { row: i + 2, r, e164: phone?.ok ? phone.e164 : null, error };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, mapping, country]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    const parsed = await readFile(f);
    setFile({ name: f.name, ...parsed });
    setMapping(Object.fromEntries(parsed.headers.map((h) => [h, guess(h)])));
    setResult(null);
  }

  function runImport() {
    if (!file) return;
    const phoneCol = colFor('phone')!;
    // Send E.164 so the backend doesn't have to guess the country (brief §12.2).
    const rows = file.rows.map((r) => {
      const p = parsePhone(r[phoneCol], country);
      return p.ok ? { ...r, [phoneCol]: p.e164 } : r;
    });
    const apiMapping = Object.fromEntries(Object.entries(mapping).filter(([, f]) => f).map(([col, f]) => [f, col]));
    start.mutate(
      { rows, mapping: apiMapping, duplicate_strategy: strategy, file_name: file.name, phone_country: country },
      { onSuccess: (job) => setResult(job) },
    );
  }

  async function doExport(entity: 'contacts' | 'deals') {
    setExporting(entity);
    try {
      const r = await exportCsv(entity);
      downloadText(r.file_name, r.csv);
      toast.success(t('rows', { count: r.row_count }));
    } finally {
      setExporting(null);
    }
  }

  return (
    <SettingsPage title={n('nav.importExport')}>
      <SettingsCard title={t('title')}>
        <div className="space-y-5">
          <div>
            <input ref={input} type="file" accept=".csv,.xlsx,.xls,text/csv" className="sr-only" id="import-file" onChange={(e) => onFile(e.target.files?.[0])} />
            <label htmlFor="import-file" className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center hover:border-brand">
              {file ? <FileSpreadsheet className="size-6 text-brand-ink" aria-hidden="true" /> : <Upload className="size-6 text-gray-500" aria-hidden="true" />}
              <span className="text-sm font-medium">{file ? file.name : t('chooseFile')}</span>
              <span className="text-xs text-gray-500">{file ? t('rows', { count: file.rows.length }) : t('file')}</span>
            </label>
          </div>

          {file && (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('mapping')}</p>
                <div className="divide-y rounded-lg border">
                  {file.headers.map((h) => (
                    <div key={h} className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs">{h}</span>
                      <Select value={mapping[h] || 'skip'} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v === 'skip' ? '' : v }))}>
                        <SelectTrigger aria-label={`${t('field')}: ${h}`} className="h-10 w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">{t('skip')}</SelectItem>
                          {crmFields.map((f) => (
                            <SelectItem key={f.value} value={f.value} disabled={Boolean(colFor(f.value) && colFor(f.value) !== h)}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="import-country">{t('phoneCountry')}</Label>
                <CountryPicker id="import-country" value={country} onChange={setCountry} showDial={false} className="w-full justify-start sm:w-72" />
              </div>

              {ready && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('preview')}</p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-xs">
                      <tbody className="divide-y">
                        {preview.map((p) => (
                          <tr key={p.row} className={cn(p.error && 'bg-red-50')}>
                            <td className="px-3 py-2 text-gray-500 tabular-nums">{p.row}</td>
                            <td className="px-3 py-2 font-medium">{p.r[colFor('name')!]}</td>
                            <td className="px-3 py-2 font-mono tabular-nums">{p.e164 ?? p.r[colFor('phone')!]}</td>
                            <td className="px-3 py-2">{p.error ? <span className="font-medium text-red-700">{p.error}</span> : <CheckCircle2 className="size-4 text-green-700" aria-hidden="true" />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t('duplicates')}</legend>
                <div className="flex flex-wrap gap-2">
                  <Chip selected={strategy === 'skip'} onClick={() => setStrategy('skip')}>
                    {t('skipDup')}
                  </Chip>
                  <Chip selected={strategy === 'update'} onClick={() => setStrategy('update')}>
                    {t('updateDup')}
                  </Chip>
                </div>
              </fieldset>

              {!ready && <p className="text-sm text-amber-800">{t('needMapping')}</p>}
              {result ? (
                <div role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm">
                  <p className="font-semibold text-green-900">{t('result', { ok: result.rows_ok, failed: result.rows_failed })}</p>
                  {result.errors.length > 0 && (
                    <ul className="mt-2 max-h-40 space-y-0.5 overflow-auto text-xs text-red-800">
                      {result.errors.slice(0, 50).map((e) => (
                        <li key={`${e.row}-${e.reason}`}>{t('rowError', { row: e.row, reason: e.reason })}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <Button className="h-11" disabled={!ready || start.isPending} onClick={runImport}>
                  {start.isPending ? t('importing') : t('start', { count: file.rows.length })}
                </Button>
              )}
            </>
          )}
        </div>
      </SettingsCard>

      <SettingsCard title={t('exportTitle')}>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" disabled={exporting !== null} onClick={() => doExport('contacts')}>
            <Download className="size-4" aria-hidden="true" />
            {t('exportContacts')}
          </Button>
          <Button variant="outline" className="h-11" disabled={exporting !== null} onClick={() => doExport('deals')}>
            <Download className="size-4" aria-hidden="true" />
            {t('exportDeals')}
          </Button>
        </div>
      </SettingsCard>
    </SettingsPage>
  );
}
