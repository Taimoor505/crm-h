'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowLeft, Check, CheckCheck, FileText, Send, MessageSquareText} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useConversations, useLogWhatsApp, useMessages, useSavedReplies, useSendMessage, useWhatsAppTemplates } from '@/hooks/queries/work';
import { qk } from '@/hooks/queries/keys';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { useWorkspaceId } from '@/lib/auth/SessionProvider';
import { usePermissions } from '@/lib/permissions';
import { markConversationRead } from '@/lib/api/endpoints/work';
import { dayKey, formatDate, formatWeekday, isToday } from '@/lib/format';
import { waLink } from '@/lib/phone/links';
import { countUsefulAction } from '@/lib/ui-store';
import type { Message, WhatsAppTemplate } from '@/lib/api/types';
import { InboxList } from '@/components/crm/InboxList';
import { Avatar } from '@/components/crm/badges';
import { TimeText } from '@/components/crm/values';
import { PhoneText } from '@/components/crm/PhoneText';
import { CallButton } from '@/components/crm/ContactActions';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/crm/states';
import { ResponsiveSheet } from '@/components/crm/ResponsiveSheet';
import { cn, firstName } from '@/lib/utils';

/** Sending through the WhatsApp Cloud API is behind a flag (brief §8.7); otherwise click-to-chat. */
const CLOUD_API = process.env.NEXT_PUBLIC_WHATSAPP_CLOUD_API === 'true';

export default function ConversationPage({ params }: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = use(params);
  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-card lg:block lg:h-[calc(100dvh-7.5rem)]">
        <InboxList activeId={conversationId} />
      </div>
      <Chat id={conversationId} />
    </div>
  );
}

