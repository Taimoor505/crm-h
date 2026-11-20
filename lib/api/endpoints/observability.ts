import { api } from '../client';
import type { Raw } from '../adapters';

export type HealthState = 'up' | 'degraded' | 'down';
export type ComponentKey = 'api' | 'database' | 'auth' | 'storage' | 'jobs';

export interface SystemStatus {
  overall: HealthState;
  checked_at: string;
  components: { key: ComponentKey; state: HealthState; latency_ms: number | null }[];
  api: {
    requests_24h: number;
    error_rate_24h: number;
    p50_ms: number | null;
    p95_ms: number | null;
    hourly: { hour: string; requests: number; errors: number; p50_ms: number | null; p95_ms: number | null }[];
  };
  history: Partial<Record<ComponentKey, { day: string; uptime: number | null; avg_ms: number | null }[]>>;
}

export async function getSystemStatus(): Promise<SystemStatus> {
  return (await api.get<Raw>('/status')).data;
}

export interface ApiLog {
  id: string;
  at: string;
  request_id: string;
  method: string;
  route: string;
  path: string;
  status: number;
  duration_ms: number;
  error_code: string | null;
  ip: string | null;
  user_agent: string | null;
  region: string | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
}

export interface ApiLogFilters {
  status: 'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'errors';
  method?: string;
  q?: string;
  minutes: number;
  slow?: boolean;
  user_id?: string;
  workspace_id?: string;
}

export interface ApiLogSummary {
  requests: number;
  server_errors: number;
  client_errors: number;
  p50_ms: number | null;
  p95_ms: number | null;
  users: number;
  slowest_routes: { method: string; route: string; requests: number; errors: number; p95_ms: number | null }[];
}

export async function getApiLogs(f: ApiLogFilters, before?: string | null): Promise<{ data: ApiLog[]; next_before: string | null; summary: ApiLogSummary }> {
  const r = await api.get<Raw>('/dev/logs', {
    status: f.status, method: f.method || undefined, q: f.q || undefined, minutes: f.minutes,
    slow: f.slow ? 'true' : undefined, user_id: f.user_id, workspace_id: f.workspace_id, before: before ?? undefined, limit: 100,
  });
  return { data: r.data, next_before: r.next_before != null ? String(r.next_before) : null, summary: r.summary };
}
