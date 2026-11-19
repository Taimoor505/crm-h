'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { Facebook, Globe, KeyRound, Plug, Plus, RefreshCw, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLeadSourceMutations, useLeadSources } from '@/hooks/queries/admin';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { usePermissions } from '@/lib/permissions';
import { api } from '@/lib/api/client';
import type { LeadSource } from '@/lib/api/types';
import { SettingsCard, SettingsPage } from '@/components/settings/SettingsCard';
import { ResponsiveSheet } from '@/components/crm/ResponsiveSheet';
import { CopyField } from '@/components/crm/CopyField';
import { PhoneInput, toPhoneValue, type PhoneValue } from '@/components/crm/PhoneInput';
import { Chip } from '@/components/crm/DuePicker';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/crm/states';

const TYPE_ICONS = { website_form: Globe, webhook: Webhook, meta_leadgen: Facebook } as Record<string, typeof Globe>;
const CREATABLE = ['website_form', 'webhook', 'meta_leadgen'] as const;

export default function LeadSourcesPage() {
  const t = useTranslations('settings.leadSources');
  const n = useTranslations('settings');
  const sources = useLeadSources();
  const { canWrite } = usePermissions();
  const [adding, setAdding] = useState(false);
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null);

  return (
    <SettingsPage
      title={n('nav.leadSources')}
      actions={
        canWrite ? (
          <Button className="h-10" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t('add')}
          </Button>
        ) : undefined
      }
    >
      {sources.isLoading ? (
        <ListSkeleton rows={3} />
      ) : sources.isError ? (
        <ErrorState onRetry={() => sources.refetch()} />
      ) : !sources.data?.length ? (
        <SettingsCard>
          <EmptyState icon={<Plug className="size-6" />} title={t('empty')} body={t('emptyBody')} />
        </SettingsCard>
      ) : (
        sources.data.map((src) => <SourceCard key={src.id} source={src} secret={newSecret?.id === src.id ? newSecret.secret : null} onSecret={(secret) => setNewSecret({ id: src.id, secret })} />)
      )}
      {adding && <AddSourceSheet onClose={() => setAdding(false)} onCreated={(src) => src.secret && setNewSecret({ id: src.id, secret: src.secret })} />}
    </SettingsPage>
  );
}

function SourceCard({ source, secret, onSecret }: { source: LeadSource; secret: string | null; onSecret: (s: string) => void }) {
  const t = useTranslations('settings.leadSources');
  const m = useLeadSourceMutations();
  const { canWrite } = usePermissions();
  const Icon = TYPE_ICONS[source.type] ?? Plug;
  const typeLabel = (CREATABLE as readonly string[]).includes(source.type) || ['manual', 'whatsapp', 'import'].includes(source.type) ? t(source.type as 'webhook') : source.type;

  return (
    <SettingsCard>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-surface text-brand-ink" aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-base font-semibold">{source.name}</p>
          <p className="text-xs text-gray-600">
            {typeLabel} · <span className="font-mono">{source.source_label}</span>
          </p>
        </div>
        {canWrite && (
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
            {t('active')}
            <Switch checked={source.is_active} onCheckedChange={(v) => m.update.mutate({ id: source.id, is_active: v })} />
          </label>
        )}
      </div>

      {source.type === 'website_form' && source.embed_snippet && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium">{t('embed')}</p>
          <CopyField value={source.embed_snippet} label={t('copySnippet')} multiline />
          <TestForm publicKey={source.public_key} />
        </div>
      )}

      {source.type === 'webhook' && (
        <div className="mt-4 space-y-3">
          {source.endpoint_url && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t('endpoint')}</p>
              <CopyField value={source.endpoint_url} label={t('endpoint')} />
            </div>
          )}
          {secret && (
            <div className="space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-950">
                <KeyRound className="size-4" aria-hidden="true" />
                {t('secret')}
              </p>
              <CopyField value={secret} label={t('secret')} />
              <p className="text-xs text-amber-900">{t('secretOnce')}</p>
            </div>
          )}
          {canWrite && (
            <Button
              variant="outline"
              className="h-10"
              onClick={() =>
                m.update.mutate(
                  { id: source.id, rotate_secret: true },
                  {
                    onSuccess: (r) => {
                      if (r.secret) onSecret(r.secret);
                      toast.success(t('rotated'));
                    },
                  },
                )
              }
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              {t('rotate')}
            </Button>
          )}
        </div>
      )}
    </SettingsCard>
  );
}

