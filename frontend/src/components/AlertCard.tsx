import { CheckCheck, Clock, Eye, Server, Trash2, Zap } from 'lucide-react';
import type { Alert } from '../types/alert';
import StatusBadge, { SeverityPill } from './StatusBadge';
import { ProviderTag } from './ProviderIcon';
import { formatDateTime, timeAgo } from '../utils/formatters';

interface Props {
  alert: Alert;
  focused?: boolean;
  busy?: boolean;
  canAct?: boolean;
  canDelete?: boolean;
  onAcknowledge?: (a: Alert) => void;
  onResolve?: (a: Alert) => void;
  onDelete?: (a: Alert) => void;
}

export default function AlertCard({ alert, focused, busy, canAct, canDelete, onAcknowledge, onResolve, onDelete }: Props) {
  const resolved = alert.status === 'resolved';
  return (
    <article className={`alert-card ${resolved ? 'resolved' : alert.severity} ${focused ? 'focused' : ''}`} id={`alert-${alert._id}`}>
      <div className="alert-main">
        <div className="alert-title-row">
          <SeverityPill severity={alert.severity} />
          <span className="alert-title">{alert.title}</span>
          <StatusBadge status={alert.status} />
        </div>
        {alert.description && <p className="alert-desc">{alert.description}</p>}
        <div className="alert-meta">
          <span>
            <ProviderTag provider={alert.provider} size={16} />
          </span>
          {alert.resourceName && (
            <span>
              <Server size={13} /> {alert.resourceName}
            </span>
          )}
          {alert.ruleName && (
            <span>
              <Zap size={13} /> {alert.ruleName}
            </span>
          )}
          <span title={formatDateTime(alert.createdAt)}>
            <Clock size={13} /> {timeAgo(alert.createdAt)}
          </span>
          {alert.resolvedAt && <span>Resolved {timeAgo(alert.resolvedAt)}</span>}
          {!alert.resolvedAt && alert.acknowledgedAt && <span>Acknowledged {timeAgo(alert.acknowledgedAt)}</span>}
        </div>
      </div>
      {(canAct || canDelete) && (
        <div className="alert-actions">
          {canAct && alert.status === 'open' && (
            <button className="btn btn-sm" onClick={() => onAcknowledge?.(alert)} disabled={busy}>
              <Eye size={14} /> Acknowledge
            </button>
          )}
          {canAct && !resolved && (
            <button className="btn btn-sm btn-primary" onClick={() => onResolve?.(alert)} disabled={busy}>
              <CheckCheck size={14} /> Resolve
            </button>
          )}
          {canDelete && (
            <button className="icon-btn sm" onClick={() => onDelete?.(alert)} disabled={busy} aria-label="Delete alert" title="Delete alert">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </article>
  );
}
