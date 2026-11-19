'use client';

import { useMemo, useState } from 'react';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isDevToolsEnabled } from '@/lib/dev-tools';
import { contrastRatio, generatePalette } from '@/lib/theme/palette';
import { formatArea, formatDate, formatMoney, formatRelative, formatTime, regionFromCountry } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { StageBadge, StatusBadge } from '@/components/crm/badges';

const TEST = [
  { name: 'US Realty', country: 'US', phone: '+12125550123' },
  { name: 'Dubai Homes', country: 'AE', phone: '+971501234567' },
  { name: 'London Legal', country: 'GB', phone: '+447700900123' },
  { name: 'Lahore Distributors', country: 'PK', phone: '+923001234567' },
];

/** Development only: design tokens, rebranding and formatting for the four test workspaces. */
export default function TokensPage() {
  if (!isDevToolsEnabled()) notFound();
  return <Tokens />;
}

function Tokens() {
  const t = useTranslations('dev');
  const [primary, setPrimary] = useState('#059669');
  const [accent, setAccent] = useState('#f97316');
  const [ws, setWs] = useState(0);
  const palette = useMemo(() => generatePalette(primary, accent), [primary, accent]);
  const region = regionFromCountry(TEST[ws].country);
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 65 * 60_000);

  return (
    <main style={palette as React.CSSProperties} className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <h1 className="font-heading text-2xl font-bold">{t('tokens')}</h1>

      <section className="grid gap-4 sm:grid-cols-3">
        <label className="space-y-1.5 text-sm font-medium">
          <span className="block">{t('primary')}</span>
          <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="h-11 w-full rounded border" />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          <span className="block">{t('accent')}</span>
          <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="h-11 w-full rounded border" />
        </label>
        <label className="space-y-1.5 text-sm font-medium">
          <span className="block">{t('testWorkspace')}</span>
          <select value={ws} onChange={(e) => setWs(Number(e.target.value))} className="h-11 w-full rounded border px-2">
            {TEST.map((w, i) => (
              <option key={w.name} value={i}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold">{t('palette')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.entries(palette).map(([k, v]) => (
            <div key={k} className="overflow-hidden rounded-lg border">
              <div className="h-14" style={{ background: v }} />
              <p className="px-2 py-1.5 font-mono text-[11px]">
                {k}
                <br />
                {v}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 font-mono text-xs text-gray-600">
          on-primary {contrastRatio(palette['--brand-on-primary'], palette['--brand-primary']).toFixed(2)}:1 · ink/surface {contrastRatio(palette['--brand-ink'], palette['--brand-surface']).toFixed(2)}:1
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">{t('buttons')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button className="h-11">{t('primaryButton')}</Button>
          <Button variant="outline" className="h-11">{t('outlineButton')}</Button>
          <Button variant="ghost" className="h-11">{t('ghostButton')}</Button>
          <button type="button" className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-accent px-5 font-semibold text-on-brand-accent shadow-float">
            <Plus className="size-4" aria-hidden="true" />
            {t('accentButton')}
          </button>
        </div>
        <h2 className="pt-3 font-heading text-lg font-semibold">{t('badges')}</h2>
        <div className="flex flex-wrap gap-2">
          {['new', 'contacted', 'qualified', 'hot', 'cold'].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
          <StageBadge name="Open" kind="open" />
          <StageBadge name="Won" kind="won" />
          <StageBadge name="Lost" kind="lost" />
        </div>
        <h2 className="pt-3 font-heading text-lg font-semibold">{t('cards')}</h2>
        <div className="max-w-sm rounded-xl border bg-card p-4 shadow-card">
          <p className="font-heading font-semibold">{t('cardTitle')}</p>
          <p className="mt-1 text-sm text-gray-600">{t('cardBody')}</p>
          <div className="mt-3 rounded-md bg-brand-surface px-3 py-2 text-sm font-medium text-brand-ink">{formatMoney(1250000, region.currency, region, { compact: true })}</div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold">{t('formatting')}</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th scope="col" className="px-3 py-2 text-start" />
                {[t('sampleMoney'), t('sampleCompact'), t('sampleDate'), t('sampleTime'), t('sampleRelative'), t('samplePhone'), t('sampleArea')].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-start font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {TEST.map((w, i) => {
                const r = regionFromCountry(w.country);
                return (
                  <tr key={w.name} className={i === ws ? 'bg-brand-surface/50' : undefined}>
                    <th scope="row" className="px-3 py-2 text-start font-medium">{w.name}</th>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(1250000.5, r.currency, r)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(1250000, r.currency, r, { compact: true })}</td>
                    <td className="px-3 py-2 tabular-nums">{formatDate(now, r)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatTime(now, r)}</td>
                    <td className="px-3 py-2">{formatRelative(hourAgo, r, now)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatPhone(w.phone, 'auto', r.country)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatArea(1200, r, 'sqft')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
