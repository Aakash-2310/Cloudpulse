import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Resource } from '../types/resource';
import StatusBadge from './StatusBadge';
import { ProviderTag } from './ProviderIcon';
import UtilBar from './UtilBar';
import { RESOURCE_TYPES } from '../utils/constants';
import { formatCurrency, formatMbps, timeAgo } from '../utils/formatters';

interface Props {
  items: Resource[];
  sort?: string;
  order?: 'asc' | 'desc';
  onSort?: (field: string) => void;
  onDelete?: (resource: Resource) => void;
}

const COLUMNS: Array<{ key: string; label: string; sortable?: boolean; num?: boolean; hideSm?: boolean }> = [
  { key: 'name', label: 'Resource', sortable: true },
  { key: 'provider', label: 'Provider', sortable: true },
  { key: 'type', label: 'Type', sortable: true },
  { key: 'region', label: 'Region', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'cpu', label: 'CPU', sortable: true },
  { key: 'memory', label: 'Memory', sortable: true },
  { key: 'network', label: 'Network', sortable: true, num: true },
  { key: 'cost', label: 'Cost / mo', sortable: true, num: true },
  { key: 'updatedAt', label: 'Last updated', sortable: true },
];

export default function ResourceTable({ items, sort, order, onSort, onDelete }: Props) {
  const navigate = useNavigate();
  const open = (r: Resource) => navigate(`/resources/${r._id}`);

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const active = sort === c.key;
              const Icon = active ? (order === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
              return (
                <th
                  key={c.key}
                  className={`${c.sortable && onSort ? 'sortable' : ''} ${c.num ? 'num' : ''}`}
                  onClick={() => c.sortable && onSort?.(c.key)}
                  aria-sort={active ? (order === 'desc' ? 'descending' : 'ascending') : undefined}
                  scope="col"
                >
                  <span className="th-inner">
                    {c.label}
                    {c.sortable && onSort && <Icon size={12} style={{ opacity: active ? 1 : 0.4 }} />}
                  </span>
                </th>
              );
            })}
            <th className="num" scope="col">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const stopped = r.state === 'stopped';
            return (
              <tr key={r._id} className="clickable" onClick={() => open(r)}>
                <td>
                  <div className="cell-title">{r.name}</div>
                  <div className="cell-sub mono" title={r.resourceId}>
                    {r.sku ?? r.service} · {r.environment}
                  </div>
                </td>
                <td>
                  <ProviderTag provider={r.provider} />
                </td>
                <td>
                  <div>{RESOURCE_TYPES[r.type]?.label ?? r.type}</div>
                  <div className="cell-sub">{r.service}</div>
                </td>
                <td className="mono">{r.region}</td>
                <td>
                  <StatusBadge status={r.status} />
                  {stopped && (
                    <div className="cell-sub" style={{ marginTop: 2 }}>
                      Stopped
                    </div>
                  )}
                </td>
                <td>{stopped || r.type === 'virtual-network' ? <span className="muted">—</span> : <UtilBar value={r.cpu} label="CPU utilization" />}</td>
                <td>{stopped || r.type === 'virtual-network' ? <span className="muted">—</span> : <UtilBar value={r.memory} warning={80} critical={92} label="Memory utilization" />}</td>
                <td className="num">{stopped ? '—' : formatMbps(r.network)}</td>
                <td className="num">{formatCurrency(r.cost)}</td>
                <td className="muted small">{timeAgo(r.lastSeenAt ?? r.updatedAt)}</td>
                <td>
                  <div className="cell-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="icon-btn ghost sm" onClick={() => open(r)} aria-label={`Open ${r.name}`} title="View details">
                      <ExternalLink size={14} />
                    </button>
                    {onDelete && (
                      <button className="icon-btn ghost sm" onClick={() => onDelete(r)} aria-label={`Remove ${r.name}`} title="Remove from monitoring">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
