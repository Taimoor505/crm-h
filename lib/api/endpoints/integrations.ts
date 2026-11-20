import { api } from '../client';
import type { Raw } from '../adapters';

export interface GoogleCalendarStatus {
  /** Google sign-in is set up on the server (client id and secret). */
  configured: boolean;
  connected: boolean;
  email: string | null;
  connected_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  synced_count: number;
}

export async function getGoogleCalendar(): Promise<GoogleCalendarStatus> {
  return (await api.get<Raw>('/integrations/google')).data;
}

/** Returns Google's consent page URL; the caller sends the browser there. */
export async function startGoogleConnect(): Promise<string> {
  return (await api.post<Raw>('/integrations/google/connect', {})).data.url;
}

export async function disconnectGoogle() {
  await api.delete('/integrations/google');
}
