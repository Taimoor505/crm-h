'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, ChevronsUpDown, LogOut, MoreHorizontal, Plus } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useSession } from '@/lib/auth/SessionProvider';
import { useBranding } from '@/lib/theme/BrandingProvider';
import { usePermissions } from '@/lib/permissions';
import { useHomeSummary } from '@/hooks/queries/work';
import { useSetAvailability } from '@/hooks/queries/admin';
import { openQuickAdd } from '@/lib/ui-store';
import { Avatar } from '@/components/crm/badges';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NAV, isActive, moduleForPath, type NavItem } from './nav';
import { NotificationBell } from './NotificationBell';
import { GlobalSearch } from './GlobalSearch';
import { ImpersonationBar, OfflineBanner, ReadOnlyBanner } from './Banners';

function useNavItems(): NavItem[] {
  const { branding } = useBranding();
  const { can } = usePermissions();
  return NAV.filter((n) => (!n.module || !branding.hideModules.includes(n.module)) && (!n.permission || can(n.permission)));
}

function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { branding } = useBranding();
  const box = size === 'sm' ? 'size-8 text-xs' : 'size-9 text-sm';
  return branding.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={branding.logoUrl} alt="" className={cn(box, 'rounded-lg object-contain')} />
  ) : (
    <span aria-hidden="true" className={cn(box, 'grid shrink-0 place-items-center rounded-xl bg-brand font-heading font-bold text-on-brand shadow-card')}>
      {branding.logoText.slice(0, 2)}
    </span>
  );
}

function WorkspaceSwitcher() {
  const t = useTranslations('shell');
  const { me, workspace, switchWorkspace } = useSession();
  const router = useRouter();
  const memberships = me?.memberships ?? [];
  if (memberships.length < 2) return <p className="truncate text-xs text-gray-500">{workspace?.name}</p>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex max-w-full items-center gap-1 truncate text-xs text-gray-600 hover:text-gray-900" aria-label={t('switchWorkspace')}>
        <span className="truncate">{workspace?.name}</span>
        <ChevronsUpDown className="size-3 shrink-0" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t('workspaces')}</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem
            key={m.workspace_id}
            onSelect={() => {
              switchWorkspace(m.workspace_id);
              router.push('/home');
            }}
            className="min-h-10"
          >
            <span className="flex-1 truncate">{m.workspace_name ?? m.workspace_id}</span>
            {m.workspace_id === workspace?.id && <Check className="size-4" aria-hidden="true" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AvailabilityToggle() {
  const t = useTranslations('shell');
  const { data } = useHomeSummary('me');
  const set = useSetAvailability();
  const { canWrite } = usePermissions();
  if (!data || !canWrite) return null;
  const available = set.isPending ? Boolean(set.variables?.available) : data.me.available;
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-2 text-sm">
      <span className="text-gray-700">{available ? t('available') : t('unavailable')}</span>
      <Switch checked={available} onCheckedChange={(v) => set.mutate({ available: v })} />
    </label>
  );
}

