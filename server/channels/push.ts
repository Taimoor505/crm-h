import { sendNotification } from 'web-push';

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body?: string | null;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/** Result per subscription: 'gone' means the browser unsubscribed; disable it. */
export type PushResult = 'sent' | 'gone';

export interface PushDriver {
  send(sub: PushSubscriptionRow, payload: PushPayload, urgent: boolean): Promise<PushResult>;
}

/** Web Push (VAPID). Keys: `npx web-push generate-vapid-keys`. */
const webPushDriver: PushDriver = {
  async send(sub, payload, urgent) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? 'mailto:support@example.com';
    if (!publicKey || !privateKey) throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set');
    try {
      await sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: { subject, publicKey, privateKey },
          TTL: 24 * 3600,
          urgency: urgent ? 'high' : 'normal',
          timeout: 10_000,
        },
      );
      return 'sent';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return 'gone';
      throw err;
    }
  },
};

let driver: PushDriver = webPushDriver;
export const push = () => driver;
export function setPushDriver(d: PushDriver) {
  driver = d;
}
