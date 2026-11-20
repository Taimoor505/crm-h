'use client';

/**
 * Report visuals: one form per job (trend, share, flow, distribution,
 * ranking). Categorical colours come from --chart-1..8 in fixed order;
 * ordered data uses one brand hue light→dark. Every chart has a hidden table.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '@/lib/utils';

export const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)'];
const OTHER = 'var(--color-gray-400)';
const AXIS = { fontSize: 12, fill: 'var(--color-gray-600)' };

function SrTable({ caption, rows }: { caption: string; rows: [string, string][] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <th scope="row">{k}</th>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Swatch({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block size-2.5 shrink-0 rounded-[3px]', className)} style={{ backgroundColor: color }} />;
}

// ------------------------------------------------------------------ sparkline

/** Tiny trend line for KPI tiles. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div aria-hidden="true" className={cn('h-10 w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke="var(--brand-primary)" strokeWidth={2} fill="url(#spark)" isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ------------------------------------------------------------------ stacked area (trend by category)

export interface StackSeries { key: string; label: string }

function StackTooltip({ active, payload, label, series }: { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string; series: StackSeries[] }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((a, p) => a + (p.value ?? 0), 0);
  return (
    <div className="min-w-40 rounded-lg border bg-white px-3 py-2 text-xs shadow-float">
      <p className="mb-1 flex justify-between gap-4 font-semibold text-gray-900"><span>{label}</span><span className="tabular-nums">{total}</span></p>
      {[...payload].reverse().map((p) => {
        const i = series.findIndex((s) => s.key === p.dataKey);
        return (
          <p key={p.dataKey} className="flex items-center justify-between gap-4 text-gray-700">
            <span className="flex items-center gap-1.5"><Swatch color={i >= 0 && i < SERIES.length ? SERIES[i] : OTHER} />{series[i]?.label ?? p.dataKey}</span>
            <span className="tabular-nums">{p.value}</span>
          </p>
        );
      })}
    </div>
  );
}

/** Daily counts stacked by category (≤ 5 named series + "other"). */
export function StackedTrend({ data, series, caption }: { data: Record<string, number | string>[]; series: StackSeries[]; caption: string }) {
  const color = (i: number, key: string) => (key === '__other' ? OTHER : SERIES[i]);
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-3 text-xs text-gray-700" aria-hidden="true">
        {series.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5"><Swatch color={color(i, s.key)} />{s.label}</li>
        ))}
      </ul>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke="var(--color-gray-100)" />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={40} />
            <Tooltip content={<StackTooltip series={series} />} cursor={{ stroke: 'var(--color-gray-300)' }} />
            {series.map((s, i) => (
              <Area key={s.key} type="monotone" dataKey={s.key} stackId="1" stroke="#fff" strokeWidth={1.5} fill={color(i, s.key)} fillOpacity={0.85} isAnimationActive={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <SrTable caption={caption} rows={data.map((d) => [String(d.label), series.map((s) => `${s.label}: ${d[s.key] ?? 0}`).join(', ')])} />
    </div>
  );
}

// ------------------------------------------------------------------ donut (share)

export interface ShareDatum { label: string; value: number; display: string }

/** Share of a whole: donut with the total in the middle and a legend with values. */
export function Donut({ data, caption, centerValue, centerLabel }: { data: ShareDatum[]; caption: string; centerValue: string; centerLabel: string }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const color = (i: number, d: ShareDatum) => (d.label === '__other' ? OTHER : SERIES[i % SERIES.length]);
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative size-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" innerRadius="66%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
              {data.map((d, i) => <Cell key={d.label} fill={color(i, d)} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-heading text-2xl font-bold tabular-nums text-gray-900">{centerValue}</p>
            <p className="text-xs text-gray-600">{centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-2 text-sm">
            <Swatch color={color(i, d)} />
            <span className="min-w-0 flex-1 truncate text-gray-800">{d.display}</span>
            <span className="font-semibold tabular-nums text-gray-900">{d.value}</span>
            <span className="w-10 text-end text-xs tabular-nums text-gray-500">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
      <SrTable caption={caption} rows={data.map((d) => [d.display, String(d.value)])} />
    </div>
  );
}

// ------------------------------------------------------------------ funnel (flow)

export interface FunnelStep { name: string; value: number; display: string; conversion: string | null }

/** Tapered funnel: each stage's width is its share of the first stage; conversion between steps. */
export function Funnel({ steps, caption }: { steps: FunnelStep[]; caption: string }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  const n = steps.length;
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => {
        const pct = Math.max(8, (s.value / max) * 100);
        // One hue, light → dark down the funnel (ordered data).
        const mix = 35 + Math.round((65 * i) / Math.max(1, n - 1));
        return (
          <div key={s.name}>
            {i > 0 && s.conversion && (
              <div className="flex justify-center py-0.5">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-gray-700">↓ {s.conversion}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs font-medium text-gray-700 sm:w-36">{s.name}</span>
              <div className="relative flex h-9 flex-1 items-center justify-center">
                <div
                  className="flex h-full items-center justify-center rounded-lg text-xs font-semibold text-white shadow-card"
                  style={{ width: `${pct}%`, backgroundColor: `color-mix(in oklab, var(--brand-primary) ${mix}%, var(--brand-surface))`, color: mix > 55 ? 'var(--brand-on-primary)' : 'var(--brand-ink)' }}
                >
                  <span className="truncate px-2 tabular-nums">{s.display}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <SrTable caption={caption} rows={steps.map((s) => [s.name, `${s.display}${s.conversion ? ` (${s.conversion})` : ''}`])} />
    </div>
  );
}

// ------------------------------------------------------------------ segmented bar (ordered distribution)

/** 100% bar for ordered buckets (fast → slow), one hue dark → light, then gray for "none". */
export function SegmentBar({ segments, caption }: { segments: (ShareDatum & { muted?: boolean })[]; caption: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const ordered = segments.filter((s) => !s.muted).length;
  const tone = (i: number, s: { muted?: boolean }) =>
    s.muted ? 'var(--color-gray-300)' : `color-mix(in oklab, var(--brand-primary) ${100 - Math.round((60 * i) / Math.max(1, ordered - 1))}%, white)`;
  return (
    <div className="space-y-4">
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
        {segments.map((s, i) => s.value > 0 && <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, backgroundColor: tone(i, s) }} title={`${s.label}: ${s.display}`} />)}
      </div>
      <ul className="grid grid-cols-2 gap-3">
        {segments.map((s, i) => (
          <li key={s.label} className="rounded-xl border bg-gray-50/60 p-3">
            <p className="flex items-center gap-1.5 text-xs text-gray-600"><Swatch color={tone(i, s)} />{s.label}</p>
            <p className="mt-1 font-heading text-lg font-bold tabular-nums text-gray-900">{Math.round((s.value / total) * 100)}%</p>
            <p className="text-xs text-gray-500 tabular-nums">{s.display}</p>
          </li>
        ))}
      </ul>
      <SrTable caption={caption} rows={segments.map((s) => [s.label, s.display])} />
    </div>
  );
}

// ------------------------------------------------------------------ columns with labels (magnitude over time)

export interface ColumnDatum { label: string; value: number; display: string; note: string }

function ColumnTooltip({ active, payload }: { active?: boolean; payload?: { payload: ColumnDatum }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-white px-3 py-2 text-xs shadow-float">
      <p className="font-semibold text-gray-900">{d.label}</p>
      <p className="tabular-nums text-gray-700">{d.display}</p>
      <p className="tabular-nums text-gray-500">{d.note}</p>
    </div>
  );
}

/** Gradient columns with the value printed above each one. */
export function Columns({ data, caption, tickFormatter }: { data: ColumnDatum[]; caption: string; tickFormatter: (v: number) => string }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 12, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="colFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--brand-primary)" />
              <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-gray-100)" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={tickFormatter} width={64} />
          <Tooltip content={<ColumnTooltip />} cursor={{ fill: 'var(--color-gray-100)' }} />
          <Bar dataKey="value" fill="url(#colFill)" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
            <LabelList dataKey="display" position="top" className="fill-gray-700 text-[11px] font-semibold" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <SrTable caption={caption} rows={data.map((d) => [d.label, `${d.display} · ${d.note}`])} />
    </div>
  );
}

// ------------------------------------------------------------------ ranked share list

/** Ranked list with a share bar per row (reasons, categories with long names). */
export function RankedShares({ rows, caption }: { rows: { label: string; share: number; primary: string; secondary: string }[]; caption: string }) {
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="grid size-5 shrink-0 place-items-center rounded-md bg-gray-100 text-[11px] font-bold text-gray-700">{i + 1}</span>
              <span className="truncate font-medium text-gray-900">{r.label}</span>
            </span>
            <span className="shrink-0 text-xs text-gray-600 tabular-nums"><span className="font-semibold text-gray-900">{r.primary}</span> · {r.secondary}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, r.share * 100)}%`, backgroundColor: 'var(--chart-2)' }} />
          </div>
        </li>
      ))}
      <SrTable caption={caption} rows={rows.map((r) => [r.label, `${r.primary} · ${r.secondary}`])} />
    </ol>
  );
}
