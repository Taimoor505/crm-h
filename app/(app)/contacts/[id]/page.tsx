'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRightLeft, CalendarPlus, Columns3, Copy, GitMerge, Mail, MessageCircle, MoreVertical, NotebookPen, Pencil,
  Phone, Plus, Settings2, Trash2, UserCheck, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  useAddNote, useAssignContact, useContact, useContactDeals, useFields, useMemberNames, useMembers, useMergeContacts, usePipelines,
  useTimeline, useUpdateContact,
} from '@/hooks/queries/crm';
import { useContactTasks } from '@/hooks/queries/work';
import { qk } from '@/hooks/queries/keys';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { useWorkspaceId } from '@/lib/auth/SessionProvider';
import { usePermissions } from '@/lib/permissions';
import { deleteContact, listContacts } from '@/lib/api/endpoints/crm';
import { daysSince, dayKey, formatWeekday, formatDate, isToday } from '@/lib/format';
import { countUsefulAction } from '@/lib/ui-store';
import type { Activity, Contact, CustomFieldDef, Deal, Pipeline } from '@/lib/api/types';
import { Avatar, SourceBadge, StageBadge, StatusBadge } from '@/components/crm/badges';
import { DateText, MoneyText, RelativeTime, TimeText } from '@/components/crm/values';
import { PhoneText } from '@/components/crm/PhoneText';
import { CallButton, DoneButton, WhatsAppButton } from '@/components/crm/ContactActions';
import { EmptyState, ErrorState, ListSkeleton, PageSkeleton } from '@/components/crm/states';
import { ResponsiveSheet } from '@/components/crm/ResponsiveSheet';
import { FollowUpSheet } from '@/components/crm/FollowUpSheet';
import { MoveDealSheet } from '@/components/crm/MoveDealSheet';
import { DealSheet } from '@/components/crm/DealSheet';
import { CustomFieldInput, CustomFieldValue } from '@/components/crm/CustomFields';
import { Chip } from '@/components/crm/DuePicker';
import { cn, humanize } from '@/lib/utils';

type SheetName = 'note' | 'followup' | 'move' | 'deal' | 'assign' | 'merge' | 'edit' | 'delete' | null;

export default function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('contact');
  const contact = useContact(id);

  if (contact.isLoading) return <PageSkeleton />;
  if (contact.isError || !contact.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState title={t('notFound')} onRetry={() => contact.refetch()} />
      </div>
    );
  }
  return <ContactView contact={contact.data} />;
}

function BackLink() {
  const t = useTranslations('contact');
  return (
    <Link href="/leads" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-gray-700 hover:text-gray-900">
      <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
      {t('back')}
    </Link>
  );
}

