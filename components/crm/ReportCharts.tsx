'use client';

/**
 * Report charts (Recharts, loaded on demand). Every chart here is a single
 * series, so it uses the brand hue only; the speed buckets use one hue light→
 * dark because they are ordered. Each chart ships with a hidden data table.
 */
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
