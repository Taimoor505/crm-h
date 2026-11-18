'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { generatePalette, parseHex } from '@/lib/theme/palette';
import type { Branding, ModuleKey } from '@/lib/api/types';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { PhoneInput, toPhoneValue } from './PhoneInput';

const MODULES: ModuleKey[] = ['leads', 'pipeline', 'follow_ups', 'inbox', 'reports'];

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <input type="color" aria-label={label} value={parseHex(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-11 w-14 cursor-pointer rounded-md border bg-white p-1" />
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 flex-1 font-mono" maxLength={7} />
      </div>
    </div>
  );
}

/**
 * Logo, favicon, app name, colors (live preview), support contacts and hidden
 * modules. Saving updates the whole app without a reload.
 */
export function BrandingEditor({ initial, onSave, saving, showModules = true }: { initial: Branding; onSave: (b: Partial<Branding>) => void; saving: boolean; showModules?: boolean }) {
  const t = useTranslations('settings.branding');
  const c = useTranslations('common');
  const m = useTranslations('modules');
  const [b, setB] = useState<Branding>(initial);
  const [wa, setWa] = useState(() => toPhoneValue(initial.supportWhatsapp ?? '', 'US'));
  const set = <K extends keyof Branding>(k: K, v: Branding[K]) => setB((x) => ({ ...x, [k]: v }));
  const palette = generatePalette(b.primaryColor, b.accentColor);
  const validColors = Boolean(parseHex(b.primaryColor)) && (!b.accentColor || Boolean(parseHex(b.accentColor)));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...b, supportWhatsapp: wa.e164 ?? null, accentColor: b.accentColor || null, logoUrl: b.logoUrl || null, faviconUrl: b.faviconUrl || null, supportEmail: b.supportEmail || null });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <SettingsCard>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="b-name">{t('appName')}</Label>
              <Input id="b-name" value={b.appName} onChange={(e) => set('appName', e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-logo-text">{t('logoText')}</Label>
              <Input id="b-logo-text" value={b.logoText} maxLength={3} onChange={(e) => set('logoText', e.target.value.toUpperCase())} className="h-11" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="b-tagline">{t('tagline')}</Label>
              <Input id="b-tagline" value={b.tagline} onChange={(e) => set('tagline', e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-logo">{t('logoUrl')}</Label>
              <Input id="b-logo" type="url" value={b.logoUrl ?? ''} onChange={(e) => set('logoUrl', e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-favicon">{t('faviconUrl')}</Label>
              <Input id="b-favicon" type="url" value={b.faviconUrl ?? ''} onChange={(e) => set('faviconUrl', e.target.value)} className="h-11" />
            </div>
            <ColorField id="b-primary" label={t('primary')} value={b.primaryColor} onChange={(v) => set('primaryColor', v)} />
            <ColorField id="b-accent" label={t('accent')} value={b.accentColor ?? ''} onChange={(v) => set('accentColor', v)} />
            <div className="space-y-1.5">
              <Label htmlFor="b-wa">{t('supportWhatsapp')}</Label>
              <PhoneInput id="b-wa" value={wa} onChange={setWa} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-email">{t('supportEmail')}</Label>
              <Input id="b-email" type="email" value={b.supportEmail ?? ''} onChange={(e) => set('supportEmail', e.target.value)} className="h-11" />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard title={t('preview')} className="h-fit">
          {/* Scoped preview: the palette only applies inside this box until saved. */}
          <div style={palette as React.CSSProperties} className="space-y-3 rounded-lg border bg-gray-50 p-3">
            <div className="flex items-center gap-2">
              {b.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logoUrl} alt="" className="size-9 rounded-lg object-contain" />
              ) : (
                <span className="grid size-9 place-items-center rounded-lg bg-brand font-heading text-sm font-bold text-on-brand">{b.logoText.slice(0, 2)}</span>
              )}
              <span className="font-heading text-sm font-semibold">{b.appName}</span>
            </div>
            <div className="rounded-md bg-brand-surface px-3 py-2 text-sm font-medium text-brand-ink">{m('home')}</div>
            <button type="button" tabIndex={-1} className="h-10 w-full rounded-md bg-brand text-sm font-semibold text-on-brand">
              {t('previewButton')}
            </button>
            <button type="button" tabIndex={-1} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-full bg-brand-accent text-sm font-semibold text-on-brand-accent">
              <Plus className="size-4" aria-hidden="true" />
              {t('previewAccent')}
            </button>
          </div>
        </SettingsCard>
      </div>

      {showModules && (
        <SettingsCard title={t('hideModules')} description={t('hideModulesHint')}>
          <div className="flex flex-wrap gap-4">
            {MODULES.map((mod) => (
              <label key={mod} className="flex min-h-10 items-center gap-2 text-sm">
                <Checkbox checked={b.hideModules.includes(mod)} onCheckedChange={(v) => set('hideModules', v === true ? [...b.hideModules, mod] : b.hideModules.filter((x) => x !== mod))} />
                {m(mod)}
              </label>
            ))}
          </div>
        </SettingsCard>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="h-11" onClick={() => setB(initial)}>
          {t('reset')}
        </Button>
        <Button type="submit" className="h-11 min-w-32" disabled={saving || !validColors || !b.appName.trim()}>
          {saving ? c('saving') : c('save')}
        </Button>
      </div>
    </form>
  );
}
