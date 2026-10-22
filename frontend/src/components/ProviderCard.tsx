import { RefreshCw } from 'lucide-react';
import type { ProviderOverview } from '../types/cloud';
import ProviderIcon from './ProviderIcon';
import StatusBadge from './StatusBadge';
import { PROVIDERS } from '../utils/constants';
import { formatCurrency, formatNumber, timeAgo } from '../utils/formatters';

interface Props {
  provider: ProviderOverview;
  onSync?: () => void;
  syncing?: boolean;
  onConnect?: () => void;
}

export default function ProviderCard({ provider: p, onSync, syncing, onConnect }: Props) {
  const connected = p.status !== 'not-connected';
  return (
    <div className="card provider-card">
      <div className="provider-card-head">
        <ProviderIcon provider={p.provider} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="provider-card-title">{p.label}</div>
          <div className="provider-card-sub truncate">
            {connected ? `${p.accounts.length} account${p.accounts.length === 1 ? '' : 's'} · ${p.accountName}${p.accounts.length > 1 ? ' +' + (p.accounts.length - 1) : ''}` : PROVIDERS[p.provider].name}
          </div>
        </div>
        <StatusBadge status={p.status} />
      </div>

      {connected ? (
        <>
          <div className="provider-stats">
            <div className="provider-stat">
              <div className="provider-stat-label">Regions</div>
              <div className="provider-stat-value">{p.regionCount}</div>
            </div>
            <div className="provider-stat">
              <div className="provider-stat-label">Resources</div>
              <div className="provider-stat-value">{formatNumber(p.resourceCount)}</div>
            </div>
            <div className="provider-stat">
              <div className="provider-stat-label">Cost / month</div>
              <div className="provider-stat-value">{formatCurrency(p.monthlyCost)}</div>
            </div>
          </div>
          <div className="provider-card-foot">
            <span className="row">
              Health <StatusBadge status={p.health} />
            </span>
            <span className="row">
              Synced {timeAgo(p.lastSync)}
              {onSync && (
                <button className="icon-btn ghost sm" onClick={onSync} disabled={syncing} aria-label={`Synchronize ${p.label}`} title="Synchronize now">
                  <RefreshCw size={14} className={syncing ? 'spin' : ''} />
                </button>
              )}
            </span>
          </div>
        </>
      ) : (
        <div className="state compact" style={{ padding: '12px 0' }}>
          <div className="state-text">No {p.label} account connected yet.</div>
          {onConnect && (
            <button className="btn btn-sm btn-primary" onClick={onConnect}>
              Connect {p.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
