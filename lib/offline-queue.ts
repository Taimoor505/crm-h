'use client';

/**
 * Offline queue for "Add lead" and "Add note" (brief §10). Items live in
 * IndexedDB (blobs such as voice notes included) and sync when the browser
 * comes back online.
 */
import { useSyncExternalStore } from 'react';
import type { QuickAddInput } from '@/lib/api/endpoints/crm';

export type QueuedItem =
  | { id: string; kind: 'quick_add'; workspaceId: string; createdAt: number; payload: QuickAddInput }
  | { id: string; kind: 'note'; workspaceId: string; createdAt: number; payload: { contactId: string; body: string } };

const DB = 'crm-offline';
const STORE = 'queue';
let count = 0;
const listeners = new Set<() => void>();

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function refreshCount() {
  try {
    count = await tx('readonly', (s) => s.count());
  } catch {
    count = 0;
  }
  listeners.forEach((l) => l());
}

export async function enqueue(item: Omit<QueuedItem, 'id' | 'createdAt'>) {
  await tx('readwrite', (s) => s.put({ ...item, id: crypto.randomUUID(), createdAt: Date.now() } as QueuedItem));
  await refreshCount();
}

export async function listQueue(): Promise<QueuedItem[]> {
  try {
    return ((await tx('readonly', (s) => s.getAll())) as QueuedItem[]).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function removeQueued(id: string) {
  await tx('readwrite', (s) => s.delete(id));
  await refreshCount();
}

let flushing = false;
/** Sends queued items for the active workspace, oldest first. Stops at the first network failure. */
export async function flushQueue(workspaceId: string, send: (item: QueuedItem) => Promise<unknown>): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of await listQueue()) {
      if (item.workspaceId !== workspaceId) continue;
      try {
        await send(item);
        await removeQueued(item.id);
        sent++;
      } catch (e) {
        if ((e as { code?: string })?.code === 'network_error') break;
        // A rejected item (e.g. invalid phone) would block the queue forever: drop it.
        await removeQueued(item.id);
      }
    }
  } finally {
    flushing = false;
  }
  return sent;
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (listeners.size === 1) refreshCount();
  return () => listeners.delete(l);
}

export function usePendingCount(): number {
  return useSyncExternalStore(subscribe, () => count, () => 0);
}
