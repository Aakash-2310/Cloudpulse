import { useMemo, useState } from 'react';
import { CheckCircle2, CircleHelp, Download, OctagonAlert, TriangleAlert } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import StatusBadge from '../components/StatusBadge';
import { ProviderTag } from '../components/ProviderIcon';
import RefreshControl from '../components/RefreshControl';
import { Segmented } from '../components/TimeRangePicker';
import EmptyState, { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../hooks/usePreferences';
import { cloudService } from '../services/cloudService';
import { systemService } from '../services/dashboardService';
import type { ServiceHealthItem } from '../types/cloud';
import { STATUS_META } from '../utils/constants';
import { formatDateTime, timeAgo } from '../utils/formatters';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'platform', label: 'Platform' },
  { value: 'application', label: 'Applications' },
  { value: 'data', label: 'Data stores' },
];

const ORDER = { critical: 0, warning: 1, unknown: 2, healthy: 3 };

function ServiceTile({ s }: { s: ServiceHealthItem }) {
  return (
    <div className="card service-tile">
      <div className="service-tile-head">
        <div style={{ minWidth: 0 }}>
          <div className="service-name">{s.name}</div>
          <div className="service-desc truncate">{s.description}</div>
        </div>
        <StatusBadge status={s.status} />
      </div>
      <div className="service-stats">
        <div>
          <div className="service-stat-label">Uptime</div>
          <div className="service-stat-value">{s.uptime.toFixed(2)}%</div>
        </div>
        <div>
          <div className="service-stat-label">Response time</div>
          <div className={`service-stat-value ${s.responseTime > 750 ? 'text-critical' : s.responseTime > 400 ? 'text-warning' : ''}`}>{s.responseTime} ms</div>
        </div>
        <div>
          <div className="service-stat-label">Error rate</div>
          <div className={`service-stat-value ${s.errorRate > 5 ? 'text-critical' : s.errorRate > 1 ? 'text-warning' : ''}`}>{s.errorRate.toFixed(2)}%</div>
        </div>
      </div>
      <div>
        <div className="uptime-bars" aria-label={`Last ${s.history.length} checks`}>
          {s.history.map((h, i) => (
            <span key={i} style={{ background: STATUS_META[h.status].color, opacity: h.status === 'healthy' ? 0.75 : 1 }} title={`${formatDateTime(h.timestamp)} · ${STATUS_META[h.status].label} · ${h.responseTime} ms`} />
          ))}
        </div>
        <div className="row-between xs muted" style={{ marginTop: 6 }}>
          <span>
            <ProviderTag provider={s.provider} size={14} />
          </span>
          <span>Checked {timeAgo(s.lastChecked)}</span>
        </div>
      </div>
    </div>
  );
}

export default function ServiceHealth() {
  const toast = useToast();
  const [category, setCategory] = useState('all');
  const { data, error, loading, refreshing, reload, lastUpdated } = useFetch(() => cloudService.serviceHealth(), [], { refreshInterval: 10_000 });

  const services = useMemo(
    () =>
      (data?.services ?? [])
        .filter((s) => category === 'all' || s.category === category)
        .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name)),
    [data, category],
  );

  const s = data?.summary;
  const exportCsv = () => systemService.exportReport('service-health').catch((e: Error) => toast.error('Export failed', e.message));

  return (
    <>
      <PageHeader
        eyebrow="Monitoring"
        title="Service Health"
        subtitle="Health checks for cloud services, platform components and business applications."
        actions={
          <>
            <RefreshControl lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} autoRefreshSeconds={10} />
            <button className="btn btn-sm" onClick={exportCsv}>
              <Download size={14} /> Export CSV
            </button>
          </>
        }
      />
      {error && !data ? (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <>
          <div className="kpi-grid cols-4">
            <MetricCard label="Healthy" value={s?.healthy ?? 0} icon={<CheckCircle2 size={16} />} tone="healthy" loading={loading && !data} footnote={s ? `of ${s.total} services` : undefined} />
            <MetricCard label="Warning" value={s?.warning ?? 0} icon={<TriangleAlert size={16} />} tone="warning" loading={loading && !data} />
            <MetricCard label="Critical" value={s?.critical ?? 0} icon={<OctagonAlert size={16} />} tone="critical" loading={loading && !data} />
            <MetricCard label="Unknown" value={s?.unknown ?? 0} icon={<CircleHelp size={16} />} loading={loading && !data} />
          </div>
          {s && s.overall !== 'healthy' && (
            <div className={`callout ${s.overall === 'critical' ? 'error' : 'warning'} mb-16`} role="status">
              <OctagonAlert size={16} />
              <div>
                <b>{s.critical > 0 ? `${s.critical} service${s.critical > 1 ? 's are' : ' is'} down` : 'Degraded performance'}</b> —{' '}
                {services.filter((x) => x.status !== 'healthy').map((x) => x.name).join(', ')}
              </div>
            </div>
          )}
          <div className="row-between wrap mb-16">
            <Segmented label="Category" value={category} onChange={setCategory} options={CATEGORIES} />
            <div className="legend">
              {(['healthy', 'warning', 'critical', 'unknown'] as const).map((k) => (
                <span className="legend-item" key={k}>
                  <span className="swatch" style={{ background: STATUS_META[k].color }} /> {STATUS_META[k].label}
                </span>
              ))}
            </div>
          </div>
          {loading && !data ? (
            <div className="card">
              <CardSkeleton rows={6} />
            </div>
          ) : !services.length ? (
            <div className="card">
              <EmptyState title="No services in this category" />
            </div>
          ) : (
            <div className="service-grid">
              {services.map((svc) => (
                <ServiceTile key={svc._id} s={svc} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