/** Live test: posts to the public hook endpoint like the embedded form does. */
function TestForm({ publicKey }: { publicKey: string }) {
  const t = useTranslations('settings.leadSources');
  const s = useWorkspaceSettings();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState<PhoneValue>(() => toPhoneValue('', s.default_phone_country));
  const send = useMutation({
    mutationFn: () => api.post(`/hooks/leads/${publicKey}`, { name: name || t('testName'), phone: phone.e164, page_url: window.location.href }, { anonymous: true, workspaceId: false }),
    onSuccess: () => {
      toast.success(t('testSent'));
      setName('');
      setPhone(toPhoneValue('', s.default_phone_country));
    },
  });
  return (
    <details className="rounded-lg border p-3">
      <summary className="min-h-8 cursor-pointer text-sm font-medium">{t('testForm')}</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (phone.e164) send.mutate();
        }}
        className="mt-3 space-y-3"
      >
        <p className="text-xs text-gray-600">{t('testFormHint')}</p>
        <Input aria-label={t('name')} placeholder={t('testName')} value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        <PhoneInput value={phone} onChange={setPhone} />
        <Button type="submit" variant="outline" className="h-10" disabled={!phone.e164 || send.isPending}>
          {t('testSubmit')}
        </Button>
      </form>
    </details>
  );
}

function AddSourceSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (s: LeadSource) => void }) {
  const t = useTranslations('settings.leadSources');
  const m = useLeadSourceMutations();
  const [type, setType] = useState<(typeof CREATABLE)[number]>('website_form');
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [pageId, setPageId] = useState('');
  const [token, setToken] = useState('');
  const valid = name.trim() && (type !== 'meta_leadgen' || (pageId.trim() && token.trim()));
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('addTitle')}
      footer={
        <Button
          className="h-11 w-full"
          disabled={!valid || m.create.isPending}
          onClick={() =>
            m.create.mutate(
              { type, name: name.trim(), source_label: label.trim() || undefined, meta: type === 'meta_leadgen' ? { page_id: pageId.trim(), page_access_token: token.trim() } : undefined },
              {
                onSuccess: (src) => {
                  toast.success(t('created'));
                  onCreated(src);
                  onClose();
                },
              },
            )
          }
        >
          {t('add')}
        </Button>
      }
    >
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('type')}</legend>
          <div className="flex flex-wrap gap-2">
            {CREATABLE.map((x) => (
              <Chip key={x} selected={type === x} onClick={() => setType(x)}>
                {t(x)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="src-name">{t('name')}</Label>
          <Input id="src-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="src-label">{t('label')}</Label>
          <Input id="src-label" value={label} onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))} aria-describedby="src-label-hint" className="h-11 font-mono" />
          <p id="src-label-hint" className="text-xs text-gray-500">{t('labelHint')}</p>
        </div>
        {type === 'meta_leadgen' && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm text-gray-700">{t('metaHint')}</p>
            <div className="space-y-1.5">
              <Label htmlFor="src-page">{t('pageId')}</Label>
              <Input id="src-page" value={pageId} onChange={(e) => setPageId(e.target.value)} className="h-11 font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="src-token">{t('pageToken')}</Label>
              <Input id="src-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} className="h-11 font-mono" />
            </div>
          </div>
        )}
      </div>
    </ResponsiveSheet>
  );
}
