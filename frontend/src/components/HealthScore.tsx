import type { HealthScore as HealthScoreData } from '../types/metrics';

const GRADE_COLOR: Record<HealthScoreData['grade'], string> = {
  excellent: 'var(--status-healthy)',
  good: 'var(--status-healthy)',
  fair: 'var(--status-warning)',
  poor: 'var(--status-critical)',
};

export default function HealthScore({ data }: { data: HealthScoreData }) {
  const r = 48;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, data.score)) / 100;
  const color = GRADE_COLOR[data.grade];
  return (
    <div className="health-score">
      <div className="health-ring" role="img" aria-label={`Infrastructure health ${data.score} out of 100, ${data.grade}`}>
        <svg width="112" height="112" viewBox="0 0 112 112">
          <circle cx="56" cy="56" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="9" />
          <circle
            cx="56"
            cy="56"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            transform="rotate(-90 56 56)"
          />
        </svg>
        <div className="health-ring-label">
          <span className="health-ring-value">{data.score}</span>
          <span className="health-ring-max">/ 100</span>
        </div>
      </div>
      <div className="health-breakdown">
        <div className="row">
          <span className="badge" style={{ background: 'var(--surface-2)', color }}>
            <span className="badge-dot" style={{ background: color }} />
            {data.grade[0]!.toUpperCase() + data.grade.slice(1)}
          </span>
        </div>
        <div className="health-breakdown-row">
          <span>Resource health</span>
          <b>{data.components.resources.toFixed(0)}%</b>
        </div>
        <div className="health-breakdown-row">
          <span>Service availability</span>
          <b>{data.components.services.toFixed(0)}%</b>
        </div>
        <div className="health-breakdown-row">
          <span>Critical alert penalty</span>
          <b>−{data.components.criticalAlertPenalty}</b>
        </div>
      </div>
    </div>
  );
}
