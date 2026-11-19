'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { listContacts } from '@/lib/api/endpoints/crm';
import { useWorkspaceId } from '@/lib/auth/SessionProvider';
import { qk } from '@/hooks/queries/keys';
import { Avatar } from '@/components/crm/badges';
import { PhoneText } from '@/components/crm/PhoneText';

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function GlobalSearchDialog({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) {
  const t = useTranslations('shell');
  const [text, setText] = useState('');
  const q = useDebounced(text.trim());
  const ws = useWorkspaceId();
  const router = useRouter();
  const results = useQuery({
    queryKey: qk.contacts(ws, { q }),
    queryFn: () => listContacts({ q, limit: 8 }),
    enabled: open && q.length >= 2,
    staleTime: 30_000,
  });
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title={t('search')} description={t('searchPlaceholder')} shouldFilter={false}>
      <CommandInput placeholder={t('searchPlaceholder')} value={text} onValueChange={setText} />
      <CommandList>
        {q.length < 2 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">{t('searchHint')}</p>
        ) : (
          <>
            <CommandEmpty>{results.isFetching ? '…' : t('noResults', { query: q })}</CommandEmpty>
            <CommandGroup>
              {results.data?.data.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    setOpen(false);
                    setText('');
                    router.push(`/contacts/${c.id}`);
                  }}
                  className="min-h-12 gap-3"
                >
                  <Avatar name={c.name} seed={c.id} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <PhoneText e164={c.phone_e164} className="text-xs text-gray-500" />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
