'use client';

/**
 * Report charts (Recharts, loaded on demand). Every chart here is a single
 * series, so it uses the brand hue only; the speed buckets use one hue light→
 * dark because they are ordered. Each chart ships with a hidden data table.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface BarDatum {
  label: string;
  value: number;
  /** Shown in the tooltip and the data table. */
  display: string;
}

const AXIS = { fontSize: 12, fill: 'var(--color-gray-600)' };

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: BarDatum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-float">
      <p className="font-medium text-gray-900">{d.label}</p>
      <p className="tabular-nums text-gray-700">{d.display}</p>
    </div>
  );
}

function DataTable({ data, caption, valueLabel }: { data: BarDatum[]; caption: string; valueLabel: string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{caption}</th>
          <th scope="col">{valueLabel}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}>
            <th scope="row">{d.label}</th>
            <td>{d.display}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Horizontal bars: categories with long names (sources, reasons, stages). */
export function HBarChart({ data, caption, valueLabel, shades }: { data: BarDatum[]; caption: string; valueLabel: string; shades?: boolean }) {
  const height = Math.max(120, data.length * 36 + 16);
  return (
    <div>
      <div aria-hidden="true" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={8}>
            <CartesianGrid horizontal={false} stroke="var(--color-gray-200)" />
            <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="label" tick={AXIS} axisLine={false} tickLine={false} width={120} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-gray-100)' }} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={d.label} fill="var(--brand-primary)" fillOpacity={shades ? 0.35 + (0.65 * (data.length - 1 - i)) / Math.max(1, data.length - 1) : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable data={data} caption={caption} valueLabel={valueLabel} />
    </div>
  );
}

/** Vertical bars over time (months). */
export function VBarChart({ data, caption, valueLabel, tickFormatter }: { data: BarDatum[]; caption: string; valueLabel: string; tickFormatter?: (v: number) => string }) {
  return (
    <div>
      <div aria-hidden="true" className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }} barCategoryGap="30%">
            <CartesianGrid vertical={false} stroke="var(--color-gray-200)" />
            <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis tick={AXIS} axisLine={false} tickLine={false} width={64} tickFormatter={tickFormatter} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--color-gray-100)' }} />
            <Bar dataKey="value" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} maxBarSize={40} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable data={data} caption={caption} valueLabel={valueLabel} />
    </div>
  );
}

function AreaTooltip({ active, payload }: { active?: boolean; payload?: { payload: { label: string; leads: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-float">
      <p className="font-medium text-gray-900">{d.label}</p>
      <p className="font-semibold tabular-nums text-brand-ink">{d.leads}</p>
    </div>
  );
}

/** Daily counts as a soft brand-filled area (Home). Hidden table for screen readers. */
export function LeadsAreaChart({ data }: { data: { day: string; label: string; leads: number }[] }) {
  return (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="leadsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-gray-100)" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<AreaTooltip />} cursor={{ stroke: 'var(--brand-primary)', strokeOpacity: 0.3 }} />
          <Area type="monotone" dataKey="leads" stroke="var(--brand-primary)" strokeWidth={2.5} fill="url(#leadsFill)" activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.label}</th>
              <td>{d.leads}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
