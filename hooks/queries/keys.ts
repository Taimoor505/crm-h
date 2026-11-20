/**
 * Every TanStack Query key in one place. Workspace-scoped keys start with the
 * workspace id, so switching workspace never shows another workspace's data.
 */
import type { ContactFilters } from '@/lib/api/endpoints/crm';
import type { ReportFilters, TaskBucket } from '@/lib/api/types';

export const qk = {
  me: (ws: string | null) => ['me', ws] as const,
  branding: (ws: string | null, host?: string) => ['branding', ws, host ?? null] as const,
  settings: (ws: string) => [ws, 'settings'] as const,
  templates: () => ['templates'] as const,

  contacts: (ws: string, f?: ContactFilters) => (f ? ([ws, 'contacts', f] as const) : ([ws, 'contacts'] as const)),
  contact: (ws: string, id: string) => [ws, 'contact', id] as const,
  savedViews: (ws: string) => [ws, 'saved-views'] as const,
  timeline: (ws: string, id: string) => [ws, 'timeline', id] as const,
  /** Under the timeline key, so anything that refreshes the timeline refreshes this too. */
  contactSummary: (ws: string, id: string) => [ws, 'timeline', id, 'summary'] as const,
  duplicate: (ws: string, phone: string) => [ws, 'duplicate', phone] as const,

  pipelines: (ws: string) => [ws, 'pipelines'] as const,
  deals: (ws: string, pipelineId?: string) => (pipelineId ? ([ws, 'deals', pipelineId] as const) : ([ws, 'deals'] as const)),
  contactDeals: (ws: string, contactId: string) => [ws, 'deals', 'contact', contactId] as const,
  reasons: (ws: string, pipelineId: string) => [ws, 'reasons', pipelineId] as const,

  fields: (ws: string) => [ws, 'fields'] as const,
  members: (ws: string) => [ws, 'members'] as const,

  tasks: (ws: string, f?: { due?: TaskBucket; contact_id?: string; assigned_to?: string }) =>
    f ? ([ws, 'tasks', f] as const) : ([ws, 'tasks'] as const),

  home: (ws: string, scope: 'me' | 'team') => [ws, 'home', scope] as const,

  notifications: (ws: string) => [ws, 'notifications'] as const,
  notificationSettings: (ws: string) => [ws, 'notification-settings'] as const,

  conversations: (ws: string) => [ws, 'conversations'] as const,
  messages: (ws: string, id: string) => [ws, 'messages', id] as const,
  savedReplies: (ws: string) => [ws, 'saved-replies'] as const,
  waTemplates: (ws: string) => [ws, 'wa-templates'] as const,

  report: (ws: string, name: string, f: ReportFilters) => [ws, 'report', name, f] as const,

  leadSources: (ws: string) => [ws, 'lead-sources'] as const,
  assignment: (ws: string) => [ws, 'assignment'] as const,
  automations: (ws: string) => [ws, 'automations'] as const,

  subscription: (scope: string) => ['billing', scope, 'subscription'] as const,
  invoices: (scope: string) => ['billing', scope, 'invoices'] as const,
  plans: () => ['billing', 'plans'] as const,
  commission: (partnerId: string, month?: string) => ['billing', partnerId, 'commission', month ?? null] as const,

  partnerWorkspaces: () => ['partner', 'workspaces'] as const,
  partnerDomains: () => ['partner', 'domains'] as const,
};
