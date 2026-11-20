'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as obs from '@/lib/api/endpoints/observability';
import { qk } from './keys';

export function useSystemStatus() {
  return useQuery({ queryKey: qk.systemStatus(), queryFn: obs.getSystemStatus, refetchInterval: 30_000 });
}

/** Newest first; `live` re-polls every 5 seconds. */
export function useApiLogs(f: obs.ApiLogFilters, live: boolean) {
  return useInfiniteQuery({
    queryKey: qk.apiLogs(f),
    queryFn: ({ pageParam }) => obs.getApiLogs(f, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_before,
    refetchInterval: live ? 5_000 : false,
  });
}
