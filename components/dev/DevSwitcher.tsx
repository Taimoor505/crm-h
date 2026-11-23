'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Bug, X } from 'lucide-react';
import { isDevToolsEnabled } from '@/lib/dev-tools';
import { mockMode } from '@/mocks/mode';
import { devSignInAs } from '@/lib/auth/dev-session';
import { useSession } from '@/lib/auth/SessionProvider';
import { setAppState } from '@/lib/app-state';

interface Actor {
  id: string;
  name: string;
  hint: string;
}

/**
 * Development only: switch actor, workspace and (with mocks) workspace status
 * to test roles, regions and read-only/suspended states.
 */
export function DevSwitcher() {
  if (!isDevToolsEnabled()) return null;
  return <Panel />;
}

function Panel() {
  const t = useTranslations('dev');
  const mode = mockMode();
  const { session, me, workspaceId, switchWorkspace } = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actors, setActors] = useState<Actor[]>([]);
  const [status, setStatus] = useState('active');

  useEffect(() => {
    if (!open || mode !== 'all') return;
    import('@/mocks/db').then(({ getDb }) => {
      const db = getDb();
      setActors(
        db.users.map((u) => {
          const roles = db.memberships.filter((m) => m.user_id === u.id).map((m) => `${m.role}@${db.workspaces.find((w) => w.id === m.workspace_id)?.name}`);
          return { id: u.id, name: u.name, hint: u.is_super_admin ? 'super_admin' : u.partner_admin_of ? 'partner_admin' : roles.join(', ') };
        }),
      );
      setStatus(db.workspaces.find((w) => w.id === workspaceId)?.status ?? 'active');
    });
  }, [open, mode, workspaceId]);

  async function setWorkspaceStatus(next: string) {
    const { getDb, persist } = await import('@/mocks/db');
    const ws = getDb().workspaces.find((w) => w.id === workspaceId);
    if (!ws) return;
    ws.status = next;
    persist();
    setStatus(next);
    setAppState({ readOnly: next === 'read_only', suspended: false });
    await qc.invalidateQueries();
    if (next === 'suspended') router.replace('/suspended');
  }

  async function reset() {
    const { resetDb } = await import('@/mocks/db');
    resetDb();
    setAppState({ readOnly: false, suspended: false });
    await qc.invalidateQueries();
  }

  return (
    <div className="fixed start-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 lg:start-20 lg:bottom-4">
      {open ? (
        <div className="w-72 rounded-xl border bg-white p-3 text-xs shadow-float">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">{t('switcher')}</p>
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded hover:bg-gray-100">
              <X className="size-4" />
            </button>
          </div>
          <p className="mb-2 text-gray-500">{t('mockMode', { mode })}</p>
          {mode === 'all' && (
            <label className="mb-2 block">
              <span className="mb-1 block font-medium">{t('actor')}</span>
              <select
                className="h-9 w-full rounded border px-2"
                value={session?.userId ?? ''}
                onChange={(e) => {
                  qc.clear();
                  devSignInAs(e.target.value, null);
                  router.replace('/home');
                }}
              >
                {actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} {a.hint && `(${a.hint})`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(me?.memberships.length ?? 0) > 0 && (
            <label className="mb-2 block">
              <span className="mb-1 block font-medium">{t('workspace')}</span>
              <select className="h-9 w-full rounded border px-2" value={workspaceId ?? ''} onChange={(e) => switchWorkspace(e.target.value)}>
                {me?.memberships.map((m) => (
                  <option key={m.workspace_id} value={m.workspace_id}>
                    {m.workspace_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === 'all' && (
            <>
              <label className="mb-2 block">
                <span className="mb-1 block font-medium">{t('status')}</span>
                <select className="h-9 w-full rounded border px-2" value={status} onChange={(e) => setWorkspaceStatus(e.target.value)}>
                  {['active', 'trialing', 'read_only', 'archived', 'suspended'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={reset} className="h-9 w-full rounded border font-medium hover:bg-gray-50">
                {t('resetData')}
              </button>
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('switcher')}
          className="grid size-10 place-items-center rounded-full bg-gray-900 text-white shadow-float opacity-70 hover:opacity-100"
        >
          <Bug className="size-4" />
        </button>
      )}
    </div>
  );
}
