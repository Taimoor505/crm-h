'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Building2, Eye, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePartnerMutations, usePartnerWorkspaces, useTemplates } from '@/hooks/queries/admin';
import { useSession } from '@/lib/auth/SessionProvider';
import { regionFromCountry, type RegionSettings } from '@/lib/format';
import { countryName } from '@/lib/phone';
import { RegionFields } from '@/components/crm/RegionFields';
import { ResponsiveSheet } from '@/components/crm/ResponsiveSheet';
import { DateText } from '@/components/crm/values';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/crm/states';
import { cn, humanize } from '@/lib/utils';

export default function PartnerClientsPage() {
  const t = useTranslations('partner');
  const b = useTranslations('billing');
  const list = usePartnerWorkspaces();
  const { impersonate } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  function open(ws: { id: string; name: string }) {
    qc.clear();
    impersonate(ws, '/partner');
    router.push('/home');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold">{t('clients')}</h2>
        <Button className="h-10" onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {t('newWorkspace')}
        </Button>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        {list.isLoading ? (
          <ListSkeleton rows={4} />
        ) : list.isError ? (
          <ErrorState onRetry={() => list.refetch()} />
        ) : !list.data?.length ? (
          <EmptyState icon={<Building2 className="size-6" />} title={t('empty')} body={t('emptyBody')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-xs text-gray-600">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start font-medium">{t('colName')}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t('colStatus')}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t('colPlan')}</th>
                  <th scope="col" className="px-3 py-3 text-end font-medium">{t('colSeats')}</th>
                  <th scope="col" className="px-3 py-3 text-start font-medium">{t('colCountry')}</th>
                  <th scope="col" className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {list.data.map((w) => (
                  <tr key={w.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{w.name}</p>
                      <p className="text-xs text-gray-500">
                        {humanize(w.template_key)} · <DateText iso={w.created_at} />
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', w.status === 'active' ? 'bg-green-50 text-green-800' : w.status === 'trialing' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-900')}>
                        {['active', 'trialing', 'read_only', 'archived', 'suspended'].includes(w.status) ? b(`status${w.status.charAt(0).toUpperCase()}${w.status.slice(1)}` as 'statusActive') : humanize(w.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3">{w.plan ? humanize(w.plan) : '—'}</td>
                    <td className="px-3 py-3 text-end tabular-nums">{w.seats ?? '—'}</td>
                    <td className="px-3 py-3">{w.country ? countryName(w.country) : '—'}</td>
                    <td className="px-4 py-3 text-end">
                      <Button variant="outline" className="h-9" onClick={() => open(w)} aria-label={t('impersonateLabel', { name: w.name })}>
                        <Eye className="size-4" aria-hidden="true" />
                        {t('impersonate')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {creating && <CreateWorkspaceSheet onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateWorkspaceSheet({ onClose }: { onClose: () => void }) {
  const t = useTranslations('partner');
  const templates = useTemplates();
  const m = usePartnerMutations();
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('real_estate');
  const [region, setRegion] = useState<RegionSettings>(() => regionFromCountry('US'));
  return (
    <ResponsiveSheet
      open
      wide
      onOpenChange={(o) => !o && onClose()}
      title={t('createTitle')} icon={Building2}
      footer={
        <Button
          className="h-11 w-full"
          disabled={!name.trim() || m.createWorkspace.isPending}
          onClick={() => m.createWorkspace.mutate({ name: name.trim(), template_key: template, region }, { onSuccess: () => { toast.success(t('created')); onClose(); } })}
        >
          {t('newWorkspace')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pw-name">{t('name')}</Label>
            <Input id="pw-name" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-template">{t('template')}</Label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger id="pw-template" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(templates.data ?? []).map((tpl) => (
                  <SelectItem key={tpl.key} value={tpl.key}>
                    {tpl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <RegionFields value={region} onChange={setRegion} idPrefix="pw" />
      </div>
    </ResponsiveSheet>
  );
}
