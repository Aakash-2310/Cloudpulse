import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from 'recharts';
import ChartTooltip, { ChartLegend, type TooltipSeries } from './ChartTooltip';
import EmptyState from './EmptyState';
import { formatDateTime, formatTick } from '../utils/formatters';

export interface MetricSeries extends TooltipSeries {
  /** Optional per-series dash for secondary encoding. */
  dashed?: boolean;
}

interface Props<T> {
  data: T[];
  series: MetricSeries[];
  xKey?: string;
  type?: 'area' | 'line';
  range?: string;
  height?: number;
  stacked?: boolean;
  yDomain?: [number | 'auto' | 'dataMin', number | 'auto' | 'dataMax'];
  yFormatter?: (v: number) => string;
  valueFormatter?: (v: number, key: string) => string;
  threshold?: { value: number; label: string };
  xFormatter?: (v: string) => string;
  showLegend?: boolean;
}

/**
 * Time-series chart used across monitoring pages: thin 2px lines, light area fill,
 * recessive grid, crosshair + tooltip, legend for 2+ series.
 */
export default function MetricChart<T extends object>({
  data,
  series,
  xKey = 'timestamp',
  type = 'area',
  range = '24h',
  height = 260,
  stacked,
  yDomain,
  yFormatter,
  valueFormatter,
  threshold,
  xFormatter,
  showLegend,
}: Props<T>) {
  const gid = useId().replace(/:/g, '');
  if (!data.length) {
    return <EmptyState compact title="No data for this period" description="Metrics will appear once samples are collected." />;
  }
  const tickFmt = xFormatter ?? ((v: string) => formatTick(v, range));
  const legend = showLegend ?? series.length > 1;
  const common = {
    data,
    margin: { top: 8, right: 8, left: -8, bottom: 0 },
  };
  const axes = [
    <CartesianGrid key="g" vertical={false} strokeDasharray="0" />,
    <XAxis key="x" dataKey={xKey} tickFormatter={tickFmt} tickLine={false} axisLine={false} minTickGap={28} dy={4} />,
    <YAxis key="y" tickLine={false} axisLine={false} width={52} domain={yDomain ?? [0, 'auto']} tickFormatter={yFormatter} allowDecimals={false} />,
    <Tooltip
      key="t"
      cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
      content={<ChartTooltip series={series} formatLabel={(l) => (xFormatter ? xFormatter(l) : formatDateTime(l))} formatValue={valueFormatter} />}
    />,
    threshold ? (
      <ReferenceLine
        key="th"
        y={threshold.value}
        stroke="var(--status-critical)"
        strokeDasharray="4 4"
        strokeWidth={1}
        label={{ value: threshold.label, position: 'insideTopRight', fontSize: 11 }}
      />
    ) : null,
  ];

  return (
    <div>
      {legend && (
        <div style={{ marginBottom: 10 }}>
          <ChartLegend series={series} line={type === 'line'} />
        </div>
      )}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          {type === 'line' ? (
            <LineChart {...common}>
              {axes}
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart {...common}>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={stacked ? 0.55 : 0.22} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={stacked ? 0.35 : 0.02} />
                  </linearGradient>
                ))}
              </defs>
              {axes}
              {series.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stackId={stacked ? 'stack' : undefined}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dashed ? '5 4' : undefined}
                  fill={`url(#${gid}-${s.key})`}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
