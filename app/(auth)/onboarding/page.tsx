'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowLeft, Briefcase, Building2, Check, Gavel, Home as HomeIcon, Plus, Stethoscope, Trash2, Truck, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTemplates } from '@/hooks/queries/admin';
import { useSession } from '@/lib/auth/SessionProvider';
import { useBranding } from '@/lib/theme/BrandingProvider';
import { createWorkspace } from '@/lib/api/endpoints/admin';
import { invite } from '@/lib/api/endpoints/crm';
import { regionFromCountry, type RegionSettings } from '@/lib/format';
import { isCountryCode } from '@/lib/phone';
import type { WorkspaceRole } from '@/lib/api/types';
import { RegionFields } from '@/components/crm/RegionFields';
import { PhoneInput, toPhoneValue, type PhoneValue } from '@/components/crm/PhoneInput';
import { StageBadge } from '@/components/crm/badges';
import { BootSplash } from '@/components/providers/AppProviders';
import { ErrorState } from '@/components/crm/states';
import { cn } from '@/lib/utils';

const ICONS: Record<string, typeof HomeIcon> = { real_estate: HomeIcon, law: Gavel, distributor: Truck, clinic: Stethoscope, agency: Briefcase, general: Building2 };
const ORDER = ['real_estate', 'law', 'distributor', 'clinic', 'agency', 'general'];

interface InviteRow {
  name: string;
  phone: PhoneValue;
  role: WorkspaceRole;
}

function guessCountry(): string {
  const region = typeof navigator !== 'undefined' ? navigator.language.split('-')[1] : undefined;
  return isCountryCode(region) ? region.toUpperCase() : 'US';
}

