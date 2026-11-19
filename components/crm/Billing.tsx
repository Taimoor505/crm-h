'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChangePlan, useInvoices, usePlans, useReportPayment, useSubscription } from '@/hooks/queries/admin';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { formatMoneyValue, fromMinor, currencySymbol } from '@/lib/format';
import type { Invoice } from '@/lib/api/types';
import { SettingsCard } from '@/components/settings/SettingsCard';
import { ResponsiveSheet } from './ResponsiveSheet';
import { DateText } from './values';
import { EmptyState, ErrorState, ListSkeleton, PageSkeleton } from './states';
import { cn, humanize } from '@/lib/utils';

const STATUS_KEYS = ['active', 'trialing', 'read_only', 'archived', 'suspended', 'cancelled'];

function StatusPill({ status }: { status: string }) {
  const t = useTranslations('billing');
  const key = `status${status.charAt(0).toUpperCase()}${status.slice(1)}`;
  const tone = status === 'active' || status === 'paid' ? 'bg-green-50 text-green-800' : status === 'trialing' || status === 'open' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-900';
  const known = STATUS_KEYS.includes(status) || ['paid', 'open', 'overdue', 'void'].includes(status);
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', tone)}>{known ? t(key as 'statusActive') : humanize(status)}</span>;
}

