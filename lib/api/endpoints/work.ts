import { api } from '../client';
import { adaptTask, money, moneyOrZero, type Raw } from '../adapters';
import type {
  AgentsReport, AppNotification, Conversation, FollowUpInput, FunnelReport, HomeSummary, LostReasonsReport, Message,
  NotificationSettings, Page, ReportFilters, SavedReply, SourcesReport, SpeedToLeadReport, Task, TaskBucket, TaskType,
  WhatsAppTemplate, WonValueReport,
} from '../types';

// ------------------------------------------------------------- tasks (follow-ups)

export async function listTasks(f: {
  due?: TaskBucket;
  status?: 'open' | 'done' | 'cancelled' | 'all';
  assigned_to?: string;
  contact_id?: string;
  deal_id?: string;
  cursor?: string | null;
  limit?: number;
}): Promise<Page<Task>> {
  const r = await api.get<Raw>('/tasks', { ...f, cursor: f.cursor ?? undefined, limit: f.limit ?? 50 });
  return { data: r.data.map(adaptTask), next_cursor: r.next_cursor ?? null };
}

export async function createTask(input: FollowUpInput & { contact_id?: string | null; deal_id?: string | null; type: TaskType }): Promise<Task> {
  const r = await api.post<Raw>('/tasks', input);
  return adaptTask(r.data);
}

export async function updateTask(id: string, patch: Partial<{ title: string; notes: string | null; type: TaskType; due_at: string; assigned_to: string; status: 'open' | 'cancelled' }>): Promise<Task> {
  const r = await api.patch<Raw>(`/tasks/${id}`, patch);
  return adaptTask(r.data ?? r);
}

export async function completeTask(id: string, input: { outcome?: string; note?: string; next?: FollowUpInput } = {}) {
  const r = await api.post<Raw>(`/tasks/${id}/complete`, input);
  return { task: adaptTask(r.data.task), next: r.data.next ? adaptTask(r.data.next) : null };
}

// ------------------------------------------------------------- home

export async function getHomeSummary(scope: 'me' | 'team'): Promise<HomeSummary> {
  const r = await api.get<Raw>('/home/summary', { scope });
  const d = r.data;
  return { ...d, tasks: { ...d.tasks, next: (d.tasks.next ?? []).map(adaptTask) } };
}

// ------------------------------------------------------------- notifications

export async function listNotifications(f: { unread?: boolean; cursor?: string | null; limit?: number } = {}) {
  const r = await api.get<Raw>('/notifications', { unread: f.unread ? 'true' : undefined, cursor: f.cursor ?? undefined, limit: f.limit ?? 25 });
  return { data: r.data as AppNotification[], unread_count: r.unread_count as number, next_cursor: (r.next_cursor ?? null) as string | null };
}

export async function markNotificationsRead(arg: { ids: string[] } | { all: true }) {
  return api.post<Raw>('/notifications/read', arg);
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const r = await api.get<Raw>('/notification-settings');
  return r.data;
}

export async function updateNotificationSettings(patch: {
  events?: { type: string; push?: boolean; whatsapp?: boolean }[];
  quiet_hours?: boolean;
  whatsapp_number?: string | null;
}): Promise<NotificationSettings> {
  const r = await api.put<Raw>('/notification-settings', patch);
  return r.data;
}

export async function subscribePush(sub: PushSubscriptionJSON) {
  return api.post<Raw>('/push-subscriptions', sub);
}

export async function unsubscribePush(endpoint: string) {
  return api.delete<Raw>('/push-subscriptions', { endpoint });
}

// ------------------------------------------------------------- inbox

export async function listConversations(): Promise<Conversation[]> {
  const r = await api.get<Raw>('/conversations');
  return r.data as Conversation[];
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const r = await api.get<Raw>(`/conversations/${conversationId}/messages`);
  return (r.data as Message[]).slice().sort((a, b) => a.sent_at.localeCompare(b.sent_at));
}

export async function sendMessage(conversationId: string, body: string, type: 'text' | 'template' = 'text'): Promise<Message> {
  const r = await api.post<Raw>(`/conversations/${conversationId}/messages`, { body, type });
  return (r.message ?? r.data) as Message;
}

/** TODO(backend): missing endpoint, served by MSW. */
export async function markConversationRead(conversationId: string) {
  return api.post<Raw>(`/conversations/${conversationId}/read`, {});
}

export async function logClickToChat(contactId: string, prefill: string) {
  return api.post<Raw>('/whatsapp/click-log', { contact_id: contactId, prefill_text: prefill });
}

/** TODO(backend): missing endpoints, served by MSW. */
export async function listSavedReplies(): Promise<SavedReply[]> {
  return (await api.get<Raw>('/whatsapp/saved-replies')).data;
}
export async function listWhatsAppTemplates(): Promise<WhatsAppTemplate[]> {
  return (await api.get<Raw>('/whatsapp/templates')).data;
}

// ------------------------------------------------------------- reports

export async function getSourcesReport(f: ReportFilters): Promise<SourcesReport> {
  return (await api.get<Raw>('/reports/sources', { ...f })).data;
}

export async function getSpeedReport(f: ReportFilters): Promise<SpeedToLeadReport> {
  return (await api.get<Raw>('/reports/speed-to-lead', { ...f })).data;
}

export async function getFunnelReport(f: ReportFilters): Promise<FunnelReport> {
  return (await api.get<Raw>('/reports/funnel', { ...f })).data;
}

export async function getAgentsReport(f: ReportFilters): Promise<AgentsReport> {
  const d = (await api.get<Raw>('/reports/agents', { ...f })).data;
  return { ...d, agents: d.agents.map((a: Raw) => ({ ...a, won_value: moneyOrZero(a, 'won_value') })) };
}

export async function getWonValueReport(f: ReportFilters): Promise<WonValueReport> {
  const d = (await api.get<Raw>('/reports/won-value', { ...f })).data;
  return {
    from: d.from,
    to: d.to,
    total: moneyOrZero(d, 'total_value'),
    total_deals: d.total_deals,
    months: d.months.map((m: Raw) => ({ month: m.month, deals: m.deals, value: moneyOrZero(m, 'value') })),
  };
}

export async function getLostReasonsReport(f: ReportFilters): Promise<LostReasonsReport> {
  const d = (await api.get<Raw>('/reports/lost-reasons', { ...f })).data;
  return { ...d, reasons: d.reasons.map((x: Raw) => ({ ...x, value: money(x, 'value') ?? moneyOrZero(null, 'value') })) };
}
