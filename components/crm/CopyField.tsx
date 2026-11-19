'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Read-only value with a copy button (URLs, secrets, snippets). */
export function CopyField({ value, label, multiline, className }: { value: string; label: string; multiline?: boolean; className?: string }) {
  const c = useTranslations('common');
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <div className={cn('relative', className)}>
      {multiline ? (
        <pre aria-label={label} tabIndex={0} className="max-h-48 overflow-auto rounded-lg border bg-gray-50 p-3 pe-12 font-mono text-xs whitespace-pre-wrap break-all text-gray-800">
          {value}
        </pre>
      ) : (
        <input aria-label={label} readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="h-11 w-full rounded-lg border bg-gray-50 ps-3 pe-12 font-mono text-xs text-gray-800" />
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? c('copied') : `${c('copy')}: ${label}`}
        className="absolute end-1.5 top-1.5 grid size-8 place-items-center rounded-md bg-white text-gray-700 shadow-sm hover:bg-gray-100"
      >
        {copied ? <Check className="size-4 text-green-700" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}
