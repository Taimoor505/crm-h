'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Password field with a show/hide toggle (44px target). */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<'input'>, 'type'>) {
  const t = useTranslations('auth');
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} className={cn('h-12 pe-12', className)} {...props} />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t('hidePassword') : t('showPassword')}
        aria-pressed={show}
        className="absolute inset-y-0 end-0 flex w-12 items-center justify-center rounded-e-xl text-gray-500 hover:text-gray-800"
      >
        {show ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
      </button>
    </div>
  );
}
