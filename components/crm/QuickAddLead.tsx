'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ChevronDown, Mic, Square, Trash2, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDuplicateCheck, useMembers, useQuickAdd } from '@/hooks/queries/crm';
import { useLeadSources } from '@/hooks/queries/admin';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { usePermissions } from '@/lib/permissions';
import { closeQuickAdd, countUsefulAction, useUi } from '@/lib/ui-store';
import { humanize } from '@/lib/utils';
import { ResponsiveSheet } from './ResponsiveSheet';
import { PhoneInput, toPhoneValue, type PhoneValue } from './PhoneInput';

const BASE_SOURCES = ['manual', 'walk_in', 'phone', 'referral', 'whatsapp', 'website'];

function useVoiceRecorder() {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia);
    return () => {
      if (timer.current) clearInterval(timer.current);
      rec.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    r.ondataavailable = (e) => chunks.push(e.data);
    r.onstop = () => {
      setBlob(new Blob(chunks, { type: r.mimeType || 'audio/webm' }));
      stream.getTracks().forEach((t) => t.stop());
    };
    r.start();
    rec.current = r;
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  function stop() {
    rec.current?.stop();
    setRecording(false);
    if (timer.current) clearInterval(timer.current);
  }

  return { supported, recording, seconds, blob, start, stop, clear: () => setBlob(null) };
}

/** The global "+ Add lead" sheet. Only name and phone are required. */
export default function QuickAddLead({ prefill }: { prefill: { phone?: string; name?: string } | null }) {
  const t = useTranslations('quickAdd');
  const c = useTranslations('common');
  const e = useTranslations('errors');
  const o = useTranslations('offline');
  const s = useWorkspaceSettings();
  const router = useRouter();
  const { can } = usePermissions();
  const canAssign = can('leads.assign');

  const [name, setName] = useState(prefill?.name ?? '');
  const [phone, setPhone] = useState<PhoneValue>(() => toPhoneValue(prefill?.phone ?? '', s.default_phone_country));
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [checkPhone, setCheckPhone] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('manual');
  const [owner, setOwner] = useState('me');
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const voice = useVoiceRecorder();

  const dup = useDuplicateCheck(checkPhone, phone.country);
  const quickAdd = useQuickAdd();
  const members = useMembers();
  const sources = useLeadSources(canAssign);
  const sourceOptions = Array.from(new Set([...BASE_SOURCES, ...(sources.data ?? []).map((x) => x.source_label)]));

  const nameError = submitted && !name.trim() ? e('required') : null;
  const phoneError = (submitted || phoneTouched) && !phone.e164 ? (phone.raw ? e('invalidPhone') : submitted ? e('required') : null) : null;
  const duplicate = dup.data?.duplicate ?? null;

  async function submit(ev?: React.FormEvent) {
    ev?.preventDefault();
    setSubmitted(true);
    if (!name.trim() || !phone.e164) return;
    const r = await quickAdd.mutateAsync({
      name: name.trim(),
      phone: phone.e164,
      email: email.trim() || undefined,
      note: note.trim() || undefined,
      source_label: source,
      assign_to: canAssign ? owner : 'me',
      tags: tags.split(',').map((x) => x.trim()).filter(Boolean),
      voice: voice.blob,
    });
    countUsefulAction();
    closeQuickAdd();
    if (r.status === 'queued') {
      toast.info(o('queuedLead'));
      return;
    }
    toast.success(r.status === 'reenquiry' ? t('reenquiry') : t('added'), {
      action: { label: t('open'), onClick: () => router.push(`/contacts/${r.contact_id}`) },
    });
  }

  return (
    <ResponsiveSheet open onOpenChange={(o) => !o && closeQuickAdd()} title={t('title')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="qa-name">{t('name')}</Label>
          <Input
            id="qa-name"
            autoFocus
            autoComplete="name"
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            placeholder={t('namePlaceholder')}
            aria-invalid={!!nameError || undefined}
            aria-describedby={nameError ? 'qa-name-err' : undefined}
            className="h-11 text-base"
          />
          {nameError && <p id="qa-name-err" className="text-sm text-red-700">{nameError}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="qa-phone">{t('phone')}</Label>
          <PhoneInput
            id="qa-phone"
            value={phone}
            onChange={setPhone}
            onBlur={() => {
              setPhoneTouched(true);
              setCheckPhone(phone.e164);
            }}
            invalid={!!phoneError}
            describedBy={phoneError ? 'qa-phone-err' : undefined}
          />
          {phoneError && <p id="qa-phone-err" className="text-sm text-red-700">{phoneError}</p>}
        </div>

        {duplicate && checkPhone === phone.e164 && (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-amber-950">
              <TriangleAlert className="size-4" aria-hidden="true" />
              {t('duplicateTitle')}
            </p>
            <p className="mt-1 text-amber-900">{t('duplicateBody', { name: duplicate.name })}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 bg-white"
                onClick={() => {
                  closeQuickAdd();
                  router.push(`/contacts/${duplicate.id}`);
                }}
              >
                {t('viewExisting')}
              </Button>
              <Button type="button" className="h-10" onClick={() => submit()} disabled={quickAdd.isPending}>
                {t('merge')}
              </Button>
            </div>
          </div>
        )}

        <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} className="flex min-h-10 items-center gap-1 text-sm font-medium text-brand-ink">
          {more ? t('less') : t('more')}
          <ChevronDown className={`size-4 transition-transform ${more ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {more && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="qa-email">{t('email')}</Label>
              <Input id="qa-email" type="email" autoComplete="email" value={email} onChange={(ev) => setEmail(ev.target.value)} className="h-11" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="qa-source">{t('source')}</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger id="qa-source" className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceOptions.map((x) => (
                      <SelectItem key={x} value={x}>
                        {humanize(x)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {canAssign && (
                <div className="space-y-1.5">
                  <Label htmlFor="qa-owner">{t('owner')}</Label>
                  <Select value={owner} onValueChange={setOwner}>
                    <SelectTrigger id="qa-owner" className="h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="me">{t('ownerMe')}</SelectItem>
                      <SelectItem value="auto">{t('ownerAuto')}</SelectItem>
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
            <div className="space-y-1.5">
              <Label htmlFor="qa-tags">{t('tags')}</Label>
              <Input id="qa-tags" value={tags} onChange={(ev) => setTags(ev.target.value)} placeholder={t('tagsPlaceholder')} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-note">{t('note')}</Label>
              <Textarea id="qa-note" value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={t('notePlaceholder')} rows={2} />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {voice.supported && (
            <>
              {voice.blob && !voice.recording ? (
                <Button type="button" variant="outline" className="h-11" onClick={voice.clear} aria-label={t('voiceRemove')}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  <span className="text-xs">{t('voiceRecorded', { seconds: voice.seconds })}</span>
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  aria-label={voice.recording ? t('voiceStop') : t('voice')}
                  onClick={() => (voice.recording ? voice.stop() : voice.start().catch(() => {}))}
                >
                  {voice.recording ? <Square className="size-4 fill-red-600 text-red-600" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
                  {voice.recording && <span className="text-xs tabular-nums">{t('recording', { seconds: voice.seconds })}</span>}
                </Button>
              )}
            </>
          )}
          <Button type="button" variant="ghost" className="ms-auto h-11" onClick={closeQuickAdd}>
            {c('cancel')}
          </Button>
          <Button type="submit" className="h-11 min-w-28" disabled={quickAdd.isPending || voice.recording}>
            {quickAdd.isPending ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>
    </ResponsiveSheet>
  );
}
