import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ChartTooltip, { ChartLegend, type TooltipSeries } from './ChartTooltip';
import MetricChart from './MetricChart';
import EmptyState from './EmptyState';
import type { CostBreakdownItem, DailyCostPoint, MonthlyCostPoint } from '../types/cost';
import type { Provider } from '../types/common';
import { PROVIDERS, PROVIDER_KEYS, SERIES } from '../utils/constants';
import { formatCompactCurrency, formatCurrency, formatShortDate } from '../utils/formatters';

export const PROVIDER_SERIES: TooltipSeries[] = PROVIDER_KEYS.map((p) => ({ key: p, label: PROVIDERS[p].label, color: PROVIDERS[p].color }));

const money = (v: number) => formatCurrency(v);

/** Bar chart of spend per provider (one bar per provider, direct-labelled). */
export function ProviderCostBar({ data, height = 240 }: { data: CostBreakdownItem[]; height?: number }) {
  if (!data.length) return <EmptyState compact title="No cost data yet" />;
  const rows = PROVIDER_KEYS.map((p) => data.find((d) => d.name === p)).filter(Boolean) as CostBreakdownItem[];
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 22, right: 8, left: -4, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} dy={4} />
          <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatCompactCurrency} />
          <Tooltip
            cursor={{ fill: 'var(--surface-2)' }}
            content={
              <ChartTooltip
                formatValue={(v) => money(v)}
                series={[{ key: 'amount', label: 'Last 30 days', color: 'var(--text-3)' }]}
                footer={(p) =>
                  typeof p.changePct === 'number' ? (
                    <div className="chart-tooltip-row">
                      <span>vs prior 30 days</span>
                      <span className="val">{(p.changePct as number) > 0 ? '+' : ''}{(p.changePct as number).toFixed(1)}%</span>
                    </div>
                  ) : null
                }
              />
            }
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={72} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.name} fill={PROVIDERS[r.name as Provider]?.color ?? SERIES.s1} />
            ))}
            <LabelList dataKey="amount" position="top" formatter={(v: unknown) => formatCompactCurrency(Number(v))} style={{ fill: 'var(--text-2)', fontSize: 12, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Stacked daily spend by provider (area). */
export function DailySpendChart({ data, height = 260 }: { data: DailyCostPoint[]; height?: number }) {
  return (
    <MetricChart
      data={data}
      xKey="date"
      series={PROVIDER_SERIES}
      stacked
      height={height}
      xFormatter={formatShortDate}
      yFormatter={formatCompactCurrency}
      valueFormatter={(v) => money(v)}
    />
  );
}

/** Monthly spend per provider plus the total (dashed, neutral). */
export function MonthlyCostChart({ data, height = 260 }: { data: MonthlyCostPoint[]; height?: number }) {
  const series = [...PROVIDER_SERIES, { key: 'total', label: 'Total', color: 'var(--text-3)', dashed: true }];
  return (
    <MetricChart
      data={data}
      xKey="label"
      type="line"
      series={series}
      height={height}
      xFormatter={(v) => v}
      yFormatter={formatCompactCurrency}
      valueFormatter={(v) => money(v)}
    />
  );
}

const SLICE_COLORS = [SERIES.s1, SERIES.s2, SERIES.s3, SERIES.s4, SERIES.s5, SERIES.s6];

/** Donut of spend by service: top 6 services + "Other". Legend lists every slice with its value. */
export function ServiceDonut({ data, height = 240 }: { data: CostBreakdownItem[]; height?: number }) {
  if (!data.length) return <EmptyState compact title="No cost data yet" />;
  const top = data.slice(0, 6);
  const rest = data.slice(6);
  const slices = [
    ...top.map((d, i) => ({ name: d.label, amount: d.amount, share: d.share, color: SLICE_COLORS[i] })),
    ...(rest.length
      ? [{ name: 'Other', amount: rest.reduce((s, r) => s + r.amount, 0), share: rest.reduce((s, r) => s + r.share, 0), color: 'var(--status-unknown)' }]
      : []),
  ];
  const total = slices.reduce((s, x) => s + x.amount, 0);
  return (
    <div className="row wrap" style={{ gap: 20, alignItems: 'center' }}>
      <div style={{ width: 200, height, position: 'relative', flexShrink: 0, margin: '0 auto' }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="amount" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={1.5} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
              {slices.map((s) => (
                <Cell key={s.name} fill={s.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip formatValue={(v) => money(v)} />} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="bold" style={{ fontSize: 18 }}>{formatCompactCurrency(total)}</div>
            <div className="xs muted">30 days</div>
          </div>
        </div>
      </div>
      <div className="stack" style={{ gap: 6, flex: 1, minWidth: 180 }}>
        {slices.map((s) => (
          <div key={s.name} className="row-between small">
            <span className="legend-item">
              <span className="swatch" style={{ background: s.color }} />
              {s.name}
            </span>
            <span className="tabular">
              <span className="bold">{formatCurrency(s.amount)}</span> <span className="muted">· {s.share.toFixed(0)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Generic horizontal breakdown (e.g. cost by region) rendered as labelled bars. */
export function BreakdownBars({ data, max = 8 }: { data: CostBreakdownItem[]; max?: number }) {
  if (!data.length) return <EmptyState compact title="No data" />;
  const rows = data.slice(0, max);
  const top = rows[0]?.amount || 1;
  return (
    <div className="stack" style={{ gap: 12 }}>
      {rows.map((r) => (
        <div key={r.name}>
          <div className="row-between small" style={{ marginBottom: 4 }}>
            <span className="text-2">{r.label}</span>
            <span className="tabular">
              <span className="bold">{formatCurrency(r.amount)}</span> <span className="muted">{r.share.toFixed(1)}%</span>
            </span>
          </div>
          <div className="util-bar" style={{ height: 8 }}>
            <div className="util-fill neutral" style={{ width: `${(r.amount / top) * 100}%`, background: r.provider ? PROVIDERS[r.provider]?.color : undefined }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export { ChartLegend };
export default ProviderCostBar;
