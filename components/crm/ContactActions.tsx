'use client';

import { useTranslations } from 'next-intl';
import { Check, MessageCircle, Phone } from 'lucide-react';
import { toast } from 'sonner';
import type { Task } from '@/lib/api/types';
import { useCompleteTask } from '@/hooks/queries/work';
import { useLogWhatsApp } from '@/hooks/queries/work';
import { countUsefulAction, startCall } from '@/lib/ui-store';
import { waLink } from '@/lib/phone';
import { usePermissions } from '@/lib/permissions';
import { cn, firstName } from '@/lib/utils';

const iconBtn = 'grid size-11 shrink-0 place-items-center rounded-full border bg-white text-gray-800 hover:bg-gray-50';

/** One-tap Call: opens the dialer and asks for the outcome on return. */
export function CallButton({ contactId, name, phone, taskId, dealId, label, className }: { contactId: string; name: string; phone: string; taskId?: string; dealId?: string; label?: boolean; className?: string }) {
  const t = useTranslations('actions');
  const { canWrite } = usePermissions();
  return (
    <a
      href={`tel:${phone}`}
      onClick={(e) => {
        if (!canWrite) return;
        e.preventDefault();
        countUsefulAction();
        startCall({ contactId, contactName: name, phone, taskId, dealId });
      }}
      aria-label={label ? undefined : t('callName', { name })}
      className={cn(label ? 'inline-flex h-11 items-center gap-2 rounded-full border bg-white px-4 text-sm font-medium hover:bg-gray-50' : iconBtn, className)}
    >
      <Phone className="size-4" aria-hidden="true" />
      {label && t('call')}
    </a>
  );
}

/** One-tap WhatsApp: opens wa.me with a greeting and logs the click. */
export function WhatsAppButton({ contactId, name, phone, label, className, text }: { contactId: string; name: string; phone: string; label?: boolean; className?: string; text?: string }) {
  const t = useTranslations('actions');
  const log = useLogWhatsApp();
  const { canWrite } = usePermissions();
  const message = text ?? t('waGreeting', { name: firstName(name) });
  return (
    <a
      href={waLink(phone, message)}
      target="_blank"
      rel="noreferrer"
      onClick={() => {
        if (canWrite) log.mutate({ contactId, text: message });
        countUsefulAction();
      }}
      aria-label={label ? undefined : t('whatsappName', { name })}
      className={cn(label ? 'inline-flex h-11 items-center gap-2 rounded-full border bg-white px-4 text-sm font-medium hover:bg-gray-50' : iconBtn, 'text-green-700', className)}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      {label && <span className="text-gray-800">{t('whatsapp')}</span>}
    </a>
  );
}

/** Done: completes the follow-up optimistically. */
export function DoneButton({ task, className }: { task: Task; className?: string }) {
  const t = useTranslations('actions');
  const complete = useCompleteTask();
  const { canWrite } = usePermissions();
  if (!canWrite) return null;
  return (
    <button
      type="button"
      onClick={() => {
        countUsefulAction();
        complete.mutate({ task }, { onSuccess: () => toast.success(t('completed')) });
      }}
      disabled={complete.isPending}
      aria-label={t('markDone', { title: task.title })}
      className={cn(iconBtn, 'text-brand-ink', className)}
    >
      <Check className="size-4" aria-hidden="true" />
    </button>
  );
}
