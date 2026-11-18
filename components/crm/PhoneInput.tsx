'use client';

import { forwardRef, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { CountryPicker } from './CountryPicker';
import { parsePhone, isCountryCode, formatAsYouType } from '@/lib/phone';
import { cn } from '@/lib/utils';

export interface PhoneValue {
  /** What the person typed (national or international). */
  raw: string;
  country: string;
  /** Set when the input parses to a possible number. */
  e164: string | null;
}

export function toPhoneValue(raw: string, country: string): PhoneValue {
  const r = parsePhone(raw, country);
  return { raw, country, e164: r.ok ? r.e164 : null };
}

/**
 * Country picker + number. Typing "+44…" switches the country; pasting an
 * E.164 number works. The parent gets E.164 when valid.
 */
export const PhoneInput = forwardRef<
  HTMLInputElement,
  {
    value: PhoneValue;
    onChange: (v: PhoneValue) => void;
    onBlur?: () => void;
    id?: string;
    invalid?: boolean;
    autoFocus?: boolean;
    className?: string;
    describedBy?: string;
    disabled?: boolean;
  }
>(function PhoneInput({ value, onChange, onBlur, id, invalid, autoFocus, className, describedBy, disabled }, ref) {
  const t = useTranslations('phone');
  const [display, setDisplay] = useState(value.raw);

  // The parent resets the field by passing an empty value.
  useEffect(() => {
    if (!value.raw) setDisplay('');
  }, [value.raw]);

  function handle(raw: string, country = value.country) {
    let c = country;
    if (raw.startsWith('+')) {
      const parsed = parsePhone(raw, c);
      if (parsed.ok && parsed.country && isCountryCode(parsed.country)) c = parsed.country;
    }
    setDisplay(raw.startsWith('+') ? raw : formatAsYouType(raw, c));
    onChange(toPhoneValue(raw, c));
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <CountryPicker value={value.country} onChange={(c) => handle(value.raw, c)} />
      <Input
        ref={ref}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={t('placeholder')}
        value={display}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => handle(e.target.value)}
        onBlur={onBlur}
        className="h-11 flex-1 text-base tabular-nums"
      />
    </div>
  );
});