function Chat({ id }: { id: string }) {
  const t = useTranslations('inbox');
  const s = useWorkspaceSettings();
  const ws = useWorkspaceId();
  const qc = useQueryClient();
  const { canWrite } = usePermissions();
  const conversations = useConversations();
  const conv = conversations.data?.find((c) => c.id === id);
  const messages = useMessages(id);
  const replies = useSavedReplies();
  const send = useSendMessage(id);
  const log = useLogWhatsApp();
  const [text, setText] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const markRead = useMutation({ mutationFn: () => markConversationRead(id), meta: { silent: true }, onSuccess: () => qc.invalidateQueries({ queryKey: qk.conversations(ws) }) });
  useEffect(() => {
    if (conv && conv.unread_count > 0) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.id, conv?.unread_count]);

  useEffect(() => endRef.current?.scrollIntoView({ block: 'end' }), [messages.data?.length]);

  const groups = useMemo(() => {
    const map = new Map<string, Message[]>();
    for (const m of messages.data ?? []) {
      const k = dayKey(m.sent_at, s.timezone);
      map.set(k, [...(map.get(k) ?? []), m]);
    }
    return [...map.entries()];
  }, [messages.data, s.timezone]);

  function submit(body: string, type: 'text' | 'template' = 'text') {
    const msg = body.trim();
    if (!msg || !conv?.contact) return;
    countUsefulAction();
    if (CLOUD_API) {
      send.mutate({ body: msg, type }, { onSuccess: () => toast.success(t('sent')) });
    } else {
      window.open(waLink(conv.contact.phone_e164, msg), '_blank', 'noopener');
      log.mutate({ contactId: conv.contact_id, text: msg });
      toast.success(t('opened'));
    }
    setText('');
  }

  if (conversations.isLoading) return <ListSkeleton rows={6} />;
  if (!conv) return <ErrorState title={t('notFound')} onRetry={() => conversations.refetch()} />;
  const name = conv.contact?.name ?? '';

  return (
    <section className="-mx-4 -mt-4 flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] flex-col bg-gray-100 lg:mx-0 lg:mt-0 lg:h-[calc(100dvh-7.5rem)] lg:overflow-hidden lg:rounded-xl lg:border lg:shadow-card">
      <header className="flex items-center gap-2 border-b bg-white px-2 py-2">
        <Link href="/inbox" aria-label={t('back')} className="grid size-11 place-items-center rounded-full hover:bg-gray-100 lg:hidden">
          <ArrowLeft className="size-5 rtl:rotate-180" aria-hidden="true" />
        </Link>
        <Avatar name={name} seed={conv.contact_id} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <PhoneText e164={conv.contact?.phone_e164} className="text-xs text-gray-600" />
        </div>
        {conv.contact && <CallButton contactId={conv.contact_id} name={name} phone={conv.contact.phone_e164} />}
        <Link href={`/contacts/${conv.contact_id}`} className="inline-flex h-11 items-center rounded-full px-3 text-sm font-medium text-brand-ink hover:bg-gray-100">
          {t('viewLead')}
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-4" aria-live="polite">
        {messages.isLoading ? (
          <ListSkeleton rows={4} />
        ) : messages.isError ? (
          <ErrorState onRetry={() => messages.refetch()} />
        ) : !groups.length ? (
          <EmptyState title={t('noMessages')} />
        ) : (
          groups.map(([day, list]) => (
            <div key={day} className="space-y-1.5">
              <p className="sticky top-0 mx-auto my-3 w-fit rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-gray-600 shadow-sm">
                {isToday(list[0].sent_at, s.timezone) ? formatWeekday(list[0].sent_at, s) : formatDate(list[0].sent_at, s)}
              </p>
              {list.map((m) => (
                <Bubble key={m.id} m={m} />
              ))}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {canWrite && (
        <div className="border-t bg-white px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:pb-2">
          {(replies.data?.length ?? 0) > 0 && (
            <div role="group" aria-label={t('savedReplies')} className="scrollbar-none -mx-3 mb-2 flex gap-2 overflow-x-auto px-3">
              {replies.data!.map((r) => (
                <button key={r.id} type="button" onClick={() => setText(r.body)} className="min-h-9 shrink-0 rounded-full border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  {r.title}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
            className="flex items-end gap-2"
          >
            <button type="button" onClick={() => setTemplatesOpen(true)} aria-label={t('templates')} className="grid size-11 shrink-0 place-items-center rounded-full text-gray-600 hover:bg-gray-100">
              <FileText className="size-5" aria-hidden="true" />
            </button>
            <label htmlFor="composer" className="sr-only">{t('composer')}</label>
            <Textarea
              id="composer"
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit(text);
                }
              }}
              placeholder={t('composerPlaceholder')}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl"
            />
            <Button type="submit" size="icon" className="size-11 shrink-0 rounded-full" disabled={!text.trim() || send.isPending} aria-label={CLOUD_API ? t('send') : t('openWhatsApp')}>
              <Send className="size-4 rtl:rotate-180" aria-hidden="true" />
            </Button>
          </form>
          {!CLOUD_API && <p className="mt-1.5 text-center text-[11px] text-gray-500">{t('clickToChatHint')}</p>}
        </div>
      )}

      {templatesOpen && <TemplatesSheet name={name} onClose={() => setTemplatesOpen(false)} onUse={(body) => { setTemplatesOpen(false); setText(body); }} />}
    </section>
  );
}

function Bubble({ m }: { m: Message }) {
  const t = useTranslations('inbox');
  const out = m.direction === 'outbound';
  const statusLabel = ['sent', 'delivered', 'read', 'failed'].includes(m.status) ? t(`status_${m.status as 'sent'}`) : null;
  return (
    <div className={cn('flex', out ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[80%] rounded-lg px-3 py-1.5 text-sm shadow-sm', out ? 'rounded-se-none bg-brand-surface' : 'rounded-ss-none bg-white')}>
        <p className="break-words whitespace-pre-wrap text-gray-900">{m.body}</p>
        <p className="mt-0.5 flex items-center justify-end gap-1 text-[10px] text-gray-500">
          <TimeText iso={m.sent_at} />
          {out && (m.status === 'read' ? <CheckCheck className="size-3 text-sky-600" aria-label={statusLabel ?? undefined} /> : m.status === 'delivered' ? <CheckCheck className="size-3" aria-label={statusLabel ?? undefined} /> : <Check className="size-3" aria-label={statusLabel ?? undefined} />)}
        </p>
      </div>
    </div>
  );
}

function TemplatesSheet({ name, onClose, onUse }: { name: string; onClose: () => void; onUse: (body: string) => void }) {
  const t = useTranslations('inbox');
  const templates = useWhatsAppTemplates();
  const fill = (tpl: WhatsAppTemplate) => tpl.body.replace('{{1}}', firstName(name));
  return (
    <ResponsiveSheet open onOpenChange={(o) => !o && onClose()} title={t('templatesTitle')} icon={MessageSquareText} description={t('templatesHint')}>
      {templates.isLoading ? (
        <ListSkeleton rows={3} />
      ) : (
        <ul className="stagger space-y-2">
          {(templates.data ?? []).map((tpl) => (
            <li key={tpl.name} className="rounded-lg border p-3">
              <p className="font-mono text-xs text-gray-500">{tpl.name}</p>
              <p className="mt-1 text-sm text-gray-900">{fill(tpl)}</p>
              <Button variant="outline" className="mt-2 h-10" onClick={() => onUse(fill(tpl))}>
                {t('useTemplate')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </ResponsiveSheet>
  );
}