/** Plan, covered workspaces, invoices and manual payment (brief §8.11). */
export function BillingOverview() {
  const t = useTranslations('billing');
  const s = useWorkspaceSettings();
  const sub = useSubscription();
  const invoices = useInvoices();
  const [planOpen, setPlanOpen] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);

  if (sub.isLoading) return <PageSkeleton />;
  if (sub.isError) return <ErrorState onRetry={() => sub.refetch()} />;
  const data = sub.data;
  const due = data?.outstanding && data.outstanding.amount_minor > 0 ? data.outstanding : null;
  const openInvoice = (invoices.data ?? []).find((i) => i.status !== 'paid' && i.status !== 'void');

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <SettingsCard title={t('plan')} className="md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-heading text-2xl font-bold">{data?.plan?.name ?? t('noPlan')}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                {data && <StatusPill status={data.status} />}
                {data?.trial_ends_at && <span>{t('trialEnds', { date: '' })}<DateText iso={data.trial_ends_at} /></span>}
                {data?.pending_plan && data.pending_plan_effective && (
                  <span>
                    {t('pendingPlan', { plan: data.pending_plan.name, date: '' })}
                    <DateText iso={data.pending_plan_effective} />
                  </span>
                )}
              </div>
              {data && <p className="mt-2 text-sm text-gray-700">{t('seats')}: <span className="font-semibold tabular-nums">{data.workspaces.length}</span></p>}
            </div>
            <Button variant="outline" className="h-10" onClick={() => setPlanOpen(true)}>
              {t('changePlan')}
            </Button>
          </div>
        </SettingsCard>
        <SettingsCard title={t('outstanding')}>
          <p className={cn('font-heading text-2xl font-bold tabular-nums', due ? 'text-red-700' : 'text-gray-900')}>{due ? formatMoneyValue(due, s) : t('nothingDue')}</p>
          {data && data.overdue_invoices > 0 && <p className="mt-1 text-sm text-red-700">{t('overdue', { count: data.overdue_invoices })}</p>}
          {openInvoice && (
            <Button className="mt-3 h-10 w-full" onClick={() => setPaying(openInvoice)}>
              {t('payNow')}
            </Button>
          )}
        </SettingsCard>
      </div>

      <SettingsCard title={t('invoices')}>
        {invoices.isLoading ? (
          <ListSkeleton rows={3} />
        ) : !invoices.data?.length ? (
          <EmptyState icon={<Receipt className="size-6" />} title={t('noInvoices')} className="py-6" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-xs text-gray-600">
                <tr>
                  <th scope="col" className="py-2 text-start font-medium">{t('invoice')}</th>
                  <th scope="col" className="py-2 text-start font-medium">{t('issued')}</th>
                  <th scope="col" className="py-2 text-start font-medium">{t('due')}</th>
                  <th scope="col" className="py-2 text-end font-medium">{t('total')}</th>
                  <th scope="col" className="py-2 text-end font-medium">{t('status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.data.map((i) => (
                  <tr key={i.id}>
                    <td className="py-2.5 font-mono text-xs">{i.number}</td>
                    <td className="py-2.5"><DateText iso={i.issue_date} /></td>
                    <td className="py-2.5"><DateText iso={i.due_date} /></td>
                    <td className="py-2.5 text-end font-medium tabular-nums">{formatMoneyValue(i.total, s)}</td>
                    <td className="py-2.5 text-end">
                      {i.status !== 'paid' ? (
                        <Button variant="link" className="h-auto p-0" onClick={() => setPaying(i)}>
                          {t('payNow')}
                        </Button>
                      ) : (
                        <StatusPill status={i.status} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>

      {planOpen && <PlanSheet current={data?.plan?.id ?? null} onClose={() => setPlanOpen(false)} />}
      {paying && <PaymentSheet invoice={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function PlanSheet({ current, onClose }: { current: string | null; onClose: () => void }) {
  const t = useTranslations('billing');
  const s = useWorkspaceSettings();
  const plans = usePlans();
  const change = useChangePlan();
  return (
    <ResponsiveSheet open onOpenChange={(o) => !o && onClose()} title={t('choosePlan')}>
      {plans.isLoading ? (
        <ListSkeleton rows={3} />
      ) : (
        <ul className="stagger space-y-2">
          {(plans.data ?? []).map((p) => (
            <li key={p.id} className={cn('flex items-center justify-between gap-3 rounded-lg border p-3', p.id === current && 'border-brand bg-brand-surface')}>
              <div>
                <p className="font-semibold">{p.name}</p>
                {p.price && <p className="text-sm text-gray-600">{t('perMonth', { price: formatMoneyValue(p.price, s) })}</p>}
              </div>
              {p.id === current ? (
                <span className="text-sm font-medium text-brand-ink">{t('current')}</span>
              ) : (
                <Button className="h-10" disabled={change.isPending} onClick={() => change.mutate(p.id, { onSuccess: () => { toast.success(t('planChanged')); onClose(); } })}>
                  {t('select')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </ResponsiveSheet>
  );
}

function PaymentSheet({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const t = useTranslations('billing');
  const s = useWorkspaceSettings();
  const report = useReportPayment();
  const remaining = invoice.total.amount_minor - invoice.paid.amount_minor;
  const [amount, setAmount] = useState(String(fromMinor(remaining, invoice.total.currency)));
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('paymentTitle')}
      description={t('paymentHint')}
      footer={
        <Button
          className="h-11 w-full"
          disabled={!proof || !Number(amount) || report.isPending}
          onClick={() => {
            const form = new FormData();
            form.set('invoice_id', invoice.id);
            // TODO(money): the API still names this amount_pkr (brief §12.3).
            form.set('amount_pkr', amount);
            form.set('method', method);
            if (reference) form.set('reference', reference);
            form.set('proof', proof!);
            report.mutate(form, { onSuccess: () => { toast.success(t('paymentSent')); onClose(); } });
          }}
        >
          {t('submitPayment')}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm">
          {t('invoice')} <span className="font-mono">{invoice.number}</span> · {formatMoneyValue(invoice.total, s)}
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="pay-amount">{t('amount')}</Label>
          <div className="relative">
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">{currencySymbol(invoice.total.currency, s.locale)}</span>
            <Input id="pay-amount" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 ps-12 tabular-nums" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-method">{t('method')}</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger id="pay-method" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['bank_transfer', 'card', 'jazzcash', 'easypaisa'] as const).map((m) => (
                <SelectItem key={m} value={m}>
                  {t(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-ref">{t('reference')}</Label>
          <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-proof">{t('proof')}</Label>
          <Input id="pay-proof" type="file" accept="image/*,application/pdf" onChange={(e) => setProof(e.target.files?.[0] ?? null)} className="h-11" />
        </div>
      </div>
    </ResponsiveSheet>
  );
}
