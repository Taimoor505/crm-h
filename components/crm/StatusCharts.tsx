'use client';

/**
 * Status-page charts. Speed: two series (median, 95th percentile) in the first
 * two categorical hues, with a legend and a hover crosshair. Volume: requests
 * with server errors stacked on top in the critical red. Both have data tables.
 */
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface HourPoint {
  hour: string;
  label: string;
  requests: number;
  errors: number;
  p50: number | null;
  p95: number | null;
}

const AXIS = { fontSize: 12, fill: 'var(--color-gray-600)' };

interface Series {
  key: 'p50' | 'p95' | 'ok' | 'errors';
  name: string;
  color: string;
}

function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2 w-3 rounded-sm" style={{ background: s.color }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function HoverCard({ active, payload, series, fmt }: { active?: boolean; payload?: { payload: HourPoint & { ok: number } }[]; series: Series[]; fmt: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-float">
      <p className="mb-1 font-medium text-gray-900">{d.label}</p>
      {series.map((s) => {
        const v = s.key === 'ok' ? d.requests : d[s.key];
        return (
          <p key={s.key} className="flex items-center gap-2 text-gray-700">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: s.color }} />
            <span className="flex-1">{s.name}</span>
            <span className="font-semibold tabular-nums text-gray-900">{v == null ? '—' : fmt(v)}</span>
          </p>
        );
      })}
    </div>
  );
}

function Table({ data, caption, hourCol, series, fmt }: { data: HourPoint[]; caption: string; hourCol: string; series: Series[]; fmt: (v: number) => string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{hourCol}</th>
          {series.map((s) => <th key={s.key} scope="col">{s.name}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.hour}>
            <th scope="row">{d.label}</th>
            {series.map((s) => {
              const v = s.key === 'ok' ? d.requests : d[s.key];
              return <td key={s.key}>{v == null ? '—' : fmt(v)}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** `axisFmt` is the short tick label (numbers only); the unit is in the title. */
export function SpeedChart({ data, caption, hourCol, labels, fmt, axisFmt }: { data: HourPoint[]; caption: string; hourCol: string; labels: { p50: string; p95: string }; fmt: (v: number) => string; axisFmt: (v: number) => string }) {
  const series: Series[] = [
    { key: 'p50', name: labels.p50, color: 'var(--chart-1)' },
    { key: 'p95', name: labels.p95, color: 'var(--chart-2)' },
  ];
  return (
    <div className="space-y-2">
      <Legend series={series} />
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--color-gray-100)" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={32} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={axisFmt} />
            <Tooltip content={<HoverCard series={series} fmt={fmt} />} cursor={{ stroke: 'var(--color-gray-300)' }} />
            {series.map((s) => (
              <Line key={s.key} dataKey={s.key} name={s.name} type="monotone" stroke={s.color} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, strokeWidth: 2, stroke: 'white' }} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Table data={data} caption={caption} hourCol={hourCol} series={series} fmt={fmt} />
    </div>
  );
}

export function VolumeChart({ data, caption, hourCol, labels, fmt }: { data: HourPoint[]; caption: string; hourCol: string; labels: { requests: string; errors: string }; fmt: (v: number) => string }) {
  const series: Series[] = [
    { key: 'ok', name: labels.requests, color: 'var(--chart-1)' },
    { key: 'errors', name: labels.errors, color: 'var(--chart-8)' },
  ];
  const rows = data.map((d) => ({ ...d, ok: Math.max(0, d.requests - d.errors) }));
  return (
    <div className="space-y-2">
      <Legend series={series} />
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--color-gray-100)" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={32} />
            <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={fmt} />
            <Tooltip content={<HoverCard series={series} fmt={fmt} />} cursor={{ fill: 'var(--color-gray-100)' }} />
            <Bar dataKey="ok" stackId="r" fill="var(--chart-1)" stroke="white" strokeWidth={1} maxBarSize={18} isAnimationActive={false} />
            <Bar dataKey="errors" stackId="r" fill="var(--chart-8)" stroke="white" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Table data={data} caption={caption} hourCol={hourCol} series={series} fmt={fmt} />
    </div>
  );
}
