import type { TimeRange } from '../types/common';
import { TIME_RANGES } from '../utils/constants';

interface Props {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  options?: TimeRange[];
}

export default function TimeRangePicker({ value, onChange, options }: Props) {
  const list = options ? TIME_RANGES.filter((r) => options.includes(r.value)) : TIME_RANGES;
  return (
    <div className="segmented" role="radiogroup" aria-label="Time range">
      {list.map((r) => (
        <button key={r.value} role="radio" aria-checked={value === r.value} className={value === r.value ? 'active' : ''} onClick={() => onChange(r.value)} title={r.label}>
          {r.short}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
