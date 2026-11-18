'use client';

import { useSyncExternalStore } from 'react';

/** App-wide flags set by global API error handling. */
interface AppState {
  readOnly: boolean;
  suspended: boolean;
  offline: boolean;
}

let state: AppState = { readOnly: false, suspended: false, offline: false };
const listeners = new Set<() => void>();

export function setAppState(patch: Partial<AppState>) {
  const next = { ...state, ...patch };
  if (next.readOnly === state.readOnly && next.suspended === state.suspended && next.offline === state.offline) return;
  state = next;
  listeners.forEach((l) => l());
}

export function getAppState() {
  return state;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const server: AppState = { readOnly: false, suspended: false, offline: false };

export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, () => state, () => server);
}

/** True when the workspace is read-only: hide every write action. */
export function useReadOnly(): boolean {
  return useAppState().readOnly;
}
