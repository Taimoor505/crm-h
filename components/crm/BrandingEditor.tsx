'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { Check, ImageUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { contrastRatio, generatePalette, parseHex } from '@/lib/theme/palette';
import { BRAND_FONTS, fontVars } from '@/lib/theme/fonts';
import { uploadBrandImage } from '@/lib/api/endpoints/admin';
import type { Branding, ModuleKey } from '@/lib/api/types';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { cn } from '@/lib/utils';
import { PhoneInput, toPhoneValue } from './PhoneInput';

const MODULES: ModuleKey[] = ['leads', 'pipeline', 'follow_ups', 'inbox', 'reports'];
// Suggested brand colours (all pass 4.5:1 with white text).
const PRESETS = ['#4F46E5', '#2563EB', '#0E7C66', '#15803D', '#C2410C', '#BE123C', '#7C3AED', '#18181B'];

function ColorField({ id, label, value, onChange, presets }: { id: string; label: string; value: string; onChange: (v: string) => void; presets?: boolean }) {
  const t = useTranslations('settings.branding');
  const valid = Boolean(parseHex(value));
  const readable = valid && contrastRatio(value, '#ffffff') >= 4.5;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {presets && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('presets')}>
          {PRESETS.map((hex) => {
            const on = value.toUpperCase() === hex;
            return (
              <button
                key={hex}
                type="button"
                onClick={() => onChange(hex)}
                aria-label={t('pickColor', { color: hex })}
                aria-pressed={on}
                style={{ backgroundColor: hex }}
                className={cn('grid size-11 place-items-center rounded-full ring-offset-2 transition', on ? 'ring-2 ring-gray-900' : 'hover:scale-105')}
              >
                {on && <Check className="size-4 text-white" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-2">
        <input type="color" aria-label={label} value={valid ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-11 w-14 cursor-pointer rounded-md border bg-white p-1" />
        <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} className="h-11 flex-1 font-mono uppercase" maxLength={7} aria-invalid={(value !== '' && !valid) || undefined} />
      </div>
      {presets && valid && <p className={cn('text-xs', readable ? 'text-emerald-700' : 'text-amber-700')}>{readable ? t('contrastOk') : t('contrastLow')}</p>}
    </div>
  );
}

function ImageField({ label, hint, value, onChange, kind, scope, square }: {
  label: string; hint: string; value: string | null; onChange: (v: string | null) => void;
  kind: 'logo' | 'favicon'; scope: 'workspace' | 'partner'; square?: boolean;
}) {
  const t = useTranslations('settings.branding');
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({ mutationFn: (f: File) => uploadBrandImage(f, kind, scope), onSuccess: (url) => onChange(url) });
  return (
    <div className="flex items-center gap-4">
      <div className={cn('grid shrink-0 place-items-center overflow-hidden border bg-gray-50', square ? 'size-12 rounded-lg' : 'size-16 rounded-2xl')}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className="size-full object-contain" />
        ) : (
          <ImageUp className="size-5 text-gray-400" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-gray-600">{hint}</p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
            className="sr-only"
            aria-label={label}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              e.target.value = '';
            }}
          />
          <Button type="button" variant="outline" className="h-11" disabled={upload.isPending} onClick={() => input.current?.click()}>
            {upload.isPending ? t('uploading') : value ? t('replace') : t('upload')}
          </Button>
          {value && (
            <Button type="button" variant="ghost" className="h-11 text-red-700 hover:text-red-800" onClick={() => onChange(null)}>
              <Trash2 className="size-4" aria-hidden="true" />
              {t('remove')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Logo, browser icon, app name, colours, font (live preview), support
 * contacts and hidden modules. Saving updates the whole app without a reload.
 */
export function BrandingEditor({ initial, onSave, saving, showModules = true, scope = 'workspace' }: {
  initial: Branding; onSave: (b: Partial<Branding>) => void; saving: boolean; showModules?: boolean; scope?: 'workspace' | 'partner';
}) {
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
        onSave({
          ...b, supportWhatsapp: wa.e164 ?? null, accentColor: b.accentColor || null, logoUrl: b.logoUrl || null,
          faviconUrl: b.faviconUrl || null, supportEmail: b.supportEmail || null, font: b.font || null,
        });
      }}
      className="space-y-4"
    >
      {scope === 'workspace' && <p className="text-sm text-gray-600">{t('inherits')}</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <SettingsCard title={t('sectionIdentity')}>
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <ImageField label={t('logo')} hint={t('logoHint')} value={b.logoUrl} onChange={(v) => set('logoUrl', v)} kind="logo" scope={scope} />
                <ImageField label={t('favicon')} hint={t('faviconHint')} value={b.faviconUrl} onChange={(v) => set('faviconUrl', v)} kind="favicon" scope={scope} square />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="b-name">{t('appName')}</Label>
                  <Input id="b-name" value={b.appName} onChange={(e) => set('appName', e.target.value)} className="h-11" maxLength={60} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="b-logo-text">{t('logoText')}</Label>
                  <Input id="b-logo-text" value={b.logoText} maxLength={3} onChange={(e) => set('logoText', e.target.value.toUpperCase())} className="h-11" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="b-tagline">{t('tagline')}</Label>
                  <Input id="b-tagline" value={b.tagline} onChange={(e) => set('tagline', e.target.value)} className="h-11" maxLength={160} />
                </div>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title={t('sectionColors')}>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <ColorField id="b-primary" label={t('primary')} value={b.primaryColor} onChange={(v) => set('primaryColor', v)} presets />
              </div>
              <ColorField id="b-accent" label={t('accent')} value={b.accentColor ?? ''} onChange={(v) => set('accentColor', v)} />
              <div className="space-y-1.5">
                <Label htmlFor="b-font">{t('font')}</Label>
                <select
                  id="b-font"
                  value={b.font ?? 'Plus Jakarta Sans'}
                  onChange={(e) => set('font', e.target.value === 'Plus Jakarta Sans' ? null : e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-white px-3 text-base md:text-sm"
                >
                  {BRAND_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f === 'Plus Jakarta Sans' ? t('fontDefault') : f === 'System' ? t('fontSystem') : f}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title={t('sectionSupport')}>
            <div className="grid gap-4 sm:grid-cols-2">
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
        </div>

        <SettingsCard title={t('preview')} className="h-fit lg:sticky lg:top-20">
          {/* Scoped preview: palette and font apply only inside this box until saved. */}
          <div style={{ ...palette, ...fontVars(b.font) } as React.CSSProperties} className="space-y-3 rounded-xl border bg-gray-50 p-3 font-sans">
            <div className="flex items-center gap-2">
              {b.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.logoUrl} alt="" className="size-9 rounded-lg object-contain" />
              ) : (
                <span className="grid size-9 place-items-center rounded-lg bg-brand font-heading text-sm font-bold text-on-brand">{b.logoText.slice(0, 2)}</span>
              )}
              <span className="font-heading text-sm font-semibold">{b.appName}</span>
            </div>
            <div className="rounded-lg bg-brand-surface px-3 py-2 text-sm font-medium text-brand-ink">{m('home')}</div>
            <div className="px-3 text-sm text-gray-700">{m('leads')}</div>
            <div className="px-3 text-sm text-gray-700">{m('pipeline')}</div>
            <button type="button" tabIndex={-1} className="h-10 w-full rounded-lg bg-brand text-sm font-semibold text-on-brand">
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
              <label key={mod} className="flex min-h-11 items-center gap-2 text-sm">
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
