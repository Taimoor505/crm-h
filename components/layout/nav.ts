import { BarChart3, Bell, CalendarCheck, Columns3, Home, Inbox, Settings, Shield, Building2, Users } from 'lucide-react';
import type { ModuleKey } from '@/lib/api/types';
import type { Permission } from '@/lib/permissions';

export type NavKey = 'home' | 'leads' | 'pipeline' | 'followUps' | 'inbox' | 'reports' | 'notifications' | 'settings' | 'partner' | 'admin';

export interface NavItem {
  key: NavKey;
  href: string;
  icon: typeof Home;
  module?: ModuleKey;
  permission?: Permission;
  /** Shown in the mobile bottom bar (the rest go in "More"). */
  primary?: boolean;
  /** Matches these path prefixes too. */
  match?: string[];
}

export const NAV: NavItem[] = [
  { key: 'home', href: '/home', icon: Home, module: 'home', primary: true },
  { key: 'leads', href: '/leads', icon: Users, module: 'leads', primary: true, match: ['/contacts'] },
  { key: 'pipeline', href: '/pipeline', icon: Columns3, module: 'pipeline', primary: true },
  { key: 'followUps', href: '/follow-ups', icon: CalendarCheck, module: 'follow_ups', primary: true },
  { key: 'inbox', href: '/inbox', icon: Inbox, module: 'inbox', primary: true },
  { key: 'reports', href: '/reports', icon: BarChart3, module: 'reports' },
  { key: 'notifications', href: '/notifications', icon: Bell },
  { key: 'settings', href: '/settings', icon: Settings, permission: 'settings.view' },
  { key: 'partner', href: '/partner', icon: Building2, permission: 'partner.area' },
  { key: 'admin', href: '/admin', icon: Shield, permission: 'admin.console' },
];

/** Which module a path belongs to, for hide_modules redirects. */
export function moduleForPath(pathname: string): ModuleKey | null {
  const item = NAV.find((n) => n.module && [n.href, ...(n.match ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`)));
  return item?.module ?? null;
}

export function isActive(item: NavItem, pathname: string) {
  return [item.href, ...(item.match ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
