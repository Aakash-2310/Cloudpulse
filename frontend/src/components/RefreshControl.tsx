import { RefreshCw } from 'lucide-react';
import { useNow } from '../hooks/useDebounce';
import { timeAgo } from '../utils/formatters';

interface Props {
  lastUpdated: Date | null;
  refreshing?: boolean;
  onRefresh: () => void;
  autoRefreshSeconds?: number;
}

/** "Last updated: 14 seconds ago" + manual refresh button. */
export default function RefreshControl({ lastUpdated, refreshing, onRefresh, autoRefreshSeconds }: Props) {
  useNow(1000);
  return (
    <div className="refresh-meta">
      <span className="live-dot" aria-hidden style={{ opacity: autoRefreshSeconds ? 1 : 0.3 }} />
      <span className="hide-sm">
        Last updated: {lastUpdated ? timeAgo(lastUpdated) : '—'}
        {autoRefreshSeconds ? ` · auto ${autoRefreshSeconds}s` : ''}
      </span>
      <button className="btn btn-sm" onClick={onRefresh} disabled={refreshing} aria-label="Refresh data">
        <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
        <span className="hide-sm">Refresh</span>
      </button>
    </div>
  );
}
