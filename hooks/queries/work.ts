'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as work from '@/lib/api/endpoints/work';
import type { FollowUpInput, HomeSummary, Page, ReportFilters, Task, TaskBucket, TaskType } from '@/lib/api/types';
import { useWorkspaceId } from '@/lib/auth/SessionProvider';
import { qk } from './keys';

// ------------------------------------------------------------- tasks

export function useTasks(due: TaskBucket, opts: { assigned_to?: string } = {}) {
  const ws = useWorkspaceId();
  return useInfiniteQuery({
    queryKey: qk.tasks(ws, { due, assigned_to: opts.assigned_to }),
    queryFn: ({ pageParam }) => work.listTasks({ due, assigned_to: opts.assigned_to, cursor: pageParam, limit: 50 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: Boolean(ws),
  });
}

export function useContactTasks(contactId: string) {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: qk.tasks(ws, { contact_id: contactId }),
    queryFn: () => work.listTasks({ contact_id: contactId, status: 'open', assigned_to: 'all' }),
    enabled: Boolean(ws && contactId),
  });
}

function removeTaskEverywhere(qc: ReturnType<typeof useQueryClient>, ws: string, id: string) {
  qc.setQueriesData<{ pages: Page<Task>[]; pageParams: unknown[] }>({ queryKey: qk.tasks(ws) }, (old) =>
    old && 'pages' in old ? { ...old, pages: old.pages.map((p) => ({ ...p, data: p.data.filter((t) => t.id !== id) })) } : old,
  );
  qc.setQueriesData<HomeSummary>({ queryKey: [ws, 'home'] }, (old) =>
    old ? { ...old, tasks: { ...old.tasks, next: old.tasks.next.filter((t) => t.id !== id) } } : old,
  );
}

function invalidateTaskViews(qc: ReturnType<typeof useQueryClient>, ws: string, contactId?: string | null) {
  qc.invalidateQueries({ queryKey: qk.tasks(ws) });
  qc.invalidateQueries({ queryKey: [ws, 'home'] });
  if (contactId) qc.invalidateQueries({ queryKey: qk.timeline(ws, contactId) });
}

/** Optimistic: the follow-up disappears from every list right away. */
export function useCompleteTask() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ task, ...input }: { task: Task; outcome?: string; note?: string; next?: FollowUpInput }) => work.completeTask(task.id, input),
    onMutate: async ({ task }) => {
      await qc.cancelQueries({ queryKey: qk.tasks(ws) });
      await qc.cancelQueries({ queryKey: [ws, 'home'] });
      const snapshot = [...qc.getQueriesData({ queryKey: qk.tasks(ws) }), ...qc.getQueriesData({ queryKey: [ws, 'home'] })];
      removeTaskEverywhere(qc, ws, task.id);
      return { snapshot };
    },
    onError: (_e, _v, ctx) => ctx?.snapshot.forEach(([k, d]) => qc.setQueryData(k, d)),
    onSettled: (_d, _e, { task }) => invalidateTaskViews(qc, ws, task.contact_id),
  });
}

export function useCreateTask() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FollowUpInput & { contact_id?: string | null; deal_id?: string | null; type: TaskType }) => work.createTask(input),
    onSuccess: (t) => invalidateTaskViews(qc, ws, t.contact_id),
  });
}

export function useUpdateTask() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; due_at?: string; title?: string; status?: 'cancelled'; assigned_to?: string }) => work.updateTask(id, patch),
    onSuccess: (t) => invalidateTaskViews(qc, ws, t.contact_id),
  });
}

// ------------------------------------------------------------- home

export function useHomeSummary(scope: 'me' | 'team') {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.home(ws, scope), queryFn: () => work.getHomeSummary(scope), enabled: Boolean(ws), refetchInterval: 60_000 });
}

// ------------------------------------------------------------- notifications

export function useNotifications(unreadOnly = false) {
  const ws = useWorkspaceId();
  return useInfiniteQuery({
    queryKey: [...qk.notifications(ws), unreadOnly],
    queryFn: ({ pageParam }) => work.listNotifications({ unread: unreadOnly, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: Boolean(ws),
    refetchInterval: 60_000,
  });
}

export function useUnreadCount() {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: [...qk.notifications(ws), 'count'],
    queryFn: async () => (await work.listNotifications({ unread: true, limit: 1 })).unread_count,
    enabled: Boolean(ws),
    refetchInterval: 60_000,
  });
}

export function useMarkRead() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (arg: { ids: string[] } | { all: true }) => work.markNotificationsRead(arg),
    meta: { silent: true },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notifications(ws) }),
  });
}

export function useNotificationSettings() {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.notificationSettings(ws), queryFn: work.getNotificationSettings, enabled: Boolean(ws) });
}

export function useUpdateNotificationSettings() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: work.updateNotificationSettings,
    onSuccess: (s) => qc.setQueryData(qk.notificationSettings(ws), s),
  });
}

// ------------------------------------------------------------- inbox

export function useConversations() {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.conversations(ws), queryFn: work.listConversations, enabled: Boolean(ws), refetchInterval: 30_000 });
}

export function useMessages(conversationId: string) {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.messages(ws, conversationId), queryFn: () => work.listMessages(conversationId), enabled: Boolean(ws && conversationId), refetchInterval: 15_000 });
}

export function useSendMessage(conversationId: string) {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, type }: { body: string; type?: 'text' | 'template' }) => work.sendMessage(conversationId, body, type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.messages(ws, conversationId) });
      qc.invalidateQueries({ queryKey: qk.conversations(ws) });
    },
  });
}

export function useSavedReplies() {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.savedReplies(ws), queryFn: work.listSavedReplies, enabled: Boolean(ws), staleTime: 10 * 60_000 });
}

export function useWhatsAppTemplates() {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.waTemplates(ws), queryFn: work.listWhatsAppTemplates, enabled: Boolean(ws), staleTime: 10 * 60_000 });
}

/** Logs a click-to-chat and refreshes what it touches. */
export function useLogWhatsApp() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId, text }: { contactId: string; text: string }) => work.logClickToChat(contactId, text),
    meta: { silent: true },
    onSettled: (_d, _e, { contactId }) => {
      qc.invalidateQueries({ queryKey: qk.timeline(ws, contactId) });
      qc.invalidateQueries({ queryKey: [ws, 'home'] });
    },
  });
}

// ------------------------------------------------------------- reports

const REPORTS = {
  sources: work.getSourcesReport,
  'speed-to-lead': work.getSpeedReport,
  funnel: work.getFunnelReport,
  agents: work.getAgentsReport,
  'won-value': work.getWonValueReport,
  'lost-reasons': work.getLostReasonsReport,
} as const;

type ReportData = { [K in keyof typeof REPORTS]: Awaited<ReturnType<(typeof REPORTS)[K]>> };

export function useReport<N extends keyof typeof REPORTS>(name: N, filters: ReportFilters, enabled = true) {
  const ws = useWorkspaceId();
  return useQuery<ReportData[N]>({
    queryKey: qk.report(ws, name, filters),
    queryFn: () => (REPORTS[name] as (f: ReportFilters) => Promise<ReportData[N]>)(filters),
    enabled: Boolean(ws) && enabled,
  });
}
