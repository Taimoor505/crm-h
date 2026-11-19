'use client';

import { useSyncExternalStore } from 'react';

/** Cross-screen UI state: the global quick-add sheet and the pending call outcome. */
export interface PendingCall {
  contactId: string;
  contactName: string;
  phone: string;
  taskId?: string;
  dealId?: string;
  startedAt: number;
}

interface UiState {
  quickAddOpen: boolean;
  quickAddPrefill: { phone?: string; name?: string } | null;
  /** Set when "Call" opens the dialer; the outcome sheet opens on return. */
  pendingCall: PendingCall | null;
  callOutcomeFor: PendingCall | null;
  /** Counts useful actions, for the push opt-in prompt. */
  usefulActions: number;
}

let state: UiState = { quickAddOpen: false, quickAddPrefill: null, pendingCall: null, callOutcomeFor: null, usefulActions: 0 };
const listeners = new Set<() => void>();

export function setUi(patch: Partial<UiState> | ((s: UiState) => Partial<UiState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}

export function getUi() {
  return state;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useUi<T>(select: (s: UiState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state));
}

export const openQuickAdd = (prefill?: UiState['quickAddPrefill']) => setUi({ quickAddOpen: true, quickAddPrefill: prefill ?? null });
export const closeQuickAdd = () => setUi({ quickAddOpen: false, quickAddPrefill: null });
export const countUsefulAction = () => setUi((s) => ({ usefulActions: s.usefulActions + 1 }));

/**
 * Records the call so the outcome sheet appears when the person comes back.
 * The tel: link itself opens the dialer (assigning location.href would fire
 * beforeunload and tear down page state).
 */
export function startCall(call: Omit<PendingCall, 'startedAt'>) {
  setUi({ pendingCall: { ...call, startedAt: Date.now() } });
}

export function openCallOutcome(call: PendingCall) {
  setUi({ pendingCall: null, callOutcomeFor: call });
}

export function closeCallOutcome() {
  setUi({ callOutcomeFor: null });
}
