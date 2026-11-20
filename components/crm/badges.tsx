'use client';

import { useTranslations } from 'next-intl';
import { Globe, Facebook, MessageCircle, Phone, UserPlus, Users, Upload, Webhook, Megaphone, MapPin } from 'lucide-react';
import type { StageKind } from '@/lib/api/types';
import { cn, humanize, initials } from '@/lib/utils';

const SOURCE_ICONS: Record<string, typeof Globe> = {
  website: Globe,
  website_form: Globe,
  facebook: Facebook,
  meta_leadgen: Facebook,
  whatsapp: MessageCircle,
  phone: Phone,
  referral: Users,
  manual: UserPlus,
  import: Upload,
  webhook: Webhook,
  google_ads: Megaphone,
  walk_in: MapPin,
  field_visit: MapPin,
};

export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const Icon = SOURCE_ICONS[source] ?? Globe;
  return (
    <span className={cn('inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700', className)}>
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">{humanize(source)}</span>
    </span>
  );
}

const KIND_STYLES: Record<StageKind, string> = {
  open: 'bg-brand-surface text-brand-ink',
  won: 'bg-green-50 text-green-800',
  lost: 'bg-gray-100 text-gray-700',
};

export function StageBadge({ name, kind = 'open', className }: { name: string; kind?: StageKind; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-medium', KIND_STYLES[kind], className)}>
      <span className="truncate">{name}</span>
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-50 text-blue-800',
  contacted: 'bg-brand-surface text-brand-ink',
  qualified: 'bg-violet-50 text-violet-800',
  hot: 'bg-orange-50 text-orange-800',
  cold: 'bg-gray-100 text-gray-700',
  won: 'bg-green-50 text-green-800',
  lost: 'bg-gray-100 text-gray-600',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const t = useTranslations('contactStatus');
  const known = status in STATUS_STYLES;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700', className)}>
      {known ? t(status as 'new') : humanize(status)}
    </span>
  );
}

const AVATAR_TONES = ['bg-sky-100 text-sky-800', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-800', 'bg-violet-100 text-violet-800', 'bg-teal-100 text-teal-800', 'bg-lime-100 text-lime-800'];

function toneFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

export function Avatar({ name, seed, size = 'md', className }: { name: string | null | undefined; seed?: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'size-7 text-[11px]', md: 'size-10 text-sm', lg: 'size-14 text-lg' };
  return (
    <span aria-hidden="true" className={cn('inline-grid shrink-0 place-items-center rounded-full font-semibold', sizes[size], toneFor(seed ?? name ?? ''), className)}>
      {initials(name)}
    </span>
  );
}

/** Owner initials with the name in a tooltip-like title; shows "Unassigned" when null. */
export function OwnerAvatar({ name, userId, className }: { name: string | null | undefined; userId?: string | null; className?: string }) {
  const c = useTranslations('common');
  if (!userId) {
    return (
      <span title={c('unassigned')} className={cn('inline-grid size-7 place-items-center rounded-full border border-dashed border-gray-300 text-[11px] text-gray-500', className)}>
        <span className="sr-only">{c('unassigned')}</span>?
      </span>
    );
  }
  return (
    <span title={name ?? undefined} className={cn('inline-flex', className)}>
      <Avatar name={name} seed={userId} size="sm" />
      <span className="sr-only">{name}</span>
    </span>
  );
}

/** A distinct colour per pipeline stage (by position); won/lost are fixed. */
const STAGE_TONES = ['bg-sky-500', 'bg-indigo-500', 'bg-violet-500', 'bg-fuchsia-500', 'bg-amber-500', 'bg-cyan-500', 'bg-teal-500'];
export function stageTone(index: number, kind: 'open' | 'won' | 'lost' = 'open'): string {
  if (kind === 'won') return 'bg-emerald-500';
  if (kind === 'lost') return 'bg-gray-400';
  return STAGE_TONES[index % STAGE_TONES.length];
}
