'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, Lock, LogOut, WifiOff } from 'lucide-react';
import { useAppState } from '@/lib/app-state';
import { useSession } from '@/lib/auth/SessionProvider';
import { usePermissions } from '@/lib/permissions';
import { usePendingCount } from '@/lib/offline-queue';

/** Site-wide, non-dismissable (brief §8.11). */
export function ReadOnlyBanner() {
  const t = useTranslations('readOnly');
  const { readOnly } = useAppState();
  const { can } = usePermissions();
  if (!readOnly) return null;
  const owner = can('settings.billing');
  return (
    <div role="status" className="flex items-center gap-3 bg-amber-100 px-4 py-2.5 text-sm text-amber-950">
      <Lock className="size-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">{owner ? t('banner') : t('agentBanner')}</p>
      {owner && (
        <Link href="/settings/billing" className="shrink-0 rounded-md bg-amber-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900">
          {t('cta')}
        </Link>
      )}
    </div>
  );
}

export function ImpersonationBar() {
  const t = useTranslations('shell');
  const { session, exitImpersonation } = useSession();
  const router = useRouter();
  if (!session?.impersonating) return null;
  return (
    <div role="status" className="flex items-center gap-3 bg-gray-900 px-4 py-2 text-sm text-white">
      <Eye className="size-4 shrink-0" aria-hidden="true" />
      <p className="flex-1 truncate">{t('viewingAs', { workspace: session.impersonating.workspaceName })}</p>
      <button
        type="button"
        onClick={() => router.push(exitImpersonation() ?? '/partner')}
        className="shrink-0 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-gray-100"
      >
        {t('exitImpersonation')}
      </button>
    </div>
  );
}

/** While an owner is signed in as a teammate: who, and the way back. */
export function SignInAsBar() {
  const t = useTranslations('shell');
  const r = useTranslations('roles');
  const { session, returnToMyAccount } = useSession();
  const router = useRouter();
  const s = session?.signInAs;
  if (!s) return null;
  return (
    <div role="status" className="flex items-center gap-3 bg-amber-950 px-4 py-2 text-sm text-white">
      <Eye className="size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate">{t('signedInAs', { name: s.name, role: r(s.role) })}</p>
      <button
        type="button"
        onClick={async () => {
          await returnToMyAccount();
          router.replace('/settings/team');
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-50"
      >
        <LogOut className="size-3.5" aria-hidden="true" />
        {t('returnToMyAccount')}
      </button>
    </div>
  );
}

export function OfflineBanner() {
  const t = useTranslations('shell');
  const o = useTranslations('offline');
  const { offline } = useAppState();
  const pending = usePendingCount();
  if (!offline && !pending) return null;
  return (
    <div role="status" className="flex items-center gap-2 bg-gray-800 px-4 py-2 text-sm text-white">
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      {pending ? (offline ? o('pending', { count: pending }) : o('pendingOnline', { count: pending })) : t('offlineBanner')}
    </div>
  );
}
