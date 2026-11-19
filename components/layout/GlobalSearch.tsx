'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';

const GlobalSearchDialog = dynamic(() => import('./GlobalSearchDialog'), { ssr: false });

/** Search leads from anywhere (Ctrl/⌘+K on desktop). The dialog loads on first open. */
export function GlobalSearch({ variant }: { variant: 'icon' | 'bar' }) {
  const t = useTranslations('shell');
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Both variants are mounted (CSS picks one); only the desktop bar owns the shortcut.
    if (variant !== 'bar') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setLoaded(true);
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [variant]);

  const show = () => {
    setLoaded(true);
    setOpen(true);
  };

  return (
    <>
      {variant === 'icon' ? (
        <button type="button" onClick={show} aria-label={t('search')} className="grid size-11 place-items-center rounded-full text-gray-700 hover:bg-gray-100">
          <Search className="size-5" aria-hidden="true" />
        </button>
      ) : (
        <button type="button" onClick={show} className="flex h-10 w-full max-w-md items-center gap-2 rounded-lg border bg-gray-50 px-3 text-sm text-gray-500 hover:bg-white">
          <Search className="size-4" aria-hidden="true" />
          <span className="flex-1 text-start">{t('searchPlaceholder')}</span>
          <kbd className="rounded border bg-white px-1.5 text-[10px] text-gray-500">⌘K</kbd>
        </button>
      )}
      {loaded && <GlobalSearchDialog open={open} setOpen={setOpen} />}
    </>
  );
}