export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const c = useTranslations('common');
  const r = useTranslations('roles');
  const { session, hydrated, me, switchWorkspace } = useSession();
  const { branding } = useBranding();
  const router = useRouter();
  const qc = useQueryClient();
  const templates = useTemplates();

  const [step, setStep] = useState(1);
  const [templateKey, setTemplateKey] = useState('real_estate');
  const [name, setName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [region, setRegion] = useState<RegionSettings>(() => regionFromCountry('US'));
  const [mode, setMode] = useState<'solo' | 'team'>('solo');
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [nameError, setNameError] = useState(false);

  useEffect(() => setRegion(regionFromCountry(guessCountry())), []);
  useEffect(() => {
    if (hydrated && !session) router.replace('/login');
  }, [hydrated, session, router]);
  useEffect(() => {
    if (me?.user.name) setOwnerName((n) => n || me.user.name);
  }, [me?.user.name]);

  const create = useMutation({
    mutationFn: async () => {
      const ws = await createWorkspace({ name: name.trim(), template_key: templateKey, region, seed_samples: true, owner_name: ownerName || undefined });
      let sent = 0;
      for (const row of invites) {
        if (!row.name.trim() || !row.phone.e164) continue;
        await invite({ name: row.name.trim(), phone: row.phone.e164, role: row.role }).catch(() => null);
        sent++;
      }
      return { ws, sent };
    },
    onSuccess: ({ ws, sent }) => {
      qc.clear();
      switchWorkspace(ws.id);
      if (sent) toast.success(t('invitesSent', { count: sent }));
      router.replace('/home?samples=1');
    },
  });

  if (!hydrated || !session) return <BootSplash />;

  const sorted = [...(templates.data ?? [])].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const selected = sorted.find((x) => x.key === templateKey);
  const total = 3;

  return (
    <div className="min-h-dvh bg-white">
      <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          {step > 1 ? (
            <button type="button" onClick={() => setStep((s) => s - 1)} aria-label={c('back')} className="grid size-11 place-items-center rounded-full hover:bg-gray-100">
              <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden="true" />
            </button>
          ) : (
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-brand font-heading text-sm font-bold text-on-brand">
              {branding.logoText.slice(0, 2)}
            </span>
          )}
          <div className="flex-1">
            <p className="font-heading text-sm font-semibold">{t('title')}</p>
            <p className="text-xs text-gray-600">{t('step', { current: step, total })}</p>
          </div>
        </div>
        <div className="h-1 bg-gray-100" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label={t('step', { current: step, total })}>
          <div className="h-full bg-brand transition-all" style={{ width: `${(step / total) * 100}%` }} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-6 pb-32">
        {step === 1 && (
          <section className="space-y-5">
            <div>
              <h1 className="font-heading text-xl font-bold">{t('businessTitle')}</h1>
              <p className="mt-1 text-sm text-gray-600">{t('businessHint')}</p>
            </div>
            {templates.isError ? (
              <ErrorState onRetry={() => templates.refetch()} />
            ) : templates.isLoading ? (
              <p className="text-sm text-gray-600">{t('loadingTemplates')}</p>
            ) : (
              <div role="radiogroup" aria-label={t('businessTitle')} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {sorted.map((tpl) => {
                  const Icon = ICONS[tpl.key] ?? Building2;
                  const active = tpl.key === templateKey;
                  return (
                    <button
                      key={tpl.key}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setTemplateKey(tpl.key)}
                      className={cn('relative flex min-h-28 flex-col items-start gap-2 rounded-xl border-2 p-3 text-start transition-colors', active ? 'border-brand bg-brand-surface' : 'border-gray-200 hover:border-gray-300')}
                    >
                      <Icon className={cn('size-6', active ? 'text-brand-ink' : 'text-gray-700')} aria-hidden="true" />
                      <span className="font-heading text-sm font-semibold">{tpl.name}</span>
                      <span className="line-clamp-2 text-xs text-gray-600">{tpl.description}</span>
                      {active && <Check className="absolute end-2 top-2 size-4 text-brand-ink" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            )}
            {selected && (
              <div className="rounded-xl border bg-gray-50 p-4">
                <p className="text-sm font-semibold">{t('willCreate')}</p>
                <p className="mt-3 text-xs font-medium text-gray-600">{t('stages')}</p>
                {selected.pipelines.map((p) => (
                  <div key={p.name} className="mt-1.5">
                    <p className="text-xs text-gray-500">{p.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {p.stages.map((s) => (
                        <StageBadge key={s.name} name={s.name} kind={s.kind} />
                      ))}
                    </div>
                  </div>
                ))}
                <p className="mt-3 text-xs font-medium text-gray-600">{t('fields')}</p>
                <p className="mt-1 text-sm text-gray-800">{selected.custom_fields.map((f) => f.label).join(' · ')}</p>
              </div>
            )}
          </section>
        )}

        {step === 2 && (
          <section className="space-y-5">
            <div>
              <h1 className="font-heading text-xl font-bold">{t('regionTitle')}</h1>
              <p className="mt-1 text-sm text-gray-600">{t('regionHint')}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ws-name">{t('workspaceName')}</Label>
                <Input
                  id="ws-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameError(false);
                  }}
                  placeholder={t('workspaceNamePlaceholder')}
                  aria-invalid={nameError || undefined}
                  aria-describedby={nameError ? 'ws-name-err' : undefined}
                  className="h-11"
                />
                {nameError && <p id="ws-name-err" className="text-sm text-red-700">{t('nameRequired')}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-name">{t('yourName')}</Label>
                <Input id="owner-name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoComplete="name" className="h-11" />
              </div>
            </div>
            <RegionFields value={region} onChange={setRegion} idPrefix="onb" />
          </section>
        )}

        {step === 3 && (
          <section className="space-y-5">
            <h1 className="font-heading text-xl font-bold">{t('teamTitle')}</h1>
            <div role="radiogroup" aria-label={t('teamTitle')} className="grid gap-3 sm:grid-cols-2">
              {(['solo', 'team'] as const).map((m) => {
                const Icon = m === 'solo' ? User : Users;
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setMode(m);
                      if (m === 'team' && !invites.length) setInvites([{ name: '', phone: toPhoneValue('', region.default_phone_country), role: 'agent' }]);
                    }}
                    className={cn('flex items-start gap-3 rounded-xl border-2 p-4 text-start', active ? 'border-brand bg-brand-surface' : 'border-gray-200 hover:border-gray-300')}
                  >
                    <Icon className="mt-0.5 size-5 text-brand-ink" aria-hidden="true" />
                    <span>
                      <span className="block font-heading text-sm font-semibold">{m === 'solo' ? t('solo') : t('team')}</span>
                      <span className="block text-xs text-gray-600">{m === 'solo' ? t('soloHint') : t('teamHint')}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {mode === 'team' && (
              <div className="space-y-3">
                {invites.map((row, i) => (
                  <div key={i} className="space-y-3 rounded-xl border p-3">
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor={`inv-name-${i}`}>{t('inviteName')}</Label>
                        <Input id={`inv-name-${i}`} value={row.name} onChange={(e) => setInvites((rows) => rows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} className="h-11" />
                      </div>
                      <div className="w-36 space-y-1.5">
                        <Label htmlFor={`inv-role-${i}`}>{t('inviteRole')}</Label>
                        <Select value={row.role} onValueChange={(role) => setInvites((rows) => rows.map((x, k) => (k === i ? { ...x, role: role as WorkspaceRole } : x)))}>
                          <SelectTrigger id={`inv-role-${i}`} className="h-11 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="agent">{r('agent')}</SelectItem>
                            <SelectItem value="manager">{r('manager')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1 space-y-1.5">
                        <Label htmlFor={`inv-phone-${i}`}>{t('invitePhone')}</Label>
                        <PhoneInput id={`inv-phone-${i}`} value={row.phone} onChange={(phone) => setInvites((rows) => rows.map((x, k) => (k === i ? { ...x, phone } : x)))} />
                      </div>
                      <button type="button" aria-label={t('removeInvite')} onClick={() => setInvites((rows) => rows.filter((_, k) => k !== i))} className="grid size-11 place-items-center rounded-md border text-gray-600 hover:bg-gray-50">
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" className="h-11" onClick={() => setInvites((rows) => [...rows, { name: '', phone: toPhoneValue('', region.default_phone_country), role: 'agent' }])}>
                  <Plus className="size-4" aria-hidden="true" />
                  {t('addInvite')}
                </Button>
              </div>
            )}
            {create.isError && <ErrorState body={(create.error as Error).message} />}
          </section>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t bg-white px-4 py-3 pb-safe">
        <div className="mx-auto max-w-2xl">
          {step < total ? (
            <Button
              className="h-12 w-full text-base"
              disabled={step === 1 && !selected}
              onClick={() => {
                if (step === 2 && !name.trim()) {
                  setNameError(true);
                  return;
                }
                setStep((s) => s + 1);
              }}
            >
              {c('next')}
            </Button>
          ) : (
            <Button className="h-12 w-full text-base" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? t('creating') : t('create')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
