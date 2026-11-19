'use client';

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, isApiError } from '@/lib/api/client';
import { clearSession } from '@/lib/auth/session';
import { setAppState } from '@/lib/app-state';

interface Handlers {
  onUnauthorized: () => void;
  onSuspended: () => void;
  /** Translated generic error text and retry label. */
  messages: { generic: string; retry: string; offline: string };
}

/** 401, read-only and suspended are handled the same way everywhere. */
function handleGlobal(err: unknown, h: Handlers): boolean {
  if (!isApiError(err)) return false;
  if (err.status === 401) {
    clearSession();
    h.onUnauthorized();
    return true;
  }
  if (err.code === 'workspace_suspended') {
    setAppState({ suspended: true });
    h.onSuspended();
    return true;
  }
  if (err.code === 'workspace_read_only') {
    setAppState({ readOnly: true });
    return true;
  }
  return false;
}

function messageOf(err: unknown, h: Handlers): string {
  if (isApiError(err)) {
    if (err.code === 'network_error') return h.messages.offline;
    if (err.status >= 500) return h.messages.generic;
    return err.message || h.messages.generic;
  }
  return h.messages.generic;
}

export function makeQueryClient(h: Handlers) {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (err, query) => {
        if (handleGlobal(err, h)) return;
        // First loads show an inline error state; background refetch failures toast.
        if (query.state.data !== undefined) {
          toast.error(messageOf(err, h), { action: { label: h.messages.retry, onClick: () => client.refetchQueries({ queryKey: query.queryKey }) } });
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (err, _vars, _ctx, mutation) => {
        if (handleGlobal(err, h)) return;
        if (mutation.options.meta?.silent) return;
        toast.error(messageOf(err, h), {
          action: { label: h.messages.retry, onClick: () => mutation.execute(mutation.state.variables as never).catch(() => {}) },
        });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => {
          if (err instanceof ApiError && err.status > 0 && err.status < 500) return false;
          return count < 2;
        },
      },
      mutations: { retry: false },
    },
  });
  return client;
}

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: { silent?: boolean };
  }
}
