'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as crm from '@/lib/api/endpoints/crm';
import type { ContactFilters, ContactPatch, DealInput, FieldInput, QuickAddInput } from '@/lib/api/endpoints/crm';
import type { Activity, CallOutcome, Contact, Deal, Page, ReasonPresets, StageKind, TeamMember, WorkspaceRole } from '@/lib/api/types';
import { useSession, useWorkspaceId } from '@/lib/auth/SessionProvider';
import { qk } from './keys';

// ------------------------------------------------------------- contacts

export function useContacts(filters: ContactFilters) {
  const ws = useWorkspaceId();
  return useInfiniteQuery({
    queryKey: qk.contacts(ws, filters),
    queryFn: ({ pageParam }) => crm.listContacts({ ...filters, cursor: pageParam, limit: 50 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: Boolean(ws),
  });
}

export function useContact(id: string) {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.contact(ws, id), queryFn: () => crm.getContact(id), enabled: Boolean(ws && id) });
}

export function useUpdateContact(id: string) {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ContactPatch) => crm.updateContact(id, patch),
    onSuccess: (c) => {
      qc.setQueryData(qk.contact(ws, id), c);
      qc.invalidateQueries({ queryKey: qk.contacts(ws) });
    },
  });
}

export function useDuplicateCheck(phoneE164: string | null, country?: string) {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: qk.duplicate(ws, phoneE164 ?? ''),
    queryFn: () => crm.checkDuplicate(phoneE164!, country),
    enabled: Boolean(ws && phoneE164),
    staleTime: 60_000,
  });
}

export function useQuickAdd() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: QuickAddInput) => crm.quickAdd(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.contacts(ws) });
      qc.invalidateQueries({ queryKey: [ws, 'home'] });
      qc.invalidateQueries({ queryKey: qk.tasks(ws) });
    },
  });
}

/** Optimistic: the owner changes on screen before the server answers. */
export function useAssignContact() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string | null }) => crm.assignContact(id, userId),
    onMutate: async ({ id, userId }) => {
      await qc.cancelQueries({ queryKey: qk.contact(ws, id) });
      const prev = qc.getQueryData<Contact>(qk.contact(ws, id));
      if (prev) qc.setQueryData(qk.contact(ws, id), { ...prev, owner_id: userId });
      return { prev };
    },
    onError: (_e, { id }, ctx) => ctx?.prev && qc.setQueryData(qk.contact(ws, id), ctx.prev),
    onSettled: (_d, _e, { id }) => {
      qc.invalidateQueries({ queryKey: qk.contact(ws, id) });
      qc.invalidateQueries({ queryKey: qk.contacts(ws) });
      qc.invalidateQueries({ queryKey: qk.timeline(ws, id) });
    },
  });
}

export function useMergeContacts() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ primaryId, secondaryId }: { primaryId: string; secondaryId: string }) => crm.mergeContacts(primaryId, secondaryId),
    onSuccess: (c) => {
      qc.setQueryData(qk.contact(ws, c.id), c);
      qc.invalidateQueries({ queryKey: qk.contacts(ws) });
      qc.invalidateQueries({ queryKey: qk.timeline(ws, c.id) });
      qc.invalidateQueries({ queryKey: qk.deals(ws) });
    },
  });
}

export function useTimeline(id: string) {
  const ws = useWorkspaceId();
  return useInfiniteQuery({
    queryKey: qk.timeline(ws, id),
    queryFn: ({ pageParam }) => crm.getTimeline(id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    enabled: Boolean(ws && id),
  });
}

function prependActivity(qc: ReturnType<typeof useQueryClient>, key: readonly unknown[], a: Activity) {
  qc.setQueryData<{ pages: Page<Activity>[]; pageParams: unknown[] }>(key, (old) =>
    old ? { ...old, pages: [{ ...old.pages[0], data: [a, ...old.pages[0].data] }, ...old.pages.slice(1)] } : old,
  );
}

/** Optimistic: the note appears in the timeline immediately. */
export function useAddNote(contactId: string) {
  const ws = useWorkspaceId();
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => crm.addNote(contactId, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.timeline(ws, contactId) });
      const prev = qc.getQueryData(qk.timeline(ws, contactId));
      prependActivity(qc, qk.timeline(ws, contactId), {
        id: `optimistic-${Date.now()}`, contact_id: contactId, deal_id: null, type: 'note', actor_id: session?.userId ?? null, body, meta: { pending: true }, created_at: new Date().toISOString(),
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(qk.timeline(ws, contactId), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.timeline(ws, contactId) }),
  });
}

export function useLogCall(contactId: string) {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { outcome: CallOutcome; note?: string; deal_id?: string }) => crm.logCall(contactId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.timeline(ws, contactId) });
      qc.invalidateQueries({ queryKey: qk.contact(ws, contactId) });
      qc.invalidateQueries({ queryKey: [ws, 'home'] });
    },
  });
}

// ------------------------------------------------------------- pipelines & deals

export function usePipelines() {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.pipelines(ws), queryFn: crm.listPipelines, enabled: Boolean(ws), staleTime: 5 * 60_000 });
}

