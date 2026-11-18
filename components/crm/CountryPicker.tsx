'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { countryOptions } from '@/lib/phone';
import { cn } from '@/lib/utils';

export function CountryPicker({
  value,
  onChange,
  showDial = true,
  className,
  id,
  ariaLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  showDial?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const t = useTranslations('phone');
  const [open, setOpen] = useState(false);
  const options = useMemo(() => countryOptions(), []);
  const current = options.find((o) => o.code === value.toUpperCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          aria-label={ariaLabel ?? t('country')}
          className={cn(
            'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-sm font-medium hover:bg-gray-50',
            className,
          )}
        >
          <span aria-hidden="true">{current?.flag}</span>
          <span className="tabular-nums">{showDial ? current?.dial : current?.name}</span>
          <ChevronDown className="size-4 text-gray-500" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder={t('searchCountry')} />
          <CommandList>
            <CommandEmpty>{t('noCountry')}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.code}
                  value={`${o.name} ${o.dial} ${o.code}`}
                  onSelect={() => {
                    onChange(o.code);
                    setOpen(false);
                  }}
                  className="min-h-10"
                >
                  <span aria-hidden="true">{o.flag}</span>
                  <span className="flex-1 truncate">{o.name}</span>
                  <span className="text-gray-500 tabular-nums">{o.dial}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
