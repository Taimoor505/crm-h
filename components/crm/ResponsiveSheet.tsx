'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { X, type LucideIcon } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

export type SheetTone = 'brand' | 'success' | 'danger' | 'warning';

const TONE: Record<SheetTone, { tile: string; wash: string }> = {
  brand: {
    tile: 'bg-brand text-on-brand shadow-[0_10px_24px_-8px_var(--brand-primary)]',
    wash: 'from-[color-mix(in_oklab,var(--brand-primary)_14%,white)]',
  },
  success: { tile: 'bg-emerald-600 text-white shadow-[0_10px_24px_-8px_var(--color-emerald-600)]', wash: 'from-emerald-50' },
  danger: { tile: 'bg-red-600 text-white shadow-[0_10px_24px_-8px_var(--color-red-600)]', wash: 'from-red-50' },
  warning: { tile: 'bg-amber-500 text-white shadow-[0_10px_24px_-8px_var(--color-amber-500)]', wash: 'from-amber-50' },
};

function Header({ icon: Icon, tone, title, description, Title, Description }: {
  icon?: LucideIcon;
  tone: SheetTone;
  title: ReactNode;
  description?: ReactNode;
  Title: typeof DialogTitle | typeof SheetTitle;
  Description: typeof DialogDescription | typeof SheetDescription;
}) {
  return (
    <div className="relative">
      <div className="relative flex items-start gap-3.5 pe-12">
        {Icon && (
          <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', TONE[tone].tile)} aria-hidden="true">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0 pt-0.5">
          <Title className="font-heading text-lg leading-tight font-bold tracking-tight text-gray-900">{title}</Title>
          {description ? (
            <Description className="mt-1 truncate text-sm text-gray-600">{description}</Description>
          ) : (
            <Description className="sr-only">{title}</Description>
          )}
        </div>
      </div>
    </div>
  );
}

/** Soft tinted wash and glow across the top edge of the panel (sits behind everything). */
function Wash({ tone }: { tone: SheetTone }) {
  return (
    <>
      <div aria-hidden="true" className={cn('pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b to-transparent', TONE[tone].wash)} />
      <div aria-hidden="true" className="pointer-events-none absolute -top-20 -end-16 size-56 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--brand-primary)_16%,transparent),transparent)]" />
    </>
  );
}

function CloseButton({ as: Close }: { as: typeof DialogClose | typeof SheetClose }) {
  const t = useTranslations('common');
  return (
    <Close
      aria-label={t('close')}
      className="absolute end-4 top-4 z-10 grid size-10 place-items-center rounded-full bg-white/80 text-gray-600 shadow-card ring-1 ring-black/5 backdrop-blur transition hover:bg-white hover:text-gray-900 focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none"
    >
      <X className="size-[18px]" aria-hidden="true" />
    </Close>
  );
}

/**
 * Bottom sheet on phones, dialog on desktop (brief: sheets for actions on
 * mobile, dialogs on desktop). Header with an icon tile and a tinted wash,
 * scrolling body, and a footer pinned to the bottom.
 */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  wide,
  icon,
  tone = 'brand',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  wide?: boolean;
  icon?: LucideIcon;
  tone?: SheetTone;
}) {
  const desktop = useMediaQuery('(min-width: 768px)');

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            'flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-[28px] p-0 ring-1 ring-black/5',
            wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
            className,
          )}
        >
          <Wash tone={tone} />
          <CloseButton as={DialogClose} />
          <div className="relative px-6 pt-6 pb-5">
            <Header icon={icon} tone={tone} title={title} description={description} Title={DialogTitle} Description={DialogDescription} />
          </div>
          <div className="relative min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
          {footer && <div className="relative flex flex-col-reverse gap-2 border-t bg-gray-50/80 px-6 py-4 sm:flex-row sm:justify-end">{footer}</div>}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className={cn('flex max-h-[92dvh] flex-col gap-0 overflow-hidden rounded-t-[28px] border-0 p-0 shadow-sheet', className)}>
        <Wash tone={tone} />
        <CloseButton as={SheetClose} />
        <div className="relative px-5 pt-3 pb-4">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-300" aria-hidden="true" />
          <Header icon={icon} tone={tone} title={title} description={description} Title={SheetTitle} Description={SheetDescription} />
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="flex flex-col gap-2 border-t bg-white/95 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
