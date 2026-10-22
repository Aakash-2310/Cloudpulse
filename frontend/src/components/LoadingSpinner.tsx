import type { CSSProperties } from 'react';

interface Props {
  size?: 'md' | 'lg';
  label?: string;
}

export default function LoadingSpinner({ size = 'md', label = 'Loading' }: Props) {
  return (
    <span className="row" role="status" aria-live="polite">
      <span className={`spinner ${size === 'lg' ? 'lg' : ''}`} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="page-loader">
      <div className="state">
        <LoadingSpinner size="lg" label={label} />
        <div className="small muted">{label}</div>
      </div>
    </div>
  );
}

export function Skeleton({ width = '100%', height = 14, style }: { width?: number | string; height?: number | string; style?: CSSProperties }) {
  return <div className="skeleton" style={{ width, height, ...style }} aria-hidden />;
}

/** Placeholder block for a card body while its data loads. */
export function CardSkeleton({ rows = 4, chart = false }: { rows?: number; chart?: boolean }) {
  return (
    <div className="card-body" aria-busy="true">
      {chart ? (
        <Skeleton height={220} />
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} width={`${90 - i * 9}%`} />
          ))}
        </div>
      )}
    </div>
  );
}