function UserMenu() {
  const t = useTranslations('shell');
  const r = useTranslations('roles');
  const { me, role, signOut } = useSession();
  const router = useRouter();
  const name = me?.user.name || me?.user.phone || '';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t('userMenu')} className="grid size-11 place-items-center rounded-full hover:bg-gray-100">
        <Avatar name={name} seed={me?.user.id} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-semibold">{t('profile', { name })}</p>
          {role && <p className="text-xs text-gray-500">{r(role)}</p>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-1">
          <AvailabilityToggle />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-10"
          onSelect={() => {
            signOut();
            router.replace('/login');
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          {t('signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar({ items }: { items: NavItem[] }) {
  const t = useTranslations('nav');
  const s = useTranslations('shell');
  const pathname = usePathname();
  const { branding } = useBranding();
  const { canWrite } = usePermissions();
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e bg-card lg:flex">
      <div className="flex h-16 items-center gap-3 px-4">
        <BrandMark />
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold">{branding.appName}</p>
          <WorkspaceSwitcher />
        </div>
      </div>
      <nav aria-label={t('mainNav')} className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
        {items.map((item) => {
          const active = isActive(item, pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors',
                active ? 'bg-brand-surface font-semibold text-brand-ink' : 'font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              )}
            >
              <item.icon className="size-[18px]" aria-hidden="true" />
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

function TopBar() {
  const { branding } = useBranding();
  const s = useTranslations('shell');
  const { canWrite } = usePermissions();
  return (
    <header className="sticky top-0 z-30 border-b bg-card/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-2 lg:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-2 ps-2 lg:hidden">
        <BrandMark size="sm" />
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-semibold leading-tight">{branding.appName}</p>
          <WorkspaceSwitcher />
        </div>
      </div>
      <div className="hidden flex-1 lg:block">
        <GlobalSearch variant="bar" />
      </div>
      <div className="lg:hidden">
        <GlobalSearch variant="icon" />
      </div>
      {canWrite && (
        <Button type="button" onClick={() => openQuickAdd()} className="hidden lg:inline-flex">
          <Plus className="size-4" aria-hidden="true" />
          {s('addLead')}
        </Button>
      )}
      <NotificationBell />
      <UserMenu />
      </div>
    </header>
  );
}

function BottomNav({ items }: { items: NavItem[] }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = items.filter((i) => i.primary);
  const rest = items.filter((i) => !i.primary);
  const moreActive = rest.some((i) => isActive(i, pathname));

  return (
    <>
      <nav aria-label={t('mainNav')} className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-safe backdrop-blur-md lg:hidden">
        <ul className="flex">
          {primary.map((item) => {
            const active = isActive(item, pathname);
            return (
              <li key={item.key} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn('press flex min-h-16 flex-col items-center justify-center gap-1 text-[11px]', active ? 'font-semibold text-brand-ink' : 'font-medium text-gray-600')}
                >
                  <span className={cn('grid h-8 w-14 place-items-center rounded-full transition-colors duration-300', active ? 'bg-brand-surface' : 'bg-transparent')}>
                    <item.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="max-w-full truncate px-0.5">{t(item.key)}</span>
                </Link>
              </li>
            );
          })}
          {rest.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={cn('press flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[11px]', moreActive ? 'font-semibold text-brand-ink' : 'font-medium text-gray-600')}
              >
                <span className={cn('grid h-8 w-14 place-items-center rounded-full transition-colors duration-300', moreActive ? 'bg-brand-surface' : 'bg-transparent')}>
                  <MoreHorizontal className="size-5" aria-hidden="true" />
                </span>
                {t('more')}
              </button>
            </li>
          )}
        </ul>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-[28px] border-0 pb-safe">
          <SheetHeader>
            <SheetTitle>{t('more')}</SheetTitle>
            <SheetDescription className="sr-only">{t('more')}</SheetDescription>
          </SheetHeader>
          <ul className="stagger grid grid-cols-3 gap-3 px-4 pb-6">
            {rest.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="press flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-brand-surface/60 text-sm font-medium text-gray-800 hover:bg-brand-surface"
                >
                  <item.icon className="size-6 text-brand-ink" aria-hidden="true" />
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Floating "+ Add lead" on phones (desktop has it in the sidebar). */
function AddLeadFab() {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const { canWrite } = usePermissions();
  // Inbox chat and settings have their own primary actions.
  if (!canWrite || pathname.startsWith('/inbox/') || pathname.startsWith('/settings') || pathname.startsWith('/partner')) return null;
  return (
    <button
      type="button"
      onClick={() => openQuickAdd()}
      aria-label={t('addLead')}
      className="press animate-rise fixed end-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex h-14 items-center gap-2 rounded-2xl bg-brand-accent px-5 font-semibold text-on-brand-accent shadow-float lg:hidden"
    >
      <Plus className="size-5" aria-hidden="true" />
      <span>{t('addLead')}</span>
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const items = useNavItems();
  const pathname = usePathname();
  const router = useRouter();
  const { branding } = useBranding();

  // Hidden modules redirect to /home (brief §6).
  const mod = moduleForPath(pathname);
  const hidden = mod !== null && mod !== 'home' && branding.hideModules.includes(mod);
  useEffect(() => {
    if (hidden) router.replace('/home');
  }, [hidden, router]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ImpersonationBar />
        <ReadOnlyBanner />
        <OfflineBanner />
        <TopBar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-[calc(10rem+env(safe-area-inset-bottom))] lg:px-8 lg:pt-8 lg:pb-12">
          {hidden ? null : children}
        </main>
      </div>
      <BottomNav items={items} />
      <AddLeadFab />
    </div>
  );
}
