'use client';

import { subscribePush, unsubscribePush } from '@/lib/api/endpoints/work';

export type PushSupport = 'supported' | 'unsupported' | 'denied' | 'granted';

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return 'supported';
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Asks permission, subscribes through the app's service worker (which
 * imports /push-sw.js) and registers the subscription with the API.
 */
export async function enablePush(vapidPublicKey: string | null): Promise<PushSupport> {
  const support = pushSupport();
  if (support === 'unsupported' || support === 'denied') return support;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'supported';
  if (!vapidPublicKey) return 'granted';
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) }));
  await subscribePush(sub.toJSON());
  return 'granted';
}

/** On sign-out: forget this browser (DELETE /push-subscriptions). */
export async function disablePush() {
  if (pushSupport() === 'unsupported') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await unsubscribePush(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