function ContactView({ contact }: { contact: Contact }) {
  const t = useTranslations('contact');
  const a = useTranslations('actions');
  const { can, canWrite } = usePermissions();
  const ownerName = useMemberNames();
  const deals = useContactDeals(contact.id);
  const pipelines = usePipelines();
  const [sheet, setSheet] = useState<SheetName>(null);

  const primaryDeal = useMemo(() => {
    const list = deals.data ?? [];
    const kindOf = (d: Deal) => pipelines.data?.find((p) => p.id === d.pipeline_id)?.stages.find((s) => s.id === d.stage_id)?.kind;
    return list.find((d) => kindOf(d) === 'open') ?? list[0] ?? null;
  }, [deals.data, pipelines.data]);
  const primaryPipeline = pipelines.data?.find((p) => p.id === primaryDeal?.pipeline_id) ?? null;
  const primaryStage = primaryPipeline?.stages.find((s) => s.id === primaryDeal?.stage_id) ?? null;

  const actionBtn = 'flex min-h-16 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-xl border bg-white px-1 text-xs font-medium text-gray-800 hover:bg-gray-50';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <BackLink />
        {canWrite && (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={t('moreActions')} className="grid size-11 place-items-center rounded-full hover:bg-gray-100">
              <MoreVertical className="size-5" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem className="min-h-10" onSelect={() => setSheet('edit')}>
                <Pencil className="size-4" aria-hidden="true" />
                {t('editName')}
              </DropdownMenuItem>
              {can('leads.assign') && (
                <DropdownMenuItem className="min-h-10" onSelect={() => setSheet('assign')}>
                  <UserCheck className="size-4" aria-hidden="true" />
                  {a('assign')}
                </DropdownMenuItem>
              )}
              {can('leads.merge') && (
                <DropdownMenuItem className="min-h-10" onSelect={() => setSheet('merge')}>
                  <GitMerge className="size-4" aria-hidden="true" />
                  {a('merge')}
                </DropdownMenuItem>
              )}
              {can('leads.merge') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="min-h-10 text-red-700 focus:text-red-700" onSelect={() => setSheet('delete')}>
                    <Trash2 className="size-4" aria-hidden="true" />
                    {t('delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <header className="rounded-xl border bg-card p-4 shadow-card">
        <div className="flex items-start gap-3">
          <Avatar name={contact.name} seed={contact.id} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-xl font-bold break-words text-gray-900">{contact.name}</h1>
              <StatusBadge status={contact.status} />
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(contact.phone_e164).then(() => toast.success(t('phoneCopied')));
              }}
              aria-label={t('copyPhone')}
              className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900"
            >
              <Phone className="size-3.5" aria-hidden="true" />
              <PhoneText e164={contact.phone_e164} />
              <Copy className="size-3.5 text-gray-400" aria-hidden="true" />
            </button>
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex min-h-8 items-center gap-1.5 truncate text-sm text-gray-700 hover:text-gray-900">
                <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{contact.email}</span>
              </a>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-gray-500">{t('source')}</dt>
            <dd className="mt-0.5"><SourceBadge source={contact.source} /></dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{t('owner')}</dt>
            <dd className="mt-0.5 truncate font-medium">{ownerName(contact.owner_id) ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{t('stage')}</dt>
            <dd className="mt-0.5">{primaryStage ? <StageBadge name={primaryStage.name} kind={primaryStage.kind} /> : <span className="text-gray-500">{t('noDeal')}</span>}</dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">{t('created')}</dt>
            <dd className="mt-0.5"><RelativeTime iso={contact.created_at} /></dd>
          </div>
        </dl>
        <TagEditor contact={contact} />
      </header>

      <div className="flex gap-2">
        <CallButton contactId={contact.id} name={contact.name} phone={contact.phone_e164} dealId={primaryDeal?.id} className="min-h-16 min-w-0 flex-1 basis-0 flex-col justify-center gap-1 rounded-xl px-1 text-xs" label />
        <WhatsAppButton contactId={contact.id} name={contact.name} phone={contact.phone_e164} className="min-h-16 min-w-0 flex-1 basis-0 flex-col justify-center gap-1 rounded-xl px-1 text-xs" label />
        {canWrite && (
          <>
            <button type="button" className={actionBtn} onClick={() => setSheet('followup')}>
              <CalendarPlus className="size-4" aria-hidden="true" />
              <span className="truncate">{a('followUpShort')}</span>
            </button>
            <button type="button" className={actionBtn} onClick={() => setSheet('note')}>
              <NotebookPen className="size-4" aria-hidden="true" />
              {a('noteShort')}
            </button>
            <button type="button" className={actionBtn} onClick={() => setSheet(primaryDeal ? 'move' : 'deal')}>
              <ArrowRightLeft className="size-4" aria-hidden="true" />
              <span className="truncate">{a('stageShort')}</span>
            </button>
          </>
        )}
      </div>

      <OpenFollowUps contactId={contact.id} />

      <Tabs defaultValue="timeline">
        <TabsList className="h-11 w-full">
          <TabsTrigger value="timeline" className="h-9">{t('tabTimeline')}</TabsTrigger>
          <TabsTrigger value="details" className="h-9">{t('tabDetails')}</TabsTrigger>
          <TabsTrigger value="deals" className="h-9">
            {t('tabDeals')}
            {deals.data?.length ? <span className="ms-1 rounded-full bg-gray-200 px-1.5 text-[11px] tabular-nums">{deals.data.length}</span> : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <Timeline contactId={contact.id} />
        </TabsContent>
        <TabsContent value="details">
          <Details contact={contact} />
        </TabsContent>
        <TabsContent value="deals">
          <DealsTab deals={deals.data ?? []} loading={deals.isLoading} pipelines={pipelines.data ?? []} onAdd={() => setSheet('deal')} />
        </TabsContent>
      </Tabs>

      {sheet === 'note' && <NoteSheet contactId={contact.id} onClose={() => setSheet(null)} />}
      {sheet === 'followup' && <FollowUpSheet open onOpenChange={(o) => !o && setSheet(null)} contactId={contact.id} dealId={primaryDeal?.id} />}
      {sheet === 'move' && primaryDeal && primaryPipeline && <MoveDealSheet open onOpenChange={(o) => !o && setSheet(null)} deal={primaryDeal} pipeline={primaryPipeline} />}
      {sheet === 'deal' && <DealSheet open onOpenChange={(o) => !o && setSheet(null)} contactId={contact.id} contactName={contact.name} />}
      {sheet === 'assign' && <AssignSheet contact={contact} onClose={() => setSheet(null)} />}
      {sheet === 'merge' && <MergeSheet contact={contact} onClose={() => setSheet(null)} />}
      {sheet === 'edit' && <EditSheet contact={contact} onClose={() => setSheet(null)} />}
      {sheet === 'delete' && <DeleteSheet contact={contact} onClose={() => setSheet(null)} />}
    </div>
  );
}

function TagEditor({ contact }: { contact: Contact }) {
  const t = useTranslations('contact');
  const { canWrite } = usePermissions();
  const update = useUpdateContact(contact.id);
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState('');
  const save = (tags: string[]) => update.mutate({ tags });
  return (
    <div className="mt-4">
      <p className="text-xs text-gray-500">{t('tags')}</p>
      <ul className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {contact.tags.map((tag) => (
          <li key={tag} className="inline-flex items-center gap-1 rounded-full bg-gray-100 ps-2.5 text-xs font-medium text-gray-800">
            {humanize(tag)}
            {canWrite ? (
              <button type="button" aria-label={t('removeTag', { tag })} onClick={() => save(contact.tags.filter((x) => x !== tag))} className="grid size-7 place-items-center rounded-full hover:bg-gray-200">
                <X className="size-3" aria-hidden="true" />
              </button>
            ) : (
              <span className="pe-2.5" />
            )}
          </li>
        ))}
        {canWrite &&
          (adding ? (
            <li>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = value.trim();
                  if (v && !contact.tags.includes(v)) save([...contact.tags, v]);
                  setValue('');
                  setAdding(false);
                }}
              >
                <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => setAdding(false)} placeholder={t('tagPlaceholder')} aria-label={t('addTag')} className="h-8 w-32 text-xs" />
              </form>
            </li>
          ) : (
            <li>
              <button type="button" onClick={() => setAdding(true)} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-gray-300 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                <Plus className="size-3" aria-hidden="true" />
                {t('addTag')}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

function OpenFollowUps({ contactId }: { contactId: string }) {
  const t = useTranslations('contact');
  const tasks = useContactTasks(contactId);
  const list = tasks.data?.data ?? [];
  if (!list.length) return null;
  return (
    <section className="rounded-xl border bg-card shadow-card">
      <h2 className="px-4 pt-3 pb-1 font-heading text-sm font-semibold">{t('openFollowUps')}</h2>
      <ul className="divide-y divide-gray-100">
        {list.map((task) => (
          <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{task.title}</p>
              <p className={cn('text-xs', task.is_overdue ? 'font-semibold text-red-700' : 'text-gray-600')}>
                <DateText iso={task.due_at} withTime />
              </p>
            </div>
            <DoneButton task={task} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const ACTIVITY_ICONS: Record<string, typeof Phone> = {
  note: NotebookPen,
  call: Phone,
  whatsapp: MessageCircle,
  stage_change: Columns3,
  assignment: UserCheck,
  task: CalendarPlus,
  system: Settings2,
};

function Timeline({ contactId }: { contactId: string }) {
  const t = useTranslations('contact');
  const tl = useTranslations('timeline');
  const c = useTranslations('common');
  const s = useWorkspaceSettings();
  const names = useMemberNames();
  const q = useTimeline(contactId);
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);

  // Newest first, grouped by day in the workspace time zone.
  const groups = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of items) {
      const k = dayKey(a.created_at, s.timezone);
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return [...map.entries()];
  }, [items, s.timezone]);

  if (q.isLoading) return <ListSkeleton rows={4} />;
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!items.length) return <EmptyState title={t('timelineEmpty')} body={t('timelineEmptyBody')} />;

  const yesterday = dayKey(new Date(Date.now() - 86400_000), s.timezone);
  return (
    <div className="space-y-5 pt-2">
      {groups.map(([day, list]) => (
        <section key={day}>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            {isToday(list[0].created_at, s.timezone) ? tl('today') : day === yesterday ? tl('yesterday') : `${formatWeekday(list[0].created_at, s)}, ${formatDate(list[0].created_at, s)}`}
          </h3>
          <ol className="relative space-y-3 border-s border-gray-200 ps-5">
            {list.map((a) => {
              const Icon = ACTIVITY_ICONS[a.type] ?? Settings2;
              const pending = Boolean(a.meta.pending);
              return (
                <li key={a.id} className={cn('relative', pending && 'opacity-60')}>
                  <span className="absolute -start-[1.95rem] grid size-6 place-items-center rounded-full border bg-white text-gray-600" aria-hidden="true">
                    <Icon className="size-3" />
                  </span>
                  <div className="rounded-lg border bg-card px-3 py-2">
                    <p className="text-xs text-gray-500">
                      <span className="font-medium text-gray-700">{tl(a.type)}</span> · <TimeText iso={a.created_at} />
                      {a.actor_id && names(a.actor_id) ? ` · ${tl('by', { name: names(a.actor_id)! })}` : ''}
                      {pending && ` · ${t('pending')}`}
                    </p>
                    <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-gray-900">{a.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {q.hasNextPage && (
        <Button variant="outline" className="h-11 w-full" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
          {c('loadMore')}
        </Button>
      )}
    </div>
  );
}

function Details({ contact }: { contact: Contact }) {
  const t = useTranslations('contact');
  const fields = useFields();
  const list = (fields.data ?? []).filter((f) => f.entity === 'contact' && !f.hidden);
  if (fields.isLoading) return <ListSkeleton rows={3} />;
  if (!list.length) return <EmptyState title={t('detailsEmpty')} body={t('detailsEmptyBody')} />;
  return (
    <dl className="divide-y divide-gray-100 rounded-xl border bg-card pt-0 shadow-card">
      {list.map((f) => (
        <FieldRow key={f.id} field={f} contact={contact} />
      ))}
    </dl>
  );
}

function FieldRow({ field, contact }: { field: CustomFieldDef; contact: Contact }) {
  const t = useTranslations('contact');
  const c = useTranslations('common');
  const { canWrite } = usePermissions();
  const update = useUpdateContact(contact.id);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<unknown>(contact.custom[field.key]);
  const id = `cf-${field.key}`;
  return (
    <div className="px-4 py-3">
      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ custom: { [field.key]: value } }, { onSuccess: () => { toast.success(t('fieldSaved')); setEditing(false); } });
          }}
          className="space-y-2"
        >
          <Label htmlFor={id}>{field.label}</Label>
          <CustomFieldInput field={field} value={value} onChange={setValue} id={id} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="h-10" onClick={() => { setValue(contact.custom[field.key]); setEditing(false); }}>
              {c('cancel')}
            </Button>
            <Button type="submit" className="h-10" disabled={update.isPending}>
              {c('save')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <dt className="text-xs text-gray-500">{field.label}</dt>
            <dd className="mt-0.5 text-sm text-gray-900">
              <CustomFieldValue field={field} value={contact.custom[field.key]} />
            </dd>
          </div>
          {canWrite && (
            <button type="button" onClick={() => setEditing(true)} aria-label={t('editField', { field: field.label })} className="grid size-10 place-items-center rounded-full text-gray-500 hover:bg-gray-100">
              <Pencil className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DealsTab({ deals, loading, pipelines, onAdd }: { deals: Deal[]; loading: boolean; pipelines: Pipeline[]; onAdd: () => void }) {
  const t = useTranslations('contact');
  const d = useTranslations('deal');
  const s = useWorkspaceSettings();
  const { canWrite } = usePermissions();
  const [moving, setMoving] = useState<Deal | null>(null);
  const [editing, setEditing] = useState<Deal | null>(null);
  if (loading) return <ListSkeleton rows={2} />;
  return (
    <div className="space-y-3 pt-2">
      {deals.length === 0 ? (
        <EmptyState title={t('dealsEmpty')} />
      ) : (
        <ul className="space-y-2">
          {deals.map((deal) => {
            const pipeline = pipelines.find((p) => p.id === deal.pipeline_id);
            const stage = pipeline?.stages.find((x) => x.id === deal.stage_id);
            return (
              <li key={deal.id} className="rounded-xl border bg-card p-3 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{deal.title}</p>
                    <p className="text-xs text-gray-600">{pipeline?.name}</p>
                  </div>
                  <MoneyText value={deal.value} className="font-heading text-base font-bold text-brand-ink" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  {stage && <StageBadge name={stage.name} kind={stage.kind} />}
                  <span>{d('daysInStage', { count: daysSince(deal.stage_entered_at, s.timezone) })}</span>
                  {deal.lost_reason && <span>{d('lostReason', { reason: deal.lost_reason })}</span>}
                  {deal.won_reason && <span>{d('wonReason', { reason: deal.won_reason })}</span>}
                </div>
                {canWrite && pipeline && (
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" className="h-10 flex-1" onClick={() => setMoving(deal)}>
                      {d('moveTitle')}
                    </Button>
                    <Button variant="ghost" className="h-10" onClick={() => setEditing(deal)}>
                      <Pencil className="size-4" aria-hidden="true" />
                      {d('editTitle')}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canWrite && (
        <Button variant="outline" className="h-11 w-full" onClick={onAdd}>
          <Plus className="size-4" aria-hidden="true" />
          {t('addDeal')}
        </Button>
      )}
      {moving && <MoveDealSheet open onOpenChange={(o) => !o && setMoving(null)} deal={moving} pipeline={pipelines.find((p) => p.id === moving.pipeline_id)!} />}
      {editing && <DealSheet open onOpenChange={(o) => !o && setEditing(null)} contactId={editing.contact_id} deal={editing} />}
    </div>
  );
}

function NoteSheet({ contactId, onClose }: { contactId: string; onClose: () => void }) {
  const t = useTranslations('contact');
  const o = useTranslations('offline');
  const c = useTranslations('common');
  const add = useAddNote(contactId);
  const [body, setBody] = useState('');
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('noteTitle')}
      footer={
        <Button
          className="h-11 w-full"
          disabled={!body.trim()}
          onClick={() => {
            add.mutate(body.trim(), { onSuccess: (a) => (a ? toast.success(t('noteSaved')) : toast.info(o('queuedNote'))) });
            countUsefulAction();
            onClose();
          }}
        >
          {c('save')}
        </Button>
      }
    >
      <Label htmlFor="note-body" className="sr-only">{t('noteLabel')}</Label>
      <Textarea id="note-body" autoFocus rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('notePlaceholder')} />
    </ResponsiveSheet>
  );
}

function AssignSheet({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const t = useTranslations('contact');
  const c = useTranslations('common');
  const members = useMembers();
  const assign = useAssignContact();
  return (
    <ResponsiveSheet open onOpenChange={(o) => !o && onClose()} title={t('assignTitle')} description={contact.name}>
      <ul className="grid gap-2">
        {[{ user_id: null as string | null, name: c('unassigned') }, ...(members.data ?? []).filter((m) => m.status === 'active')].map((m) => (
          <li key={m.user_id ?? 'none'}>
            <button
              type="button"
              onClick={() => {
                assign.mutate({ id: contact.id, userId: m.user_id }, { onSuccess: () => toast.success(t('assigned')) });
                onClose();
              }}
              className={cn('flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 text-start text-sm font-medium hover:bg-gray-50', contact.owner_id === m.user_id && 'border-brand bg-brand-surface')}
            >
              {m.user_id ? <Avatar name={m.name} seed={m.user_id} size="sm" /> : <span className="size-7" />}
              {m.name}
            </button>
          </li>
        ))}
      </ul>
    </ResponsiveSheet>
  );
}

function MergeSheet({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const t = useTranslations('contact');
  const ws = useWorkspaceId();
  const router = useRouter();
  const merge = useMergeContacts();
  const [text, setText] = useState('');
  const [other, setOther] = useState<Contact | null>(null);
  const results = useQuery({
    queryKey: qk.contacts(ws, { q: text }),
    queryFn: () => listContacts({ q: text, limit: 8 }),
    enabled: text.trim().length >= 2,
  });
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('mergeTitle')}
      footer={
        other ? (
          <Button
            className="h-11 w-full"
            disabled={merge.isPending}
            onClick={() =>
              merge.mutate(
                { primaryId: contact.id, secondaryId: other.id },
                {
                  onSuccess: () => {
                    toast.success(t('merged'));
                    onClose();
                    router.refresh();
                  },
                },
              )
            }
          >
            {t('mergeConfirm')}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-600">{t('mergeHint', { name: contact.name })}</p>
        {other ? (
          <div className="rounded-lg border border-brand bg-brand-surface p-3 text-sm">
            <p className="font-semibold">{t('mergePreview', { secondary: other.name, primary: contact.name })}</p>
            <p className="mt-1 text-gray-700"><PhoneText e164={other.phone_e164} /></p>
            <button type="button" onClick={() => setOther(null)} className="mt-2 text-xs font-medium text-brand-ink underline">
              {t('mergeSearch')}
            </button>
          </div>
        ) : (
          <>
            <Input autoFocus aria-label={t('mergeSearch')} placeholder={t('mergeSearch')} value={text} onChange={(e) => setText(e.target.value)} className="h-11" />
            <ul className="divide-y rounded-lg border">
              {(results.data?.data ?? []).filter((x) => x.id !== contact.id).map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => setOther(x)} className="flex min-h-12 w-full items-center gap-3 px-3 text-start hover:bg-gray-50">
                    <Avatar name={x.name} seed={x.id} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{x.name}</span>
                      <PhoneText e164={x.phone_e164} className="text-xs text-gray-600" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </ResponsiveSheet>
  );
}

function EditSheet({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const t = useTranslations('contact');
  const c = useTranslations('common');
  const st = useTranslations('contactStatus');
  const update = useUpdateContact(contact.id);
  const [name, setName] = useState(contact.name);
  const [email, setEmail] = useState(contact.email ?? '');
  const [status, setStatus] = useState(contact.status);
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('editName')}
      footer={
        <Button
          className="h-11 w-full"
          disabled={!name.trim() || update.isPending}
          onClick={() => update.mutate({ name: name.trim(), email: email.trim() || null, status }, { onSuccess: () => { toast.success(t('fieldSaved')); onClose(); } })}
        >
          {c('save')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit-name">{t('nameLabel')}</Label>
          <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-email">{t('email')}</Label>
          <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('status')}</legend>
          <div className="flex flex-wrap gap-2">
            {(['new', 'contacted', 'qualified', 'hot', 'cold'] as const).map((x) => (
              <Chip key={x} selected={status === x} onClick={() => setStatus(x)}>
                {st(x)}
              </Chip>
            ))}
          </div>
        </fieldset>
      </div>
    </ResponsiveSheet>
  );
}

function DeleteSheet({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const t = useTranslations('contact');
  const c = useTranslations('common');
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('delete')}
      description={t('deleteConfirm', { name: contact.name })}
      footer={
        <div className="flex w-full gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={onClose}>
            {c('cancel')}
          </Button>
          <Button
            variant="destructive"
            className="h-11 flex-1"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await deleteContact(contact.id);
                qc.invalidateQueries({ queryKey: qk.contacts(ws) });
                toast.success(t('deleted'));
                router.replace('/leads');
              } finally {
                setBusy(false);
              }
            }}
          >
            {c('delete')}
          </Button>
        </div>
      }
    >
      <span />
    </ResponsiveSheet>
  );
}

