'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateTask, useUpdateTask } from '@/hooks/queries/work';
import { useMembers } from '@/hooks/queries/crm';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { usePermissions } from '@/lib/permissions';
import { presetDueAt } from '@/lib/format/presets';
import { countUsefulAction } from '@/lib/ui-store';
import type { Task, TaskType } from '@/lib/api/types';
import { ResponsiveSheet } from './ResponsiveSheet';
import { Chip, DuePicker } from './DuePicker';

const TYPES: TaskType[] = ['call', 'whatsapp', 'meeting', 'site_visit', 'other'];

export function FollowUpSheet({ open, onOpenChange, contactId, dealId }: { open: boolean; onOpenChange: (o: boolean) => void; contactId?: string; dealId?: string }) {
  const t = useTranslations('followUpForm');
  const tt = useTranslations('taskTypes');
  const c = useTranslations('common');
  const s = useWorkspaceSettings();
  const { can } = usePermissions();
  const members = useMembers();
  const create = useCreateTask();
  const [type, setType] = useState<TaskType>('call');
  const [due, setDue] = useState<string | null>(() => presetDueAt('tomorrow', s.timezone));
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      footer={
        <Button
          className="h-11 w-full"
          disabled={!due || create.isPending}
          onClick={() =>
            create.mutate(
              { type, due_at: due!, title: title.trim() || undefined, contact_id: contactId ?? null, deal_id: dealId ?? null, assigned_to: assignee || undefined },
              {
                onSuccess: () => {
                  countUsefulAction();
                  toast.success(t('added'));
                  onOpenChange(false);
                },
              },
            )
          }
        >
          {t('save')}
        </Button>
      }
    >
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('type')}</legend>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((x) => (
              <Chip key={x} selected={type === x} onClick={() => setType(x)}>
                {tt(x)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('when')}</legend>
          <DuePicker onChange={setDue} idPrefix="fu" />
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="fu-title">{t('titleLabel')}</Label>
          <Input id="fu-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('titlePlaceholder')} className="h-11" />
        </div>
        {can('tasks.assign_others') && (
          <div className="space-y-1.5">
            <Label htmlFor="fu-assignee">{t('assignee')}</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="fu-assignee" className="h-11 w-full">
                <SelectValue placeholder={c('me')} />
              </SelectTrigger>
              <SelectContent>
                {(members.data ?? []).filter((m) => m.status === 'active').map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </ResponsiveSheet>
  );
}

export function RescheduleSheet({ open, onOpenChange, task }: { open: boolean; onOpenChange: (o: boolean) => void; task: Task }) {
  const t = useTranslations('followUpForm');
  const update = useUpdateTask();
  const [due, setDue] = useState<string | null>(null);
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('rescheduleTitle')}
      description={task.title}
      footer={
        <Button
          className="h-11 w-full"
          disabled={!due || update.isPending}
          onClick={() => update.mutate({ id: task.id, due_at: due! }, { onSuccess: () => { toast.success(t('rescheduled')); onOpenChange(false); } })}
        >
          {t('rescheduleTitle')}
        </Button>
      }
    >
      <DuePicker onChange={setDue} initial="tomorrow" idPrefix={`rs-${task.id}`} />
    </ResponsiveSheet>
  );
}
