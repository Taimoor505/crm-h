'use client';

import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Play, Copy, Check, Database } from 'lucide-react';
import { USER_IDS, WORKSPACE_IDS } from '@/lib/taimoor/constants';
import { InspectorPayload, UiLang } from './types';

interface Props {
  data: InspectorPayload;
  lang: UiLang;
}

interface RlsVerifyResponse {
  actor: { id: string; name: string; partner_admin_of: string | null };
  target_workspace: { id: string; name: string; partner_id: string };
  resolved_access: {
    is_member: boolean;
    membership_role: string | null;
    is_partner_admin_for_workspace: boolean;
    manager_or_owner_bypass: boolean;
  };
  table: string;
  total_rows_in_workspace: number;
  returned_rows_count: number;
  blocked_by_rls_count: number;
  returned_rows: Record<string, unknown>[];
  sql_executed: string;
  live_pg_verified: boolean;
}

export default function SchemaRlsTab({ data, lang }: Props) {
  const [actorId, setActorId] = useState<string>(USER_IDS.AGENT_1);
  const [targetWsId, setTargetWsId] = useState<string>(WORKSPACE_IDS.REAL_ESTATE);
  const [table, setTable] = useState<'contacts' | 'deals' | 'workspaces'>('contacts');
  const [running, setRunning] = useState(false);
  const [rlsResult, setRlsResult] = useState<RlsVerifyResponse | null>(null);

  const [domainFilter, setDomainFilter] = useState<string>('All');
  const [selectedTableName, setSelectedTableName] = useState<string>('contacts');
  const [copiedSqlId, setCopiedSqlId] = useState<string | null>(null);

  async function runRlsCheck(
    overrideActor?: string,
    overrideWs?: string,
    overrideTable?: 'contacts' | 'deals' | 'workspaces'
  ) {
    const a = overrideActor || actorId;
    const w = overrideWs || targetWsId;
    const t = overrideTable || table;
    if (overrideActor) setActorId(overrideActor);
    if (overrideWs) setTargetWsId(overrideWs);
    if (overrideTable) setTable(overrideTable);

    setRunning(true);
    try {
      const res = await fetch('/api/v1/rls/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor_user_id: a,
          target_workspace_id: w,
          table: t,
        }),
      });
      const json = await res.json();
      setRlsResult(json);
    } finally {
      setRunning(false);
    }
  }

  const domains = ['All', 'Multi-Tenancy', 'Templates & Fields', 'CRM Core', 'WhatsApp', 'Governance'];
  const visibleTables = data.schema_tables.filter(
    (t) => domainFilter === 'All' || t.domain === domainFilter
  );
  const activeTableDoc =
    data.schema_tables.find((t) => t.name === selectedTableName) || data.schema_tables[0];

  function copySql(id: string, sql: string) {
    navigator.clipboard.writeText(sql);
    setCopiedSqlId(id);
    setTimeout(() => setCopiedSqlId(null), 1600);
  }

  return (
    <div className="space-y-6">
      {/* Interactive RLS Verification Lab */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {lang === 'ur'
                ? 'ملٹی ٹیننٹ RLS اور رول آئسولیشن ٹیسٹر'
                : 'Multi-Tenant PostgreSQL RLS & Role Isolation Tester'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Verifies workspace membership, partner admin boundaries, and agent-level{' '}
              <code className="font-mono text-slate-700">owner_id = app.current_user_id()</code> enforcement.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                runRlsCheck(USER_IDS.AGENT_1, WORKSPACE_IDS.REAL_ESTATE, 'contacts')
              }
              className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 text-slate-700 whitespace-nowrap"
            >
              Test 1: Agent 1 Own Leads
            </button>
            <button
              onClick={() =>
                runRlsCheck(USER_IDS.LAW_OWNER, WORKSPACE_IDS.REAL_ESTATE, 'contacts')
              }
              className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 text-slate-700 whitespace-nowrap"
            >
              Test 2: Cross-Workspace Blocked
            </button>
            <button
              onClick={() =>
                runRlsCheck(USER_IDS.PARTNER_ADMIN, WORKSPACE_IDS.REAL_ESTATE, 'contacts')
              }
              className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 text-slate-700 whitespace-nowrap"
            >
              Test 3: Partner Support Read
            </button>
            <button
              onClick={() =>
                runRlsCheck(USER_IDS.PARTNER_ADMIN, WORKSPACE_IDS.LAW, 'contacts')
              }
              className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50 text-slate-700 whitespace-nowrap"
            >
              Test 4: Rival Partner Blocked
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Actor (app.current_user_id)
            </label>
            <select
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-slate-400"
            >
              {data.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Target Workspace
            </label>
            <select
              value={targetWsId}
              onChange={(e) => setTargetWsId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white focus:outline-none focus:border-slate-400"
            >
              {data.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.template_key})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              RLS Protected Table
            </label>
            <select
              value={table}
              onChange={(e) =>
                setTable(e.target.value as 'contacts' | 'deals' | 'workspaces')
              }
              className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-md bg-white focus:outline-none focus:border-slate-400"
            >
              <option value="contacts">public.contacts</option>
              <option value="deals">public.deals</option>
              <option value="workspaces">public.workspaces</option>
            </select>
          </div>

          <button
            onClick={() => runRlsCheck()}
            disabled={running}
            style={{ backgroundColor: 'var(--brand-primary)' }}
            className="px-4 py-2 text-xs font-semibold text-white rounded-md hover:opacity-95 transition-opacity flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            {running ? 'Verifying...' : 'Run RLS Query'}
          </button>
        </div>

        {rlsResult && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2 border-t border-slate-100">
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold">
                {rlsResult.returned_rows_count === 0 &&
                !rlsResult.resolved_access.is_member &&
                !rlsResult.resolved_access.is_partner_admin_for_workspace ? (
                  <span className="flex items-center gap-1.5 text-red-700">
                    <ShieldAlert className="w-4 h-4" />
                    ACCESS BLOCKED BY RLS · 0 ROWS RETURNED
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-emerald-700">
                    <ShieldCheck className="w-4 h-4" />
                    RLS ENFORCED · {rlsResult.returned_rows_count} OF{' '}
                    {rlsResult.total_rows_in_workspace} VISIBLE
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 text-center border border-slate-200 rounded-md p-3 bg-slate-50">
                <div>
                  <div className="text-[11px] text-slate-500">Workspace Rows</div>
                  <div className="text-lg font-mono font-semibold tabular-nums text-slate-900">
                    {rlsResult.total_rows_in_workspace}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Visible</div>
                  <div className="text-lg font-mono font-semibold tabular-nums text-emerald-700">
                    {rlsResult.returned_rows_count}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Blocked</div>
                  <div className="text-lg font-mono font-semibold tabular-nums text-red-600">
                    {rlsResult.blocked_by_rls_count}
                  </div>
                </div>
              </div>

              <pre className="p-3 bg-slate-900 text-slate-100 rounded-md text-[11px] font-mono overflow-x-auto">
                {rlsResult.sql_executed}
              </pre>
            </div>

            <div className="lg:col-span-7">
              <div className="text-xs font-medium text-slate-700 mb-2">
                Query Result Rows ({rlsResult.resolved_access.membership_role || (rlsResult.resolved_access.is_partner_admin_for_workspace ? 'partner_admin' : 'outsider')})
              </div>
              {rlsResult.returned_rows.length === 0 ? (
                <div className="p-8 border border-dashed border-slate-200 rounded-md text-center text-xs text-slate-500">
                  PostgreSQL RLS returned 0 rows. Unauthorized tenant or peer-agent records were filtered at the row policy layer.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-md overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        {Object.keys(rlsResult.returned_rows[0]).map((col) => (
                          <th key={col} className="px-3 py-2 font-mono font-medium">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rlsResult.returned_rows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/70">
                          {Object.values(row).map((val, cIdx) => (
                            <td
                              key={cIdx}
                              className="px-3 py-2 font-mono text-[11px] text-slate-800 truncate max-w-[180px]"
                            >
                              {String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* PostgreSQL 19-Table Schema Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Database className="w-4 h-4 text-slate-500" />
                PostgreSQL Tables ({data.schema_tables.length})
              </h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {domains.map((d) => (
                <button
                  key={d}
                  onClick={() => setDomainFilter(d)}
                  className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap ${
                    domainFilter === d
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
            {visibleTables.map((t) => (
              <button
                key={t.name}
                onClick={() => setSelectedTableName(t.name)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between transition-colors ${
                  activeTableDoc.name === t.name ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                }`}
              >
                <div>
                  <div className="font-mono text-xs font-semibold text-slate-900">
                    public.{t.name}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {t.domain} · {t.columns.length} cols
                  </div>
                </div>
                <span
                  className={`text-[10px] font-mono ${
                    t.rlsEnabled ? 'text-emerald-700 font-semibold' : 'text-slate-400'
                  }`}
                >
                  {t.rlsEnabled ? 'RLS ON' : 'GLOBAL'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-mono font-semibold text-slate-900">
                  public.{activeTableDoc.name}
                </h3>
                <p className="text-xs text-slate-600 mt-1">{activeTableDoc.rlsSummary}</p>
              </div>
              <div className="text-xs font-mono text-slate-500">
                {activeTableDoc.domain} · {activeTableDoc.rlsEnabled ? 'RLS Enabled' : 'Shared Reference'}
              </div>
            </div>

            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Column</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Constraint / Index</th>
                    <th className="px-3 py-2 font-medium">Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeTableDoc.columns.map((col) => (
                    <tr key={col.name} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 font-mono font-medium text-slate-900">
                        {col.name}
                        {!col.nullable && <span className="text-red-500 ml-0.5">*</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-600">{col.type}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-slate-700">
                        {col.key ? `${col.key}${col.references ? ` → ${col.references}` : ''}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{col.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Indexes: </span>
              <span className="font-mono">{activeTableDoc.indexes.join(' · ')}</span>
            </div>
          </div>

          {/* Supabase SQL Migration Pack */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Supabase PostgreSQL Migration Snippets (/supabase/migrations/)
            </h3>
            <div className="space-y-3">
              {data.migration_snippets.map((m) => (
                <div key={m.id} className="border border-slate-200 rounded-md p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-900">{m.title}</div>
                      <div className="text-[11px] text-slate-500">{m.summary}</div>
                    </div>
                    <button
                      onClick={() => copySql(m.id, m.sql)}
                      className="px-2.5 py-1 text-xs border border-slate-200 rounded hover:bg-slate-50 flex items-center gap-1 shrink-0"
                    >
                      {copiedSqlId === m.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      Copy SQL
                    </button>
                  </div>
                  <pre className="p-2.5 bg-slate-900 text-slate-100 rounded text-[11px] font-mono overflow-x-auto">
                    {m.sql}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
