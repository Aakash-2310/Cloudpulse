import type { ReactNode } from 'react';

export interface TooltipSeries {
  key: string;
  label: string;
  color: string;
}

interface Payload {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
  name?: string;
  payload?: Record<string, unknown>;
}

interface Props {
  active?: boolean;
  label?: string | number;
  payload?: Payload[];
  formatLabel?: (label: string) => string;
  formatValue?: (value: number, key: string) => string;
  series?: TooltipSeries[];
  footer?: (payload: Record<string, unknown>) => ReactNode;
}

/** Shared tooltip: title + one row per series (swatch, label, value in text ink). */
export default function ChartTooltip({ active, label, payload, formatLabel, formatValue, series, footer }: Props) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value !== undefined && p.value !== null);
  return (
    <div className="chart-tooltip">
      {label !== undefined && label !== '' && <div className="chart-tooltip-title">{formatLabel ? formatLabel(String(label)) : String(label)}</div>}
      {rows.map((p) => {
        const key = String(p.dataKey ?? p.name);
        const meta = series?.find((s) => s.key === key);
        const value = typeof p.value === 'number' ? p.value : Number(p.value);
        return (
          <div className="chart-tooltip-row" key={key}>
            <span className="swatch" style={{ background: meta?.color ?? p.color ?? (p.payload?.fill as string | undefined) ?? (p.payload?.color as string | undefined) }} />
            <span>{meta?.label ?? p.name ?? key}</span>
            <span className="val">{formatValue ? formatValue(value, key) : value.toLocaleString()}</span>
          </div>
        );
      })}
      {footer && payload[0]?.payload && footer(payload[0].payload)}
    </div>
  );
}

export function ChartLegend({ series, line }: { series: TooltipSeries[]; line?: boolean }) {
  return (
    <div className="legend" role="list">
      {series.map((s) => (
        <span className="legend-item" key={s.key} role="listitem">
          <span className={`swatch ${line ? 'line' : ''}`} style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}
