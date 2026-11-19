'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Bell, Building2, Columns3, CreditCard, Download, ListPlus, Palette, Plug, Shuffle, Users, Zap, ChevronRight,
} from 'lucide-react';
import { usePermissions, type Permission } from '@/lib/permissions';
import { cn } from '@/lib/utils';

export const SECTIONS = [
  { key: 'workspace', href: '/settings/workspace', icon: Building2, permission: 'settings.workspace' },
  { key: 'pipelines', href: '/settings/pipelines', icon: Columns3, permission: 'settings.pipelines' },
  { key: 'fields', href: '/settings/fields', icon: ListPlus, permission: 'settings.fields' },
  { key: 'team', href: '/settings/team', icon: Users, permission: 'settings.team' },
  { key: 'leadSources', href: '/settings/lead-sources', icon: Plug, permission: 'settings.lead_sources' },
  { key: 'assignment', href: '/settings/assignment', icon: Shuffle, permission: 'settings.assignment' },
  { key: 'automations', href: '/settings/automations', icon: Zap, permission: 'settings.automations' },
  { key: 'importExport', href: '/settings/import-export', icon: Download, permission: 'settings.import_export' },
  { key: 'notifications', href: '/settings/notifications', icon: Bell, permission: 'settings.notifications' },
  { key: 'branding', href: '/settings/branding', icon: Palette, permission: 'settings.branding' },
  { key: 'billing', href: '/settings/billing', icon: CreditCard, permission: 'settings.billing' },
] as const satisfies readonly { key: string; href: string; icon: unknown; permission: Permission }[];

export type SectionKey = (typeof SECTIONS)[number]['key'];

export function useSections() {
  const { can } = usePermissions();
  return SECTIONS.filter((s) => can(s.permission));
}

export function SettingsNav({ variant }: { variant: 'side' | 'list' }) {
  const t = useTranslations('settings');
  const pathname = usePathname();
  const sections = useSections();

  if (variant === 'list') {
    return (
      <ul className="stagger divide-y divide-gray-100 overflow-hidden rounded-2xl border bg-card shadow-card">
        {sections.map((s) => (
          <li key={s.key}>
            <Link href={s.href} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-gray-50">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-surface text-brand-ink" aria-hidden="true">
                <s.icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-gray-900">{t(`nav.${s.key}`)}</span>
                <span className="block truncate text-xs text-gray-600">{t(`hints.${s.key}`)}</span>
              </span>
              <ChevronRight className="size-4 text-gray-400 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <nav aria-label={t('title')} className="space-y-0.5">
      {sections.map((s) => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.key}
            href={s.href}
            aria-current={active ? 'page' : undefined}
            className={cn('flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium', active ? 'bg-brand-surface text-brand-ink' : 'text-gray-700 hover:bg-gray-100')}
          >
            <s.icon className="size-4" aria-hidden="true" />
            {t(`nav.${s.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
