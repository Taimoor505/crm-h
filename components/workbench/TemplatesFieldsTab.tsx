'use client';

import React, { useState } from 'react';
import { Plus, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { TemplateKey } from '@/lib/taimoor/types';
import { InspectorPayload, UiLang } from './types';

interface Props {
  data: InspectorPayload;
  activeWorkspaceId: string;
  activeActorId: string;
  lang: UiLang;
  onWorkspaceCreated: (workspaceId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export default function TemplatesFieldsTab({
  data,
  activeWorkspaceId,
  activeActorId,
  lang,
  onWorkspaceCreated,
  onRefresh,
}: Props) {
  const [selectedTplKey, setSelectedTplKey] = useState<TemplateKey>('real_estate');
  const [newWsName, setNewWsName] = useState('');
  const [newWsLocale, setNewWsLocale] = useState<'en' | 'ur'>('en');
  const [creatingWs, setCreatingWs] = useState(false);
  const [wsResult, setWsResult] = useState<string | null>(null);

  // Add custom field form
  const [cfEntity, setCfEntity] = useState<'contact' | 'deal'>('contact');
  const [cfKey, setCfKey] = useState('');
  const [cfLabelEn, setCfLabelEn] = useState('');
  const [cfLabelUr, setCfLabelUr] = useState('');
  const [cfType, setCfType] = useState<'text' | 'number' | 'money' | 'date' | 'select' | 'phone'>('text');
  const [cfRequired, setCfRequired] = useState(false);
  const [cfStatus, setCfStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const selectedTemplate =
    data.industry_templates.find((t) => t.key === selectedTplKey) ||
    data.industry_templates[0];

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!newWsName.trim()) return;
    setCreatingWs(true);
    setWsResult(null);
    try {
      const res = await fetch('/api/v1/workspaces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sandbox-User-Id': activeActorId,
        },
        body: JSON.stringify({
          name: newWsName.trim(),
          template_key: selectedTplKey,
          locale: newWsLocale,
          seed_samples: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setWsResult(`Error ${res.status}: ${json.error}`);
      } else {
        setWsResult(
          `Provisioned "${json.workspace.name}" — cloned ${json.cloned.custom_fields} custom fields, ${json.cloned.stages} stages, ${json.cloned.sample_contacts} sample contacts.`
        );
        setNewWsName('');
        await onWorkspaceCreated(json.workspace.id);
      }
    } finally {
      setCreatingWs(false);
    }
  }

  async function handleAddCustomField(e: React.FormEvent) {
    e.preventDefault();
    setCfStatus(null);
    const res = await fetch('/api/v1/custom-fields', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': activeWorkspaceId,
        'X-Sandbox-User-Id': activeActorId,
      },
      body: JSON.stringify({
        entity: cfEntity,
        key: cfKey,
        label_en: cfLabelEn,
        label_ur: cfLabelUr || cfLabelEn,
        type: cfType,
        required: cfRequired,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setCfStatus({ ok: false, msg: json.error || 'Failed to add custom field' });
    } else {
      setCfStatus({
        ok: true,
        msg: `Added ${json.custom_field.entity}.${json.custom_field.key} (${json.custom_field.type})`,
      });
      setCfKey('');
      setCfLabelEn('');
      setCfLabelUr('');
      await onRefresh();
    }
  }

  return (
    <div className="space-y-6">
      {/* 5 Launch Industry Templates Selector & Cloner */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-base font-semibold text-slate-900">
            {lang === 'ur'
              ? '5 انڈسٹری ٹیمپلیٹس اور ورک اسپیس کلوننگ انجن'
              : '5 Launch Industry Templates & Workspace Cloner'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Each workspace receives an independent deep copy of pipelines, stages, custom_field_defs, and Pakistani bilingual sample records on creation.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {data.industry_templates.map((tpl) => {
            const active = tpl.key === selectedTplKey;
            return (
              <button
                key={tpl.id}
                onClick={() => setSelectedTplKey(tpl.key)}
                className={`text-left p-3.5 rounded-md border transition-colors ${
                  active
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 hover:bg-slate-50/70'
                }`}
              >
                <div className="font-mono text-[11px] text-slate-500">{tpl.key}</div>
                <div className="text-xs font-semibold text-slate-900 mt-1">
                  {lang === 'ur' ? tpl.name_ur : tpl.name_en}
                </div>
                <div className="text-[11px] text-slate-500 mt-1.5">
                  {tpl.definition.pipelines[0]?.stages.length || 0} stages ·{' '}
                  {tpl.definition.custom_fields.length} fields
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Template Details + Provision Form */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
          <div className="lg:col-span-7 space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  {selectedTemplate.name_en}
                </h3>
                <span className="text-sm font-urdu text-slate-700" dir="rtl">
                  {selectedTemplate.name_ur}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {lang === 'ur'
                  ? selectedTemplate.description_ur
                  : selectedTemplate.description_en}
              </p>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">
                Pipeline Stages ({selectedTemplate.definition.pipelines[0]?.name})
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedTemplate.definition.pipelines[0]?.stages.map((st, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-1.5 border border-slate-200 rounded-md bg-slate-50 text-xs"
                  >
                    <span className="font-medium text-slate-900">{st.name}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="font-mono text-[11px] text-slate-600">{st.kind}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">
                Template Custom Fields ({selectedTemplate.definition.custom_fields.length})
              </div>
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Entity · Key</th>
                      <th className="px-3 py-2 font-medium">Label (EN / اردو)</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedTemplate.definition.custom_fields.map((cf) => (
                      <tr key={`${cf.entity}.${cf.key}`}>
                        <td className="px-3 py-2 font-mono text-slate-900">
                          {cf.entity}.{cf.key}
                          {cf.required && <span className="text-red-500 ml-1">*</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {cf.label_en} · <span className="font-urdu">{cf.label_ur}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600">{cf.type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleCreateWorkspace}
            className="lg:col-span-5 border border-slate-200 rounded-md p-4 bg-slate-50/70 space-y-4"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Layers className="w-4 h-4 text-slate-600" />
              Provision Workspace from Template
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Business / Workspace Name
              </label>
              <input
                type="text"
                required
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                placeholder="e.g. Gulberg Heights Realty (گلبرگ ہائٹس)"
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Template Key
                </label>
                <input
                  type="text"
                  readOnly
                  value={selectedTplKey}
                  className="w-full px-3 py-2 text-xs font-mono bg-slate-100 border border-slate-200 rounded-md text-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Default Locale
                </label>
                <select
                  value={newWsLocale}
                  onChange={(e) => setNewWsLocale(e.target.value as 'en' | 'ur')}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-md"
                >
                  <option value="en">English (en)</option>
                  <option value="ur">Urdu (ur)</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={creatingWs}
              style={{ backgroundColor: 'var(--brand-primary)' }}
              className="w-full px-4 py-2 text-xs font-semibold text-white rounded-md hover:opacity-95 transition-opacity"
            >
              {creatingWs ? 'Cloning Template...' : 'POST /api/v1/workspaces'}
            </button>
            {wsResult && (
              <div className="text-xs text-slate-700 bg-white border border-slate-200 rounded p-2.5">
                {wsResult}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Active Workspace Custom Field Definitions & Live Creation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              Active Workspace <code className="font-mono">custom_field_defs</code> (
              {data.active_workspace_snapshot.custom_fields.length})
            </h3>
            <span className="text-xs text-slate-500">Validated on every write</span>
          </div>
          <div className="border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Entity</th>
                  <th className="px-3 py-2 font-medium">Key</th>
                  <th className="px-3 py-2 font-medium">English Label</th>
                  <th className="px-3 py-2 font-medium">Urdu Label</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.active_workspace_snapshot.custom_fields.map((f) => (
                  <tr key={f.id}>
                    <td className="px-3 py-2 font-mono text-slate-600">{f.entity}</td>
                    <td className="px-3 py-2 font-mono font-medium text-slate-900">
                      {f.key}
                      {f.required && <span className="text-red-500 ml-1">*</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-800">{f.label_en}</td>
                    <td className="px-3 py-2 font-urdu text-slate-800" dir="rtl">
                      {f.label_ur}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600">{f.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <form
          onSubmit={handleAddCustomField}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-lg p-5 space-y-3.5"
        >
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-slate-600" />
            Add Custom Field to Active Workspace
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Entity</label>
              <select
                value={cfEntity}
                onChange={(e) => setCfEntity(e.target.value as 'contact' | 'deal')}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
              >
                <option value="contact">contact</option>
                <option value="deal">deal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Field Type</label>
              <select
                value={cfType}
                onChange={(e) => setCfType(e.target.value as typeof cfType)}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md bg-white"
              >
                <option value="text">text</option>
                <option value="number">number</option>
                <option value="money">money (PKR)</option>
                <option value="date">date</option>
                <option value="select">select</option>
                <option value="phone">phone (E.164)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              JSONB Key (snake_case)
            </label>
            <input
              type="text"
              required
              value={cfKey}
              onChange={(e) => setCfKey(e.target.value)}
              placeholder="e.g. reference_broker"
              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                English Label
              </label>
              <input
                type="text"
                required
                value={cfLabelEn}
                onChange={(e) => setCfLabelEn(e.target.value)}
                placeholder="Reference Broker"
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Urdu Label (اردو)
              </label>
              <input
                type="text"
                dir="rtl"
                value={cfLabelUr}
                onChange={(e) => setCfLabelUr(e.target.value)}
                placeholder="ریفرنس بروکر"
                className="w-full px-3 py-1.5 text-xs font-urdu border border-slate-200 rounded-md"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={cfRequired}
              onChange={(e) => setCfRequired(e.target.checked)}
            />
            Required field on API write
          </label>
          <button
            type="submit"
            style={{ backgroundColor: 'var(--brand-primary)' }}
            className="w-full px-4 py-2 text-xs font-semibold text-white rounded-md hover:opacity-95"
          >
            POST /api/v1/custom-fields
          </button>
          {cfStatus && (
            <div
              className={`text-xs flex items-center gap-1.5 ${
                cfStatus.ok ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {cfStatus.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{cfStatus.msg}</span>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
