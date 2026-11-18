'use client';

import React, { useState } from 'react';
import { MessageSquare, Send, Shield, Activity as ActivityIcon, ExternalLink } from 'lucide-react';
import { InspectorPayload, UiLang } from './types';

interface Props {
  data: InspectorPayload;
  activeWorkspaceId: string;
  activeActorId: string;
  lang: UiLang;
  onRefresh: () => Promise<void>;
}

export default function WhatsappEventsTab({
  data,
  activeWorkspaceId,
  activeActorId,
  lang,
  onRefresh,
}: Props) {
  const contacts = data.active_workspace_snapshot.contacts;
  const [selectedContactId, setSelectedContactId] = useState(contacts[0]?.id || '');
  const [prefillText, setPrefillText] = useState(
    'السلام علیکم، آپ کی انکوائری کے حوالے سے رابطہ کر رہے ہیں۔'
  );
  const [clickResult, setClickResult] = useState<{ wa_url: string } | null>(null);

  const [webhookFrom, setWebhookFrom] = useState('0300-4455667');
  const [webhookBody, setWebhookBody] = useState(
    'جی ہاں، کل دوپہر 2 بجے کال پر بات ہو سکتی ہے۔'
  );
  const [webhookResult, setWebhookResult] = useState<string | null>(null);
  const [sendingWebhook, setSendingWebhook] = useState(false);

  const effectiveContactId =
    contacts.find((c) => c.id === selectedContactId)?.id || contacts[0]?.id || '';

  async function logClickToChat() {
    if (!effectiveContactId) return;
    const res = await fetch('/api/v1/whatsapp/click-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': activeWorkspaceId,
        'X-Sandbox-User-Id': activeActorId,
      },
      body: JSON.stringify({
        contact_id: effectiveContactId,
        prefill_text: prefillText,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setClickResult({ wa_url: json.wa_url });
      await onRefresh();
    }
  }

  async function simulateInboundWebhook() {
    setSendingWebhook(true);
    setWebhookResult(null);
    try {
      const waAccount = data.active_workspace_snapshot.whatsapp_accounts[0];
      const res = await fetch('/api/v1/webhooks/whatsapp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sandbox-Autosign': 'true',
        },
        body: JSON.stringify({
          phone_number_id: waAccount?.phone_number_id || '1059001',
          from: webhookFrom,
          wa_message_id: `wamid.sim.${Date.now()}`,
          body: webhookBody,
        }),
      });
      const json = await res.json();
      setWebhookResult(JSON.stringify(json, null, 2));
      await onRefresh();
    } finally {
      setSendingWebhook(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Phase A & Phase B WhatsApp Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Phase A Click-to-chat + Encrypted Account Meter */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-slate-600" />
              {lang === 'ur'
                ? 'فیز A: کلک ٹو چیٹ لاگر (wa.me)'
                : 'Phase A: Click-to-Chat Logger (POST /whatsapp/click-log)'}
            </h2>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Contact
              </label>
              <select
                value={effectiveContactId}
                onChange={(e) => setSelectedContactId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md bg-white"
              >
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone_e164})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Prefill Message (EN / اردو)
              </label>
              <textarea
                rows={2}
                dir="auto"
                value={prefillText}
                onChange={(e) => setPrefillText(e.target.value)}
                className="w-full p-2.5 text-xs border border-slate-200 rounded-md"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={logClickToChat}
                style={{ backgroundColor: 'var(--brand-primary)' }}
                className="px-4 py-2 text-xs font-semibold text-white rounded-md hover:opacity-95"
              >
                Generate wa.me Link & Log Activity
              </button>
              {clickResult && (
                <a
                  href={clickResult.wa_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-mono text-emerald-700 hover:underline flex items-center gap-1"
                >
                  Open wa.me <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Encrypted WhatsApp Accounts & Meter */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Workspace <code className="font-mono">whatsapp_accounts</code> (Encrypted Token & Metering)
            </h3>
            {data.active_workspace_snapshot.whatsapp_accounts.map((wa) => (
              <div
                key={wa.id}
                className="border border-slate-200 rounded-md p-3 text-xs space-y-1.5 bg-slate-50"
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="font-semibold text-slate-900">
                    phone_number_id: {wa.phone_number_id}
                  </span>
                  <span className="text-emerald-700">{wa.status}</span>
                </div>
                <div className="text-slate-600 font-mono text-[11px]">
                  token_ciphertext: {wa.token_encrypted_preview} (AES-256-GCM)
                </div>
                <div className="text-slate-700 tabular-nums">
                  Metered Template Messages Sent:{' '}
                  <strong className="font-mono">{wa.template_messages_sent}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Phase B Meta Cloud API Webhook Simulator */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Send className="w-4 h-4 text-slate-600" />
            Phase B: Meta Cloud API Inbound Webhook (POST /webhooks/whatsapp)
          </h2>
          <p className="text-xs text-slate-500">
            Verifies HMAC-SHA256 <code className="font-mono">X-Hub-Signature-256</code>, normalizes sender phone to E.164, threads into <code className="font-mono">conversations</code>, and emits <code className="font-mono">message.received</code>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Sender Phone (any format)
              </label>
              <input
                type="text"
                value={webhookFrom}
                onChange={(e) => setWebhookFrom(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono border border-slate-200 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Inbound Message (EN / اردو)
              </label>
              <input
                type="text"
                dir="auto"
                value={webhookBody}
                onChange={(e) => setWebhookBody(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-md"
              />
            </div>
          </div>

          <button
            onClick={simulateInboundWebhook}
            disabled={sendingWebhook}
            style={{ backgroundColor: 'var(--brand-primary)' }}
            className="px-4 py-2 text-xs font-semibold text-white rounded-md hover:opacity-95"
          >
            {sendingWebhook ? 'Dispatching Signed Webhook...' : 'Simulate Signed Inbound Webhook'}
          </button>

          {webhookResult && (
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-md text-xs font-mono overflow-x-auto max-h-56">
              {webhookResult}
            </pre>
          )}
        </div>
      </div>

      {/* Live Emitted Domain Events Outbox & Security Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ActivityIcon className="w-4 h-4 text-slate-600" />
              Shared Queue Outbox (<code className="font-mono">domain_events</code>)
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {data.domain_events.length} events
            </span>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {data.domain_events.map((evt) => (
              <div key={evt.id} className="py-2.5 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-emerald-700">
                    {evt.event_name}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    {new Date(evt.emitted_at).toLocaleTimeString()}
                  </span>
                </div>
                <pre className="text-[11px] font-mono text-slate-600 overflow-x-auto">
                  {JSON.stringify(evt.payload)}
                </pre>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-slate-600" />
              Security Audit Log (<code className="font-mono">audit_logs</code>)
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {data.audit_logs.length} entries
            </span>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {data.audit_logs.map((log) => (
              <div key={log.id} className="py-2.5 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-slate-900">
                    {log.action}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    {new Date(log.created_at).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-500">
                  {log.entity_type} · {JSON.stringify(log.meta)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
