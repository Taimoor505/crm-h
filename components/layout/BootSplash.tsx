'use client';

import { useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { readBrandCache, type BrandCache } from '@/lib/theme/brand-cache';

const noop = () => () => {};
let cached: BrandCache | null | undefined;
const getCache = () => (cached === undefined ? (cached = readBrandCache()) : cached);

/** Branded loading screen: the workspace logo with a soft pulse while the app starts. */
export function BootSplash() {
  const t = useTranslations('common');
  // Server and first paint: neutral; then the cached brand from this device.
  const brand = useSyncExternalStore(noop, getCache, () => null);
  return (
    <div
      className="grid min-h-dvh place-items-center bg-background"
      style={(brand?.palette ?? {}) as React.CSSProperties}
      aria-busy="true"
      role="status"
      aria-label={t('loading')}
    >
      <div className="flex flex-col items-center gap-5">
        <div className="relative">
          <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-3xl bg-brand opacity-20 motion-reduce:animate-none" />
          {brand?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt="" className="relative size-16 rounded-3xl bg-white object-contain p-1.5 shadow-raised" />
          ) : (
            <span className="relative grid size-16 place-items-center rounded-3xl bg-brand font-heading text-xl font-bold text-on-brand shadow-raised">
              {brand?.logoText?.slice(0, 2) ?? ''}
            </span>
          )}
        </div>
        {brand?.appName && <p className="font-heading text-base font-semibold text-gray-900">{brand.appName}</p>}
        <div className="h-1 w-28 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
          <div className="h-full w-1/3 animate-[splash_1.1s_ease-in-out_infinite] rounded-full bg-brand motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
