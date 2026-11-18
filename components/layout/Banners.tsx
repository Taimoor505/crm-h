'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Eye, Lock, WifiOff } from 'lucide-react';
import { useAppState } from '@/lib/app-state';
import { useSession } from '@/lib/auth/SessionProvider';
import { usePermissions } from '@/lib/permissions';

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

export function OfflineBanner() {
  const t = useTranslations('shell');
  const { offline } = useAppState();
  if (!offline) return null;
  return (
    <div role="status" className="flex items-center gap-2 bg-gray-800 px-4 py-2 text-sm text-white">
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      {t('offlineBanner')}
    </div>
  );
}
