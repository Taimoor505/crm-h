'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Code2,
  Database,
  Layers,
  FileSpreadsheet,
  MessageSquare,
  Download,
  RotateCcw,
  Menu,
  X,
} from 'lucide-react';
import { USER_IDS, WORKSPACE_IDS } from '@/lib/taimoor/constants';
import {
  InspectorPayload,
  ResolvedBrandingResponse,
  UI_COPY,
  UiLang,
  WorkbenchTab,
} from './types';
import OpenApiExplorerTab from './OpenApiExplorerTab';
import SchemaRlsTab from './SchemaRlsTab';
import TemplatesFieldsTab from './TemplatesFieldsTab';
import PhoneImportExportTab from './PhoneImportExportTab';
import WhatsappEventsTab from './WhatsappEventsTab';

interface Props {
  initialData: InspectorPayload;
  initialBranding: ResolvedBrandingResponse;
}

export default function WorkbenchShell({ initialData, initialBranding }: Props) {
  const [data, setData] = useState<InspectorPayload>(initialData);
  const [brandingInfo, setBrandingInfo] = useState<ResolvedBrandingResponse>(initialBranding);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(
    initialData.active_workspace_snapshot.workspace_id || WORKSPACE_IDS.REAL_ESTATE
  );
  const [activeActorId, setActiveActorId] = useState<string>(USER_IDS.OWNER);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('openapi');
  const [lang, setLang] = useState<UiLang>('en');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const refreshWorkspaceData = useCallback(
    async (targetWsId?: string) => {
      const wsId = targetWsId || activeWorkspaceId;
      const [inspRes, brandRes] = await Promise.all([
        fetch(`/api/v1/system/inspector?workspace_id=${encodeURIComponent(wsId)}`),
        fetch(`/api/v1/branding?workspace_id=${encodeURIComponent(wsId)}`),
      ]);
      if (inspRes.ok) {
        const inspJson: InspectorPayload = await inspRes.json();
        setData(inspJson);
      }
      if (brandRes.ok) {
        const brandJson: ResolvedBrandingResponse = await brandRes.json();
        setBrandingInfo(brandJson);
      }
    },
    [activeWorkspaceId]
  );

  // Sync white-label CSS variables whenever branding resolves
  useEffect(() => {
    const b = brandingInfo.branding;
    const root = document.documentElement;
    root.style.setProperty('--brand-primary', b.primaryColor || '#059669');
    root.style.setProperty('--brand-primary-hover', b.primaryHover || '#047857');
    root.style.setProperty('--brand-surface', b.surfaceTint || '#ecfdf5');
    root.style.setProperty('--brand-ink', b.inkColor || '#065f46');
  }, [brandingInfo]);

  async function handleWorkspaceChange(wsId: string) {
    setActiveWorkspaceId(wsId);
    await refreshWorkspaceData(wsId);
  }

  async function handleResetSeed() {
    setResetting(true);
    try {
      await fetch('/api/v1/system/inspector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_seed' }),
      });
      setActiveWorkspaceId(WORKSPACE_IDS.REAL_ESTATE);
      setActiveActorId(USER_IDS.OWNER);
      await refreshWorkspaceData(WORKSPACE_IDS.REAL_ESTATE);
    } finally {
      setResetting(false);
    }
  }

  const copy = UI_COPY[lang];
  const activeWorkspace =
    data.workspaces.find((w) => w.id === activeWorkspaceId) || data.workspaces[0];

  const navItems: { id: WorkbenchTab; label: string; icon: React.ReactNode }[] = [
    { id: 'openapi', label: copy.tabs.openapi, icon: <Code2 className="w-4 h-4" /> },
    { id: 'schema_rls', label: copy.tabs.schema_rls, icon: <Database className="w-4 h-4" /> },
    { id: 'templates', label: copy.tabs.templates, icon: <Layers className="w-4 h-4" /> },
    {
      id: 'import_export',
      label: copy.tabs.import_export,
      icon: <FileSpreadsheet className="w-4 h-4" />,
    },
    {
      id: 'whatsapp_events',
      label: copy.tabs.whatsapp_events,
      icon: <MessageSquare className="w-4 h-4" />,
    },
  ];

  const activeActor = data.users.find((u) => u.id === activeActorId);
  const activeMembership = data.memberships.find(
    (m) => m.user_id === activeActorId && m.workspace_id === activeWorkspaceId
  );
  const activeRoleLabel =
    activeActor?.partner_admin_of === activeWorkspace?.partner_id
      ? 'partner_admin'
      : activeMembership?.role || 'no_workspace_access';

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Dynamic White-Label Brand Block */}
      <div className="px-4 py-4 border-b border-slate-200 flex items-center gap-3">
        <div
          style={{ backgroundColor: 'var(--brand-primary)' }}
          className="w-9 h-9 rounded-md text-white font-mono font-bold text-xs flex items-center justify-center shrink-0"
        >
          {brandingInfo.branding.logoText || 'TC'}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {lang === 'ur'
              ? brandingInfo.branding.appNameUr || brandingInfo.branding.appName
              : brandingInfo.branding.appName}
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {brandingInfo.partner.name}
          </div>
        </div>
      </div>

      {/* Workspace & Actor Context Switchers */}
      <div className="p-4 border-b border-slate-200 space-y-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">
            {copy.workspaceLabel}
          </label>
          <select
            value={activeWorkspaceId}
            onChange={(e) => handleWorkspaceChange(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-slate-50 text-slate-900 focus:outline-none focus:border-slate-400"
          >
            {data.workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name} ({ws.template_key})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-slate-500 mb-1">
            {copy.actorLabel}
          </label>
          <select
            value={activeActorId}
            onChange={(e) => setActiveActorId(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-md bg-slate-50 text-slate-900 focus:outline-none focus:border-slate-400"
          >
            {data.users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <div className="text-[11px] font-mono text-slate-500 mt-1">
            Role: <span className="text-slate-800 font-semibold">{activeRoleLabel}</span>
          </div>
        </div>
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setMobileMenuOpen(false);
              }}
              style={
                active
                  ? {
                      backgroundColor: 'var(--brand-surface)',
                      color: 'var(--brand-ink)',
                    }
                  : undefined
              }
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                active ? 'font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {item.icon}
              <span className={lang === 'ur' ? 'font-urdu' : ''}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Compact Seed Reset & Persistence Info */}
      <div className="p-4 border-t border-slate-200 space-y-2.5 text-xs">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {data.db_status.supabaseConfigured
              ? copy.persistenceSupabase
              : copy.persistenceSandbox}
          </span>
          <span className="font-mono tabular-nums">
            {data.active_workspace_snapshot.contacts.length}c ·{' '}
            {data.active_workspace_snapshot.deals.length}d
          </span>
        </div>
        <button
          onClick={handleResetSeed}
          disabled={resetting}
          className="w-full px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {resetting ? '...' : copy.resetSeed}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50" dir={lang === 'ur' ? 'rtl' : 'ltr'}>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 h-full relative z-10">{sidebarContent}</div>
          <div
            className="flex-1 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, max 2 single-line controls on right */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="lg:hidden p-1.5 border border-slate-200 rounded-md text-slate-700"
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
              <span className="font-semibold text-slate-900 whitespace-nowrap">
                {brandingInfo.branding.appName}
              </span>
              <span aria-hidden="true">/</span>
              <span className="truncate">{activeWorkspace?.name}</span>
              <span aria-hidden="true">/</span>
              <span className="text-slate-900 font-medium whitespace-nowrap">
                {copy.tabs[activeTab]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center p-0.5 bg-slate-100 rounded-md border border-slate-200">
              <button
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  lang === 'en'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setLang('ur')}
                className={`px-2.5 py-1 text-xs font-urdu font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  lang === 'ur'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                اردو
              </button>
            </div>

            <a
              href="/api/v1/openapi.json"
              download="taimoor-openapi-v1.json"
              style={{ backgroundColor: 'var(--brand-primary)' }}
              className="px-3.5 py-1.5 text-xs font-semibold text-white rounded-md hover:opacity-95 transition-opacity flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              {copy.downloadSpec}
            </a>
          </div>
        </header>

        {/* Main Scrollable Workspace */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1280px] w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeTab === 'openapi' && (
                <OpenApiExplorerTab
                  data={data}
                  activeWorkspaceId={activeWorkspaceId}
                  activeActorId={activeActorId}
                  lang={lang}
                  onRefresh={() => refreshWorkspaceData()}
                />
              )}
              {activeTab === 'schema_rls' && (
                <SchemaRlsTab data={data} lang={lang} />
              )}
              {activeTab === 'templates' && (
                <TemplatesFieldsTab
                  data={data}
                  activeWorkspaceId={activeWorkspaceId}
                  activeActorId={activeActorId}
                  lang={lang}
                  onWorkspaceCreated={handleWorkspaceChange}
                  onRefresh={() => refreshWorkspaceData()}
                />
              )}
              {activeTab === 'import_export' && (
                <PhoneImportExportTab
                  data={data}
                  activeWorkspaceId={activeWorkspaceId}
                  activeActorId={activeActorId}
                  lang={lang}
                  onRefresh={() => refreshWorkspaceData()}
                />
              )}
              {activeTab === 'whatsapp_events' && (
                <WhatsappEventsTab
                  data={data}
                  activeWorkspaceId={activeWorkspaceId}
                  activeActorId={activeActorId}
                  lang={lang}
                  onRefresh={() => refreshWorkspaceData()}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
