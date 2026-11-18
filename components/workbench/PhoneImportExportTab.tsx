'use client';

import React, { useState } from 'react';
import { Phone, Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { InspectorPayload, UiLang } from './types';

interface Props {
  data: InspectorPayload;
  activeWorkspaceId: string;
  activeActorId: string;
  lang: UiLang;
  onRefresh: () => Promise<void>;
}

const SAMPLE_CSV = `Name,Mobile,Email,Source,Tags
Salman Rashid (سلمان رشید),0300-4455667,salman@example.pk,Zameen.com,"DHA Phase 8, Cash"
Nadia Jamil (نادیہ جمیل),3219876543,nadia@example.pk,Facebook Ad,"10 Marla"
Hammad Raza,+92 333 5544332,hammad@example.pk,WhatsApp,"Bahria"
Invalid Row,12345,bad@example.pk,Manual,""`;

export default function PhoneImportExportTab({
  data,
  activeWorkspaceId,
  activeActorId,
  lang,
  onRefresh,
}: Props) {
  const [phoneInput, setPhoneInput] = useState('0300-4455667');
  const [dupResult, setDupResult] = useState<string | null>(null);
  const [checkingPhone, setCheckingPhone] = useState(false);

  const [csvText, setCsvText] = useState(SAMPLE_CSV);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<'skip' | 'update'>('skip');
  const [importing, setImporting] = useState(false);
  const [importRes, setImportRes] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);

  async function runDuplicateCheck(override?: string) {
    const val = override ?? phoneInput;
    if (override) setPhoneInput(override);
    setCheckingPhone(true);
    try {
      const res = await fetch(
        `/api/v1/contacts/check-duplicate?phone=${encodeURIComponent(val)}`,
        {
          headers: {
            'X-Workspace-Id': activeWorkspaceId,
            'X-Sandbox-User-Id': activeActorId,
          },
        }
      );
      const json = await res.json();
      setDupResult(JSON.stringify(json, null, 2));
    } finally {
      setCheckingPhone(false);
    }
  }

  async function runImport() {
    setImporting(true);
    setImportRes(null);
    try {
      let res: Response;
      if (selectedFile) {
        const fd = new FormData();
        fd.append('file', selectedFile);
        fd.append('duplicate_strategy', strategy);
        res = await fetch('/api/v1/imports', {
          method: 'POST',
          headers: {
            'X-Workspace-Id': activeWorkspaceId,
            'X-Sandbox-User-Id': activeActorId,
          },
          body: fd,
        });
      } else {
        res = await fetch('/api/v1/imports', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Workspace-Id': activeWorkspaceId,
            'X-Sandbox-User-Id': activeActorId,
          },
          body: JSON.stringify({
            file_name: 'sample_pakistan_leads.csv',
            duplicate_strategy: strategy,
            csv_text: csvText,
          }),
        });
      }
      const json = await res.json();
      setImportRes(JSON.stringify(json, null, 2));
      await onRefresh();
    } finally {
      setImporting(false);
    }
  }

  async function runExport(entity: 'contacts' | 'deals') {
    setExporting(true);
    setExportNote(null);
    try {
      const res = await fetch('/api/v1/exports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Id': activeWorkspaceId,
          'X-Sandbox-User-Id': activeActorId,
        },
        body: JSON.stringify({ entity }),
      });
      const json = await res.json();
      if (res.ok && json.csv_content) {
        const blob = new Blob([json.csv_content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = json.file_name;
        a.click();
        URL.revokeObjectURL(url);
        setExportNote(
          `Exported ${json.row_count} ${entity} rows to ${json.file_name} (audit_logs updated).`
        );
        await onRefresh();
      } else {
        setExportNote(`Export error: ${json.error}`);
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Pakistani E.164 Phone Normalizer + Duplicate Check */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Phone className="w-4 h-4 text-slate-600" />
              {lang === 'ur'
                ? 'پاکستانی E.164 فون نارملائزیشن اور ڈپلیکیٹ چیک'
                : 'Pakistani E.164 Phone Normalizer & Duplicate Check'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Every local format (<code className="font-mono">0300-1234567</code>,{' '}
              <code className="font-mono">3001234567</code>,{' '}
              <code className="font-mono">+92 300 1234567</code>) normalizes to{' '}
              <code className="font-mono">+923001234567</code> and checks{' '}
              <code className="font-mono">(workspace_id, phone_e164)</code>.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['0300-4455667', '3004455667', '+92 300 4455667', '042-35761234'].map((ex) => (
              <button
                key={ex}
                onClick={() => runDuplicateCheck(ex)}
                className="px-2.5 py-1 text-xs font-mono border border-slate-200 rounded bg-slate-50 hover:bg-slate-100 text-slate-700"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="03XX-XXXXXXX or +92..."
            className="flex-1 px-3 py-2 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
          />
          <button
            onClick={() => runDuplicateCheck()}
            disabled={checkingPhone}
            style={{ backgroundColor: 'var(--brand-primary)' }}
            className="px-4 py-2 text-xs font-semibold text-white rounded-md hover:opacity-95 whitespace-nowrap"
          >
            {checkingPhone ? 'Checking...' : 'GET /contacts/check-duplicate'}
          </button>
        </div>

        {dupResult && (
          <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-md text-xs font-mono overflow-x-auto">
            {dupResult}
          </pre>
        )}
      </div>

      {/* Bulk CSV / XLSX Importer & Exporter */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-slate-600" />
                Bulk CSV / XLSX Import Engine (Up to 20,000 Rows)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Auto-maps common headers (Name, Mobile, Phone No, Cell), dedupes by E.164 phone, and generates error CSVs.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Upload .xlsx or .csv (optional)
              </label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-200 file:text-xs file:bg-slate-50 hover:file:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Duplicate Phone Strategy
              </label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as 'skip' | 'update')}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
              >
                <option value="skip">skip — Reject duplicate & log in error CSV</option>
                <option value="update">update — Merge & update existing contact</option>
              </select>
            </div>
          </div>

          {!selectedFile && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Inline CSV Preview (editable, UTF-8 Urdu supported)
              </label>
              <textarea
                rows={5}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
              />
            </div>
          )}

          <button
            onClick={runImport}
            disabled={importing}
            style={{ backgroundColor: 'var(--brand-primary)' }}
            className="px-4 py-2 text-xs font-semibold text-white rounded-md hover:opacity-95"
          >
            {importing ? 'Processing Import...' : 'POST /api/v1/imports'}
          </button>

          {importRes && (
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-md text-xs font-mono overflow-x-auto max-h-64">
              {importRes}
            </pre>
          )}
        </div>

        {/* Right: Import Job History + Data Ownership Exports */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Download className="w-4 h-4 text-slate-600" />
              Unrestricted Data Export (POST /api/v1/exports)
            </h3>
            <p className="text-xs text-slate-500">
              Data ownership is never blocked. Exports UTF-8 BOM CSV files and records a security audit entry.
            </p>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <button
                onClick={() => runExport('contacts')}
                disabled={exporting}
                className="px-3.5 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 text-slate-800 flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export Contacts CSV
              </button>
              <button
                onClick={() => runExport('deals')}
                disabled={exporting}
                className="px-3.5 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 text-slate-800 flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Export Deals CSV
              </button>
            </div>
            {exportNote && (
              <div className="text-xs text-emerald-700 flex items-center gap-1.5 pt-1">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{exportNote}</span>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Recent Import Jobs ({data.active_workspace_snapshot.imports.length})
            </h3>
            {data.active_workspace_snapshot.imports.length === 0 ? (
              <p className="text-xs text-slate-500">
                No import jobs executed yet in this workspace. Run an import to inspect mapping & error reports.
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {data.active_workspace_snapshot.imports.map((job) => (
                  <div key={job.id} className="py-2.5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-medium text-slate-900">
                        {job.file_name}
                      </span>
                      <span className="font-mono text-slate-500">{job.status}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-600 tabular-nums">
                      <span>
                        OK: <strong className="text-emerald-700">{job.rows_ok}</strong> · Failed:{' '}
                        <strong className="text-red-600">{job.rows_failed}</strong>
                      </span>
                      {job.error_report_url && (
                        <a
                          href={job.error_report_url}
                          className="text-red-700 hover:underline flex items-center gap-1 font-medium"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          Download Error CSV
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
