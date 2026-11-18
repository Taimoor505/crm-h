'use client';

import React, { useMemo, useState } from 'react';
import { Play, Search, Globe, Copy, Check } from 'lucide-react';
import { EndpointCatalogItem } from '@/lib/taimoor/openapi';
import { InspectorPayload, UiLang } from './types';

interface Props {
  data: InspectorPayload;
  activeWorkspaceId: string;
  activeActorId: string;
  lang: UiLang;
  onRefresh: () => Promise<void>;
}

const METHOD_STYLE: Record<EndpointCatalogItem['method'], string> = {
  GET: 'bg-sky-50 text-sky-700 border-sky-200',
  POST: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PATCH: 'bg-amber-50 text-amber-700 border-amber-200',
  DELETE: 'bg-red-50 text-red-700 border-red-200',
};

export default function OpenApiExplorerTab({
  data,
  activeWorkspaceId,
  activeActorId,
  lang,
  onRefresh,
}: Props) {
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointCatalogItem>(
    data.endpoints.find((e) => e.id === 'contacts-get') || data.endpoints[0]
  );

  const [pathParamId, setPathParamId] = useState('');
  const [queryText, setQueryText] = useState(selectedEndpoint.queryHint || '');
  const [bodyText, setBodyText] = useState(
    selectedEndpoint.sampleBody
      ? JSON.stringify(selectedEndpoint.sampleBody, null, 2)
      : ''
  );

  const [loading, setLoading] = useState(false);
  const [responseMeta, setResponseMeta] = useState<{
    status: number;
    durationMs: number;
    url: string;
    json: string;
  } | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Branding host tester state
  const [brandingHost, setBrandingHost] = useState('karachi-proptech.crm.pk');
  const [brandingResult, setBrandingResult] = useState<string | null>(null);

  const tags = useMemo(() => {
    const set = new Set(data.endpoints.map((e) => e.tag));
    return ['all', ...Array.from(set)];
  }, [data.endpoints]);

  const filteredEndpoints = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.endpoints.filter((ep) => {
      if (selectedTag !== 'all' && ep.tag !== selectedTag) return false;
      if (!q) return true;
      return (
        ep.path.toLowerCase().includes(q) ||
        ep.summary.toLowerCase().includes(q) ||
        ep.tag.toLowerCase().includes(q)
      );
    });
  }, [data.endpoints, search, selectedTag]);

  function hydrateSmartDefaults(ep: EndpointCatalogItem) {
    setSelectedEndpoint(ep);
    setQueryText(ep.queryHint || '');
    setResponseMeta(null);

    const snap = data.active_workspace_snapshot;
    const firstContact = snap.contacts[0];
    const secondContact = snap.contacts[1];
    const firstPipeline = snap.pipelines[0];
    const firstStage = snap.stages[0];
    const nextStage = snap.stages[1] || snap.stages[0];
    const firstDeal = snap.deals[0];
    const firstConv = snap.conversations[0];
    const firstMember = data.memberships.find(
      (m) => m.workspace_id === activeWorkspaceId
    );

    if (ep.path.includes('/workspaces/{id}')) {
      setPathParamId(activeWorkspaceId);
    } else if (ep.path.includes('/memberships/{id}')) {
      setPathParamId(firstMember?.id || '');
    } else if (ep.path.includes('/contacts/{id}')) {
      setPathParamId(firstContact?.id || '');
    } else if (ep.path.includes('/pipelines/{id}')) {
      setPathParamId(firstPipeline?.id || '');
    } else if (ep.path.includes('/deals/{id}')) {
      setPathParamId(firstDeal?.id || '');
    } else if (ep.path.includes('/conversations/{id}')) {
      setPathParamId(firstConv?.id || '');
    } else {
      setPathParamId('');
    }

    if (ep.sampleBody) {
      let hydrated = JSON.stringify(ep.sampleBody, null, 2);
      if (firstContact) {
        hydrated = hydrated.replace('<contact-uuid>', firstContact.id);
      }
      if (secondContact) {
        hydrated = hydrated.replace('<paste-secondary-contact-id>', secondContact.id);
      }
      if (firstPipeline) {
        hydrated = hydrated.replace('<pipeline-uuid>', firstPipeline.id);
      }
      if (firstStage) {
        hydrated = hydrated.replace('<stage-uuid>', firstStage.id);
      }
      if (nextStage) {
        hydrated = hydrated.replace('<target-stage-uuid>', nextStage.id);
      }
      setBodyText(hydrated);
    } else {
      setBodyText('');
    }
  }

  function buildTargetUrl(): string {
    let resolvedPath = selectedEndpoint.path;
    if (resolvedPath.includes('{id}')) {
      resolvedPath = resolvedPath.replace(
        '{id}',
        encodeURIComponent(pathParamId.trim() || 'missing-id')
      );
    }
    const cleanQuery = queryText.trim().replace(/^\?/, '');
    return cleanQuery ? `${resolvedPath}?${cleanQuery}` : resolvedPath;
  }

  async function executeRequest() {
    setLoading(true);
    const url = buildTargetUrl();
    const start = performance.now();
    try {
      const headers: Record<string, string> = {
        'X-Workspace-Id': activeWorkspaceId,
        'X-Sandbox-User-Id': activeActorId,
      };
      if (selectedEndpoint.path.includes('/webhooks/whatsapp')) {
        headers['X-Sandbox-Autosign'] = 'true';
      }

      const init: RequestInit = {
        method: selectedEndpoint.method,
        headers,
      };

      if (selectedEndpoint.method !== 'GET' && selectedEndpoint.method !== 'DELETE') {
        headers['Content-Type'] = 'application/json';
        init.body = bodyText || '{}';
      }

      const res = await fetch(url, init);
      const durationMs = Math.round(performance.now() - start);
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // Keep raw text
      }

      setResponseMeta({
        status: res.status,
        durationMs,
        url,
        json: pretty,
      });

      if (selectedEndpoint.method !== 'GET') {
        await onRefresh();
      }
    } catch (err: unknown) {
      setResponseMeta({
        status: 0,
        durationMs: Math.round(performance.now() - start),
        url,
        json: JSON.stringify(
          { error: err instanceof Error ? err.message : 'Network error' },
          null,
          2
        ),
      });
    } finally {
      setLoading(false);
    }
  }

  async function runBrandingLookup(hostToTest: string) {
    setBrandingHost(hostToTest);
    const res = await fetch(
      `/api/v1/branding?host=${encodeURIComponent(hostToTest)}`
    );
    const json = await res.json();
    setBrandingResult(JSON.stringify(json, null, 2));
  }

  function copyCurlCommand() {
    const url = buildTargetUrl();
    const bodyPart =
      selectedEndpoint.method !== 'GET' && bodyText
        ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${bodyText.replace(/\n/g, ' ')}'`
        : '';
    const cmd = `curl -X ${selectedEndpoint.method} "${window.location.origin}${url}" \\\n  -H "X-Workspace-Id: ${activeWorkspaceId}" \\\n  -H "X-Sandbox-User-Id: ${activeActorId}"${bodyPart}`;
    navigator.clipboard.writeText(cmd);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 1800);
  }

  return (
    <div className="space-y-6">
      {/* White-Label Branding Resolver Quick Strip */}
      <div className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {lang === 'ur'
                ? 'وائٹ لیبل ڈومین برانڈنگ ریزولور (بغیر لاگ ان)'
                : 'Unauthenticated White-Label Host Branding Resolver'}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              GET /api/v1/branding · Resolves request host via partner_domains → partner branding → workspace overrides.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.partner_domains.map((pd) => (
              <button
                key={pd.id}
                onClick={() => runBrandingLookup(pd.domain)}
                className={`px-3 py-1.5 text-xs font-mono border rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  brandingHost === pd.domain && brandingResult
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Globe className="w-3.5 h-3.5 inline mr-1.5" />
                {pd.domain}
              </button>
            ))}
          </div>
        </div>
        {brandingResult && (
          <pre className="mt-3 p-3 bg-slate-900 text-slate-100 rounded-md text-xs font-mono overflow-x-auto max-h-48">
            {brandingResult}
          </pre>
        )}
      </div>

      {/* Main Two-Pane OpenAPI Explorer + Live Runner */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Catalog */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  lang === 'ur'
                    ? 'اینڈ پوائنٹ تلاش کریں (مثلاً contacts, deals, whatsapp)...'
                    : 'Filter endpoints (e.g. contacts, deals, whatsapp)...'
                }
                className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    selectedTag === tag
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tag === 'all' ? `All (${data.endpoints.length})` : tag}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
            {filteredEndpoints.map((ep) => {
              const active = selectedEndpoint.id === ep.id;
              return (
                <button
                  key={ep.id}
                  onClick={() => hydrateSmartDefaults(ep)}
                  className={`w-full text-left px-4 py-3 transition-colors flex items-start gap-3 ${
                    active ? 'bg-slate-50' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <span
                    className={`px-1.5 py-0.5 text-[11px] font-mono font-semibold border rounded shrink-0 mt-0.5 ${
                      METHOD_STYLE[ep.method]
                    }`}
                  >
                    {ep.method}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-medium text-slate-900 truncate">
                      {ep.path}
                    </div>
                    <div
                      className={`text-xs text-slate-500 mt-0.5 ${
                        lang === 'ur' ? 'font-urdu text-right' : ''
                      }`}
                      dir={lang === 'ur' ? 'rtl' : 'ltr'}
                    >
                      {lang === 'ur' ? ep.summary_ur : ep.summary}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Live Request Runner */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <span
                  className={`px-2 py-0.5 text-xs font-mono font-semibold border rounded ${
                    METHOD_STYLE[selectedEndpoint.method]
                  }`}
                >
                  {selectedEndpoint.method}
                </span>
                <code className="text-sm font-mono font-semibold text-slate-900">
                  {selectedEndpoint.path}
                </code>
              </div>
              <p
                className={`text-sm text-slate-600 ${
                  lang === 'ur' ? 'font-urdu' : ''
                }`}
                dir={lang === 'ur' ? 'rtl' : 'ltr'}
              >
                {lang === 'ur'
                  ? selectedEndpoint.summary_ur
                  : selectedEndpoint.summary}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-1">
                <span>{selectedEndpoint.tag}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {selectedEndpoint.authRequired ? 'Bearer + RLS Scoped' : 'Public / Signed'}
                </span>
                {selectedEndpoint.emits.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-700">
                      Emits: {selectedEndpoint.emits.join(', ')}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={copyCurlCommand}
                className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                {copiedCurl ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                cURL
              </button>
              <button
                onClick={executeRequest}
                disabled={loading}
                style={{ backgroundColor: 'var(--brand-primary)' }}
                className="px-4 py-2 text-xs font-semibold text-white rounded-md hover:opacity-95 transition-opacity flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
              >
                <Play className="w-3.5 h-3.5" />
                {loading
                  ? lang === 'ur'
                    ? 'جاری ہے...'
                    : 'Running...'
                  : lang === 'ur'
                  ? 'ریکویسٹ بھیجیں'
                  : 'Send Request'}
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
            <span className="font-semibold text-slate-800">RLS & Contract Rule: </span>
            {selectedEndpoint.rlsRule}
          </div>

          {/* Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {selectedEndpoint.path.includes('{id}') && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Path Parameter <code className="font-mono">{'{id}'}</code>
                </label>
                <input
                  type="text"
                  value={pathParamId}
                  onChange={(e) => setPathParamId(e.target.value)}
                  placeholder="UUID from active workspace"
                  className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
                />
              </div>
            )}
            <div className={selectedEndpoint.path.includes('{id}') ? '' : 'md:col-span-2'}>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Query String (optional)
              </label>
              <input
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                placeholder="limit=10&q=Tariq"
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
              />
            </div>
          </div>

          {/* Request JSON Body */}
          {selectedEndpoint.method !== 'GET' && selectedEndpoint.method !== 'DELETE' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-700">
                  JSON Payload (UTF-8 English & اردو supported)
                </label>
                <span className="text-[11px] font-mono text-slate-400">
                  application/json
                </span>
              </div>
              <textarea
                rows={7}
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
              />
            </div>
          )}

          {/* Response Output */}
          <div className="border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-800">Response</span>
              {responseMeta && (
                <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                  <span
                    className={`font-semibold ${
                      responseMeta.status >= 200 && responseMeta.status < 300
                        ? 'text-emerald-700'
                        : responseMeta.status >= 400
                        ? 'text-red-600'
                        : 'text-slate-600'
                    }`}
                  >
                    HTTP {responseMeta.status}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{responseMeta.durationMs} ms</span>
                </div>
              )}
            </div>

            {!responseMeta ? (
              <div className="p-6 text-center border border-dashed border-slate-200 rounded-md text-xs text-slate-500">
                Click <strong>Send Request</strong> to execute this endpoint against the active workspace and actor context.
              </div>
            ) : (
              <pre className="p-3.5 bg-slate-900 text-slate-100 rounded-md text-xs font-mono overflow-x-auto max-h-80 leading-relaxed">
                {responseMeta.json}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
