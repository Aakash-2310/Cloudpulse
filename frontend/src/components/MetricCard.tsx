import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Skeleton } from './LoadingSpinner';
import { formatChange } from '../utils/formatters';

interface Props {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: ReactNode;
  tone?: 'default' | 'primary' | 'healthy' | 'warning' | 'critical';
  change?: number | null;
  /** Whether an increase is good (e.g. healthy count) or bad (e.g. cost). */
  increaseIsGood?: boolean;
  footnote?: ReactNode;
  loading?: boolean;
  onClick?: () => void;
}

export default function MetricCard({ label, value, unit, icon, tone = 'default', change, increaseIsGood = false, footnote, loading, onClick }: Props) {
  let trendClass = 'neutral';
  let TrendIcon = Minus;
  if (change !== undefined && change !== null && Math.abs(change) >= 0.05) {
    const up = change > 0;
    TrendIcon = up ? ArrowUpRight : ArrowDownRight;
    trendClass = up === increaseIsGood ? (up ? 'up-good' : 'down-good') : up ? 'up-bad' : 'down-bad';
  }
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className="card metric-card"
      onClick={onClick}
      style={onClick ? { cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' } : undefined}
    >
      <div className="metric-card-top">
        <span className="metric-label">{label}</span>
        {icon && <span className={`metric-icon tone-${tone}`}>{icon}</span>}
      </div>
      {loading ? (
        <Skeleton width="60%" height={28} />
      ) : (
        <div className="metric-value">
          {value}
          {unit && <small>{unit}</small>}
        </div>
      )}
      <div className="metric-foot">
        {change !== undefined && change !== null && !loading && (
          <span className={`trend ${trendClass}`}>
            <TrendIcon size={13} aria-hidden />
            {formatChange(change)}
          </span>
        )}
        {footnote && <span className="truncate">{footnote}</span>}
      </div>
    </Tag>
  );
}
