'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWorkspaceSettings } from '@/hooks/useWorkspaceSettings';
import { isoToLocal, localToIso, presetDueAt, type DuePreset } from '@/lib/format/presets';
import { cn } from '@/lib/utils';

export type DueChoice = DuePreset | 'pick' | 'none';

export function Chip({ selected, onClick, children, className }: { selected: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-10 items-center rounded-full border px-3.5 text-sm font-medium transition-colors',
        selected ? 'border-brand bg-brand text-on-brand' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Reschedule chips (In 1 hour, Tomorrow, Next week, Pick date), all computed
 * in the workspace time zone. Calls onChange with ISO UTC or null.
 */
export function DuePicker({
  onChange,
  allowNone,
  initial = allowNone ? 'none' : 'tomorrow',
  initialIso,
  idPrefix = 'due',
}: {
  onChange: (iso: string | null) => void;
  allowNone?: boolean;
  initial?: DueChoice;
  initialIso?: string;
  idPrefix?: string;
}) {
  const t = useTranslations('callOutcome');
  const s = useWorkspaceSettings();
  const [choice, setChoice] = useState<DueChoice>(initialIso ? 'pick' : initial);
  const start = isoToLocal(initialIso ?? presetDueAt('tomorrow', s.timezone), s.timezone);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);

  const pick = (c: DueChoice) => {
    setChoice(c);
    if (c === 'none') onChange(null);
    else if (c === 'pick') onChange(localToIso(date, time, s.timezone));
    else onChange(presetDueAt(c, s.timezone));
  };

  const options: DueChoice[] = [...(allowNone ? (['none'] as const) : []), 'in_1h', 'tomorrow', 'next_week', 'pick'];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Chip key={o} selected={choice === o} onClick={() => pick(o)}>
            {o === 'none' ? t('noNext') : o === 'pick' ? t('pickDate') : t(o)}
          </Chip>
        ))}
      </div>
      {choice === 'pick' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-date`}>{t('date')}</Label>
            <Input
              id={`${idPrefix}-date`}
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (e.target.value) onChange(localToIso(e.target.value, time, s.timezone));
              }}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-time`}>{t('time')}</Label>
            <Input
              id={`${idPrefix}-time`}
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                if (date) onChange(localToIso(date, e.target.value, s.timezone));
              }}
              className="h-11"
            />
          </div>
        </div>
      )}
    </div>
  );
}
