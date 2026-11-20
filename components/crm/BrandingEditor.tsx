'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { Check, ImageUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { contrastRatio, DEFAULT_SIDEBAR, generatePalette, parseHex, sidebarPalette } from '@/lib/theme/palette';
import { BrandImageError, prepareBrandImage } from '@/lib/theme/brand-image';
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
  const upload = useMutation({
    mutationFn: async (f: File) => uploadBrandImage(await prepareBrandImage(f, kind), kind, scope),
    onSuccess: (url) => onChange(url),
    meta: { silent: true },
  });
  const error = upload.error
    ? upload.error instanceof BrandImageError
      ? t(upload.error.reason === 'too_large' ? 'imageTooLarge' : upload.error.reason === 'unsupported' ? 'imageUnsupported' : 'imageUnreadable')
      : (upload.error as Error).message
    : null;
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
            accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml,image/x-icon"
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
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      </div>
    </div>
  );
}

/** Sidebar colour: presets (including two that follow the brand) or any hex. */
function SidebarField({ value, primary, onChange }: { value: string | null; primary: string; onChange: (v: string | null) => void }) {
  const t = useTranslations('settings.branding');
  const brand = generatePalette(primary);
  const options = [
    { key: 'default', label: t('sidebarDefault'), hex: null as string | null, swatch: DEFAULT_SIDEBAR },
    { key: 'midnight', label: t('sidebarMidnight'), hex: '#0F172A', swatch: '#0F172A' },
    { key: 'deep', label: t('sidebarDeepBrand'), hex: brand['--brand-ink'].toUpperCase(), swatch: brand['--brand-ink'] },
    { key: 'brand', label: t('sidebarBrand'), hex: brand['--brand-primary'].toUpperCase(), swatch: brand['--brand-primary'] },
    { key: 'light', label: t('sidebarLight'), hex: '#FFFFFF', swatch: '#FFFFFF' },
  ];
  const current = (value ?? '').toUpperCase();
  return (
    <div className="space-y-2">
      <Label htmlFor="b-sidebar">{t('sidebar')}</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('sidebar')}>
        {options.map((o) => {
          const on = o.hex === null ? !value : current === o.hex;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.hex)}
              aria-pressed={on}
              className={cn('flex min-h-11 items-center gap-2 rounded-[10px] border bg-white px-3 text-sm font-medium transition', on ? 'border-gray-900 ring-1 ring-gray-900' : 'hover:border-gray-300')}
            >
              <span aria-hidden="true" className="size-5 rounded-md border border-black/10" style={{ backgroundColor: o.swatch }} />
              {o.label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input type="color" aria-label={t('sidebarCustom')} value={parseHex(current) ? current : DEFAULT_SIDEBAR} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-11 w-14 cursor-pointer rounded-md border bg-white p-1" />
        <Input id="b-sidebar" placeholder={DEFAULT_SIDEBAR.toUpperCase()} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className="h-11 flex-1 font-mono uppercase" maxLength={7} aria-invalid={(Boolean(value) && !parseHex(value ?? '')) || undefined} />
      </div>
      <p className="text-xs text-gray-600">{t('sidebarHint')}</p>
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
  const validColors = Boolean(parseHex(b.primaryColor)) && (!b.accentColor || Boolean(parseHex(b.accentColor))) && (!b.sidebarColor || Boolean(parseHex(b.sidebarColor)));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          ...b, supportWhatsapp: wa.e164 ?? null, accentColor: b.accentColor || null, logoUrl: b.logoUrl || null,
          faviconUrl: b.faviconUrl || null, supportEmail: b.supportEmail || null, font: b.font || null, sidebarColor: b.sidebarColor || null,
        });
      }}
      className="space-y-4"
    >
      {scope === 'workspace' && <p className="text-sm text-gray-600">{t('inherits')}</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <SettingsCard title={t('sectionIdentity')}>
            <div className="space-y-5">
              <div className="grid gap-5 2xl:grid-cols-2">
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
              <div className="sm:col-span-2">
                <SidebarField value={b.sidebarColor} primary={b.primaryColor} onChange={(v) => set('sidebarColor', v)} />
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
          <div style={{ ...palette, ...sidebarPalette(b.sidebarColor), ...fontVars(b.font) } as React.CSSProperties} className="flex overflow-hidden rounded-xl border bg-gray-50 font-sans">
            <div className="w-[44%] space-y-1.5 bg-sidebar p-2.5 text-sidebar-fg">
              <div className="flex items-center gap-1.5 pb-1.5">
                {b.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logoUrl} alt="" className="size-7 rounded-md object-contain" />
                ) : (
                  <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand font-heading text-[11px] font-bold text-on-brand">{b.logoText.slice(0, 2)}</span>
                )}
                <span className="truncate font-heading text-xs font-semibold">{b.appName}</span>
              </div>
              <div className="relative rounded-md bg-sidebar-fg/10 px-2 py-1.5 text-xs font-semibold">
                <span aria-hidden="true" className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-brand" />
                {m('home')}
              </div>
              <div className="px-2 py-1 text-xs text-sidebar-fg/60">{m('leads')}</div>
              <div className="px-2 py-1 text-xs text-sidebar-fg/60">{m('pipeline')}</div>
              <div className="px-2 py-1 text-xs text-sidebar-fg/60">{m('reports')}</div>
            </div>
            <div className="flex-1 space-y-2.5 p-2.5">
              <div className="rounded-lg bg-brand-ink p-2.5 text-white">
                <div className="h-2 w-14 rounded-full bg-white/40" />
                <div className="mt-1.5 h-2.5 w-20 rounded-full bg-white/80" />
              </div>
              <div className="rounded-lg bg-brand-surface px-2.5 py-2 text-xs font-medium text-brand-ink">{m('follow_ups')}</div>
              <button type="button" tabIndex={-1} className="h-8 w-full rounded-md bg-brand text-xs font-semibold text-on-brand">
                {t('previewButton')}
              </button>
              <button type="button" tabIndex={-1} className="flex h-8 w-full items-center justify-center gap-1 rounded-full bg-brand-accent text-xs font-semibold text-on-brand-accent">
                <Plus className="size-3.5" aria-hidden="true" />
                {t('previewAccent')}
              </button>
            </div>
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
