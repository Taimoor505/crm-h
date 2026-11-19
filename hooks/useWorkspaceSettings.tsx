'use client';

import { createContext, useContext, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getWorkspaceSettings } from '@/lib/api/endpoints/admin';
import { setFallbackCurrency } from '@/lib/api/adapters';
import { regionFromCountry, type RegionSettings } from '@/lib/format/settings';
import type { WorkspaceSettings } from '@/lib/api/types';
import { useSession } from '@/lib/auth/SessionProvider';
import { qk } from './queries/keys';

const TZ_COUNTRY: Record<string, string> = {
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Los_Angeles': 'US', 'Asia/Dubai': 'AE', 'Europe/London': 'GB',
  'Asia/Karachi': 'PK', 'Asia/Kolkata': 'IN', 'Asia/Riyadh': 'SA', 'Australia/Sydney': 'AU', 'Asia/Singapore': 'SG',
};

/**
 * Typed fallback when the backend doesn't return region settings yet: derive
 * them from the workspace time zone. TODO(backend): brief §12.1.
 */
function fallbackFor(timezone: string | undefined, name = ''): WorkspaceSettings {
  const country = (timezone && TZ_COUNTRY[timezone]) || 'US';
  return { ...regionFromCountry(country, timezone ? { timezone } : {}), name, branding: {} };
}

const Ctx = createContext<WorkspaceSettings | null>(null);

export function WorkspaceSettingsProvider({ children }: { children: React.ReactNode }) {
  const { workspaceId, workspace } = useSession();
  const q = useQuery({
    queryKey: qk.settings(workspaceId ?? ''),
    queryFn: () => getWorkspaceSettings(workspaceId!),
    enabled: Boolean(workspaceId),
    staleTime: 10 * 60_000,
  });

  const value = useMemo<WorkspaceSettings>(() => {
    const base = fallbackFor(workspace?.timezone, workspace?.name);
    if (!q.data) {
      if (q.isError && process.env.NODE_ENV === 'development') {
        console.warn('[settings] region settings unavailable, using fallback from timezone (TODO backend §12.1)');
      }
      return base;
    }
    return { ...base, ...q.data, name: q.data.name || base.name, branding: q.data.branding ?? {} };
  }, [q.data, q.isError, workspace?.timezone, workspace?.name]);

  // Legacy `*_pkr` amounts are read as the workspace currency.
  setFallbackCurrency(value.currency);
  useEffect(() => setFallbackCurrency(value.currency), [value.currency]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Region settings for formatting. Falls back to en-US/UTC outside the app shell. */
export function useWorkspaceSettings(): WorkspaceSettings {
  return useContext(Ctx) ?? fallbackFor(undefined);
}

export type { RegionSettings };
