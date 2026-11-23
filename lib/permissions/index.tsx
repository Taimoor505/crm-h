'use client';

import type { ReactNode } from 'react';
import type { Role } from '@/lib/api/types';
import { useSession } from '@/lib/auth/SessionProvider';
import { useReadOnly } from '@/lib/app-state';

/** Brief §9. Hide what a role can't use; never show disabled buttons. */
export const PERMISSIONS = {
  'leads.view_all': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'leads.assign': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'leads.merge': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'leads.export': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'leads.bulk': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'home.team': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'reports.team': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'tasks.assign_others': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'inbox.view_all': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'settings.view': ['owner', 'manager', 'agent', 'partner_admin', 'super_admin'],
  'settings.workspace': ['owner', 'partner_admin', 'super_admin'],
  'settings.region': ['owner', 'partner_admin', 'super_admin'],
  'settings.pipelines': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'settings.fields': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'settings.team': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'settings.lead_sources': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'settings.assignment': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'settings.automations': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'settings.import_export': ['owner', 'manager', 'partner_admin', 'super_admin'],
  'settings.notifications': ['owner', 'manager', 'agent', 'partner_admin', 'super_admin'],
  'settings.calendar': ['owner', 'manager', 'agent', 'partner_admin', 'super_admin'],
  'settings.branding': ['owner', 'partner_admin', 'super_admin'],
  'settings.billing': ['owner'],
  'team.sign_in_as': ['owner'],
  'partner.area': ['partner_admin'],
  'admin.console': ['super_admin'],
  'dev.logs': ['super_admin'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

/** Permissions that change data, hidden while the workspace is read-only. */
const WRITE: Partial<Record<Permission, true>> = {
  'leads.assign': true, 'leads.merge': true, 'leads.bulk': true, 'tasks.assign_others': true,
};

export function can(role: Role | null | undefined, permission: Permission, extra: { isSuperAdmin?: boolean; isPartnerAdmin?: boolean } = {}): boolean {
  if (!role) return false;
  const allowed = PERMISSIONS[permission] as readonly Role[];
  if (allowed.includes(role)) return true;
  if (extra.isSuperAdmin && allowed.includes('super_admin')) return true;
  if (extra.isPartnerAdmin && allowed.includes('partner_admin')) return true;
  return false;
}

export function usePermissions() {
  const { role, me } = useSession();
  const readOnly = useReadOnly();
  const extra = { isSuperAdmin: me?.user.is_super_admin, isPartnerAdmin: Boolean(me?.user.partner_admin_of) };
  return {
    role,
    readOnly,
    isAgent: role === 'agent',
    can: (p: Permission) => can(role, p, extra) && !(readOnly && WRITE[p]),
    /** Write actions in general (add, edit, move). Hidden while read-only. */
    canWrite: !readOnly,
  };
}

export function Can({ permission, write, children, fallback = null }: { permission?: Permission; write?: boolean; children: ReactNode; fallback?: ReactNode }) {
  const p = usePermissions();
  const ok = (!permission || p.can(permission)) && (!write || p.canWrite);
  return <>{ok ? children : fallback}</>;
}
