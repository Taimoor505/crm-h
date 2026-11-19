'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMembers, useTeamMutations } from '@/hooks/queries/crm';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { useSession } from '@/lib/auth/SessionProvider';
import { usePermissions } from '@/lib/permissions';
import type { WorkspaceRole } from '@/lib/api/types';
import { SettingsCard, SettingsPage } from '@/components/settings/SettingsCard';
import { ResponsiveSheet } from '@/components/crm/ResponsiveSheet';
import { PhoneInput, toPhoneValue, type PhoneValue } from '@/components/crm/PhoneInput';
import { Avatar } from '@/components/crm/badges';
import { PhoneText } from '@/components/crm/PhoneText';
import { ErrorState, ListSkeleton } from '@/components/crm/states';

export default function TeamSettingsPage() {
  const t = useTranslations('settings.team');
  const n = useTranslations('settings');
  const r = useTranslations('roles');
  const { session, role } = useSession();
  const { canWrite } = usePermissions();
  const members = useMembers();
  const m = useTeamMutations();
  const [inviting, setInviting] = useState(false);
  // Managers can't promote anyone to owner or change owners.
  const roles: WorkspaceRole[] = role === 'owner' || role === 'partner_admin' || role === 'super_admin' ? ['owner', 'manager', 'agent'] : ['manager', 'agent'];

  return (
    <SettingsPage
      title={n('nav.team')}
      actions={
        canWrite ? (
          <Button className="h-10" onClick={() => setInviting(true)}>
            <UserPlus className="size-4" aria-hidden="true" />
            {t('invite')}
          </Button>
        ) : undefined
      }
    >
      <SettingsCard>
        {members.isLoading ? (
          <ListSkeleton rows={4} />
        ) : members.isError ? (
          <ErrorState onRetry={() => members.refetch()} />
        ) : (
          <ul className="divide-y divide-gray-100">
            {(members.data ?? []).map((mem) => {
              const me = mem.user_id === session?.userId;
              const editable = canWrite && !me && (mem.role !== 'owner' || roles.includes('owner'));
              return (
                <li key={mem.membership_id} className="flex flex-wrap items-center gap-3 py-3">
                  <Avatar name={mem.name} seed={mem.user_id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {mem.name || mem.email || mem.phone}
                      {me && <span className="ms-2 text-xs font-normal text-gray-500">({t('you')})</span>}
                    </p>
                    <p className="truncate text-xs text-gray-600">
                      {mem.phone ? <PhoneText e164={mem.phone} /> : mem.email}
                      {mem.status === 'invited' && <span className="ms-2 rounded-full bg-amber-50 px-2 py-0.5 text-amber-900">{t('statusInvited')}</span>}
                      {mem.status === 'suspended' && <span className="ms-2 rounded-full bg-gray-100 px-2 py-0.5">{t('statusSuspended')}</span>}
                    </p>
                  </div>
                  {editable ? (
                    <div className="flex items-center gap-2">
                      <Select value={mem.role} onValueChange={(v) => m.update.mutate({ id: mem.membership_id, role: v as WorkspaceRole }, { onSuccess: () => toast.success(n('saved')) })}>
                        <SelectTrigger aria-label={t('changeRole', { name: mem.name })} className="h-10 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((x) => (
                            <SelectItem key={x} value={x}>
                              {r(x)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        className="h-10"
                        onClick={() => m.update.mutate({ id: mem.membership_id, status: mem.status === 'suspended' ? 'active' : 'suspended' }, { onSuccess: () => toast.success(n('saved')) })}
                      >
                        {mem.status === 'suspended' ? t('reactivate') : t('deactivate')}
                      </Button>
                    </div>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium">{r(mem.role)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SettingsCard>
      {inviting && <InviteSheet roles={roles.filter((x) => x !== 'owner')} onClose={() => setInviting(false)} />}
    </SettingsPage>
  );
}

function InviteSheet({ roles, onClose }: { roles: WorkspaceRole[]; onClose: () => void }) {
  const t = useTranslations('settings.team');
  const r = useTranslations('roles');
  const s = useWorkspaceSettings();
  const m = useTeamMutations();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState<PhoneValue>(() => toPhoneValue('', s.default_phone_country));
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('agent');
  const valid = name.trim() && (phone.e164 || /\S+@\S+\.\S+/.test(email));
  return (
    <ResponsiveSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('inviteTitle')}
      footer={
        <Button
          className="h-11 w-full"
          disabled={!valid || m.invite.isPending}
          onClick={() =>
            m.invite.mutate(
              { name: name.trim(), phone: phone.e164 ?? undefined, email: email.trim() || undefined, role },
              { onSuccess: () => { toast.success(t('invited')); onClose(); } },
            )
          }
        >
          {t('invite')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="inv-name">{t('name')}</Label>
          <Input id="inv-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-phone">{t('phone')}</Label>
          <PhoneInput id="inv-phone" value={phone} onChange={setPhone} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-email">{t('email')}</Label>
          <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-role">{t('role')}</Label>
          <Select value={role} onValueChange={(v) => setRole(v as WorkspaceRole)}>
            <SelectTrigger id="inv-role" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roles.map((x) => (
                <SelectItem key={x} value={x}>
                  {r(x)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </ResponsiveSheet>
  );
}
