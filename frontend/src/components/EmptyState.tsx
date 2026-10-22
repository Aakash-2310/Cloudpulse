import type { ReactNode } from 'react';
import { AlertOctagon, Inbox, RefreshCw } from 'lucide-react';

interface Props {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}

export default function EmptyState({ icon, title, description, action, compact }: Props) {
  return (
    <div className={`state ${compact ? 'compact' : ''}`}>
      <div className="state-icon">{icon ?? <Inbox size={20} />}</div>
      <div className="state-title">{title}</div>
      {description && <div className="state-text">{description}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry, compact }: { message: string; onRetry?: () => void; compact?: boolean }) {
  return (
    <div className={`state ${compact ? 'compact' : ''}`} role="alert">
      <div className="state-icon error">
        <AlertOctagon size={20} />
      </div>
      <div className="state-title">Couldn’t load this data</div>
      <div className="state-text">{message}</div>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}
