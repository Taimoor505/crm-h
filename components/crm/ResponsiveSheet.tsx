'use client';

import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils';

/**
 * Bottom sheet on phones, dialog on desktop (brief: sheets for actions on
 * mobile, dialogs on desktop).
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const desktop = useMediaQuery('(min-width: 768px)');

  if (desktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn('max-h-[90dvh] overflow-y-auto', wide ? 'sm:max-w-2xl' : 'sm:max-w-md', className)}>
          <DialogHeader>
            <DialogTitle className="font-heading">{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
          </DialogHeader>
          {children}
          {footer && <DialogFooter>{footer}</DialogFooter>}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className={cn('max-h-[92dvh] overflow-y-auto rounded-t-2xl px-4 pb-safe', className)}>
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-gray-300" aria-hidden="true" />
        <SheetHeader className="px-0 text-start">
          <SheetTitle className="font-heading">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : <SheetDescription className="sr-only">{title}</SheetDescription>}
        </SheetHeader>
        <div className="pb-2">{children}</div>
        {footer && <SheetFooter className="px-0 pb-4">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
