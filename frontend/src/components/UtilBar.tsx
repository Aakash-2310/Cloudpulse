interface Props {
  value: number;
  warning?: number;
  critical?: number;
  neutral?: boolean;
  label?: string;
}

/** Inline utilisation meter; the number is always shown next to the bar. */
export default function UtilBar({ value, warning = 75, critical = 90, neutral, label }: Props) {
  const v = Math.max(0, Math.min(100, value || 0));
  const tone = neutral ? 'neutral' : v >= critical ? 'critical' : v >= warning ? 'warning' : '';
  return (
    <div className="util" title={label}>
      <div className="util-bar" role="meter" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`util-fill ${tone}`} style={{ width: `${v}%` }} />
      </div>
      <span className="util-value">{v.toFixed(v < 10 ? 1 : 0)}%</span>
    </div>
  );
}