export function useDeals(pipelineId: string | undefined) {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: qk.deals(ws, pipelineId),
    queryFn: () => crm.listDeals({ pipeline_id: pipelineId }),
    enabled: Boolean(ws && pipelineId),
  });
}

export function useAllDeals() {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: [...qk.deals(ws), 'all'], queryFn: () => crm.listDeals({}), enabled: Boolean(ws) });
}

export function useContactDeals(contactId: string) {
  const ws = useWorkspaceId();
  return useQuery({
    queryKey: qk.contactDeals(ws, contactId),
    queryFn: () => crm.listDeals({ contact_id: contactId }),
    enabled: Boolean(ws && contactId),
  });
}

export function useCreateDeal() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DealInput) => crm.createDeal(input),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: qk.deals(ws) });
      qc.invalidateQueries({ queryKey: qk.timeline(ws, d.contact_id) });
    },
  });
}

/** Optimistic move with rollback on error (brief Phase 9). */
export function useMoveDeal(pipelineId: string | undefined) {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const key = qk.deals(ws, pipelineId);
  return useMutation({
    mutationFn: ({ id, stageId, reason }: { id: string; stageId: string; reason?: { lost_reason?: string; won_reason?: string } }) =>
      crm.moveDeal(id, stageId, reason),
    onMutate: async ({ id, stageId, reason }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Deal[]>(key);
      qc.setQueryData<Deal[]>(key, (old) =>
        old?.map((d) => (d.id === id ? { ...d, stage_id: stageId, stage_entered_at: new Date().toISOString(), lost_reason: reason?.lost_reason ?? null, won_reason: reason?.won_reason ?? null } : d)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(key, ctx.prev),
    onSettled: (d) => {
      qc.invalidateQueries({ queryKey: qk.deals(ws) });
      if (d) qc.invalidateQueries({ queryKey: qk.timeline(ws, d.contact_id) });
      qc.invalidateQueries({ queryKey: [ws, 'report'] });
    },
  });
}

export function useReasons(pipelineId: string | undefined) {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.reasons(ws, pipelineId ?? ''), queryFn: () => crm.getReasons(pipelineId!), enabled: Boolean(ws && pipelineId), staleTime: 5 * 60_000 });
}

export function useSaveReasons(pipelineId: string) {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: ReasonPresets) => crm.saveReasons(pipelineId, r),
    onSuccess: (r) => qc.setQueryData(qk.reasons(ws, pipelineId), r),
  });
}

export function usePipelineMutations() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.pipelines(ws) });
  return {
    createPipeline: useMutation({ mutationFn: (name: string) => crm.createPipeline(name), onSuccess: invalidate }),
    createStage: useMutation({ mutationFn: (v: { pipelineId: string; name: string; kind: StageKind; position?: number }) => crm.createStage(v.pipelineId, v), onSuccess: invalidate }),
    updateStage: useMutation({ mutationFn: (v: { pipelineId: string; stageId: string; name?: string; position?: number; kind?: StageKind }) => crm.updateStage(v.pipelineId, v.stageId, v), onSuccess: invalidate }),
    deleteStage: useMutation({
      mutationFn: (v: { pipelineId: string; stageId: string; moveTo: string }) => crm.deleteStage(v.pipelineId, v.stageId, v.moveTo),
      onSuccess: () => {
        invalidate();
        qc.invalidateQueries({ queryKey: qk.deals(ws) });
      },
    }),
  };
}

// ------------------------------------------------------------- custom fields

export function useFields() {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.fields(ws), queryFn: () => crm.listFields(), enabled: Boolean(ws), staleTime: 5 * 60_000 });
}

export function useFieldMutations() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.fields(ws) });
  return {
    create: useMutation({ mutationFn: (input: FieldInput) => crm.createField(input), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: (v: { id: string; label?: string; options?: string[]; required?: boolean; hidden?: boolean; position?: number }) => crm.updateField(v.id, v),
      onSuccess: invalidate,
    }),
  };
}

// ------------------------------------------------------------- team

export function useMembers() {
  const ws = useWorkspaceId();
  return useQuery({ queryKey: qk.members(ws), queryFn: () => crm.listMembers(ws), enabled: Boolean(ws), staleTime: 5 * 60_000 });
}

/** id → name lookup for owners and assignees. */
export function useMemberNames(): (id: string | null | undefined) => string | null {
  const { data } = useMembers();
  const map = new Map<string, TeamMember>((data ?? []).map((m) => [m.user_id, m]));
  return (id) => (id ? map.get(id)?.name ?? null : null);
}

export function useTeamMutations() {
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.members(ws) });
    qc.invalidateQueries({ queryKey: qk.assignment(ws) });
  };
  return {
    invite: useMutation({ mutationFn: (v: { name: string; phone?: string; email?: string; role: WorkspaceRole }) => crm.invite(v), onSuccess: invalidate }),
    update: useMutation({ mutationFn: (v: { id: string; role?: WorkspaceRole; status?: 'active' | 'suspended' }) => crm.updateMembership(v.id, v), onSuccess: invalidate }),
  };
}
