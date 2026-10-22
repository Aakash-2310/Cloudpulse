import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Copy } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import MetricChart from '../components/MetricChart';
import TimeRangePicker from '../components/TimeRangePicker';
import StatusBadge, { SeverityPill } from '../components/StatusBadge';
import { ProviderTag } from '../components/ProviderIcon';
import UtilBar from '../components/UtilBar';
import EmptyState, { ErrorState } from '../components/EmptyState';
import { CardSkeleton, PageLoader } from '../components/LoadingSpinner';
import RefreshControl from '../components/RefreshControl';
import { useFetch } from '../hooks/useFetch';
import { useMetrics } from '../hooks/useMetrics';
import { useToast } from '../hooks/usePreferences';
import { resourceService } from '../services/resourceService';
import type { TimeRange } from '../types/common';
import type { MetricStat } from '../types/metrics';
import { RESOURCE_TYPES, SERIES } from '../utils/constants';
import { formatCompact, formatCurrency, formatDate, formatMbps, formatStorage, timeAgo } from '../utils/formatters';

function StatLine({ stat, unit = '%', format }: { stat?: MetricStat; unit?: string; format?: (v: number) => string }) {
  if (!stat) return null;
  const f = format ?? ((v: number) => `${v.toFixed(1)}${unit}`);
  return (
    <span className="xs muted tabular">
      avg {f(stat.avg)} · max {f(stat.max)}
    </span>
  );
}

export default function ResourceDetails() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [range, setRange] = useState<TimeRange>('24h');
  const detail = useFetch(() => resourceService.get(id!), [id], { refreshInterval: 30_000 });
  const metrics = useMetrics(id, range);

  if (detail.loading && !detail.data) return <PageLoader label="Loading resource…" />;
  if (detail.error && !detail.data) {
    return (
      <div className="card">
        <ErrorState message={detail.error} onRetry={detail.reload} />
      </div>
    );
  }
  if (!detail.data) return null;
  const { resource: r, alerts } = detail.data;
  const account = typeof r.cloudAccountId === 'object' ? r.cloudAccountId : null;
  const storagePct = r.storage?.totalGB ? (r.storage.usedGB / r.storage.totalGB) * 100 : 0;
  const s = metrics.data?.summary;
  const points = metrics.data?.points ?? [];

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(r.resourceId);
      toast.success('Resource ID copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const chart = (title: string, body: ReactNode, sub?: ReactNode) => (
    <Card title={title} subtitle={sub}>
      {metrics.loading && !metrics.data ? <CardSkeleton chart /> : metrics.error && !metrics.data ? <ErrorState compact message={metrics.error} onRetry={metrics.reload} /> : body}
    </Card>
  );

  return (
    <>
      <PageHeader
        breadcrumbs={
          <>
            <Link to="/resources">Resources</Link>
            <ChevronRight size={12} />
            <span>{r.name}</span>
          </>
        }
        title={r.name}
        subtitle={
          <span className="row wrap" style={{ gap: 10 }}>
            <StatusBadge status={r.status} />
            <StatusBadge status={r.state} />
            <span>
              {RESOURCE_TYPES[r.type]?.label} · {r.service} · {r.region}
            </span>
          </span>
        }
        actions={
          <>
            <RefreshControl lastUpdated={detail.lastUpdated} refreshing={detail.refreshing || metrics.refreshing} onRefresh={() => Promise.all([detail.reload(), metrics.reload()])} autoRefreshSeconds={30} />
            <TimeRangePicker value={range} onChange={setRange} />
          </>
        }
      />

      <div className="grid grid-main-side mb-16">
        <Card title="Resource Information">
          <div className="kv-grid">
            <div>
              <div className="kv-label">Resource name</div>
              <div className="kv-value">{r.name}</div>
            </div>
            <div style={{ gridColumn: 'span 3' }}>
              <div className="kv-label">Resource ID</div>
              <div className="kv-value row" style={{ gap: 6 }}>
                <code className="truncate" title={r.resourceId}>
                  {r.resourceId}
                </code>
                <button className="icon-btn ghost sm" onClick={copyId} aria-label="Copy resource ID">
                  <Copy size={13} />
                </button>
              </div>
            </div>
            <div>
              <div className="kv-label">Provider</div>
              <div className="kv-value">
                <ProviderTag provider={r.provider} />
              </div>
            </div>
            <div>
              <div className="kv-label">Account</div>
              <div className="kv-value">{account?.accountName ?? '—'}</div>
            </div>
            <div>
              <div className="kv-label">Region</div>
              <div className="kv-value mono">{r.region}</div>
            </div>
            <div>
              <div className="kv-label">Environment</div>
              <div className="kv-value" style={{ textTransform: 'capitalize' }}>
                {r.environment}
              </div>
            </div>
            <div>
              <div className="kv-label">Resource type</div>
              <div className="kv-value">{RESOURCE_TYPES[r.type]?.label}</div>
            </div>
            <div>
              <div className="kv-label">SKU / size</div>
              <div className="kv-value">{r.sku ?? '—'}</div>
            </div>
            <div>
              <div className="kv-label">Created</div>
              <div className="kv-value">{formatDate(r.createdAt)}</div>
            </div>
            <div>
              <div className="kv-label">Last reported</div>
              <div className="kv-value">{timeAgo(r.lastSeenAt)}</div>
            </div>
          </div>
          {r.tags && Object.keys(r.tags).length > 0 && (
            <>
              <div className="divider" />
              <div className="kv-label">Tags</div>
              <div className="tag-list">
                {Object.entries(r.tags).map(([k, v]) => (
                  <span key={k} className="tag">
                    {k}={v}
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card title="Current Utilization">
          <div className="stack" style={{ gap: 14 }}>
            <div>
              <div className="row-between small" style={{ marginBottom: 4 }}>
                <span className="text-2">CPU</span>
              </div>
              <UtilBar value={r.cpu} label="CPU" />
            </div>
            <div>
              <div className="row-between small" style={{ marginBottom: 4 }}>
                <span className="text-2">Memory</span>
              </div>
              <UtilBar value={r.memory} warning={80} critical={92} label="Memory" />
            </div>
            {r.storage?.totalGB > 0 && (
              <div>
                <div className="row-between small" style={{ marginBottom: 4 }}>
                  <span className="text-2">Storage</span>
                  <span className="muted tabular">
                    {formatStorage(r.storage.usedGB)} / {formatStorage(r.storage.totalGB)}
                  </span>
                </div>
                <UtilBar value={storagePct} warning={85} critical={95} label="Storage" />
              </div>
            )}
            <div className="divider" style={{ margin: '4px 0' }} />
            <div className="row-between">
              <span className="text-2 small">Network throughput</span>
              <span className="bold tabular">{formatMbps(r.network)}</span>
            </div>
            <div className="row-between">
              <span className="text-2 small">Provisioned bandwidth</span>
              <span className="bold tabular">{formatMbps(r.networkCapacity)}</span>
            </div>
            <div className="row-between">
              <span className="text-2 small">Monthly cost</span>
              <span className="bold tabular">{formatCurrency(r.cost)}</span>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-2 mb-16">
        {chart(
          'CPU Utilization',
          <MetricChart data={points} range={range} series={[{ key: 'cpu', label: 'CPU', color: SERIES.s1 }]} yDomain={[0, 100]} yFormatter={(v) => `${v}%`} valueFormatter={(v) => `${v.toFixed(1)}%`} threshold={{ value: 80, label: 'Alert 80%' }} height={220} />,
          <StatLine stat={s?.cpu} />,
        )}
        {chart(
          'Memory Utilization',
          <MetricChart data={points} range={range} series={[{ key: 'memory', label: 'Memory', color: SERIES.s2 }]} yDomain={[0, 100]} yFormatter={(v) => `${v}%`} valueFormatter={(v) => `${v.toFixed(1)}%`} threshold={{ value: 85, label: 'Alert 85%' }} height={220} />,
          <StatLine stat={s?.memory} />,
        )}
        {chart(
          'Network Traffic',
          <MetricChart
            data={points}
            range={range}
            type="line"
            series={[
              { key: 'networkIn', label: 'Inbound', color: SERIES.s1 },
              { key: 'networkOut', label: 'Outbound', color: SERIES.s3, dashed: true },
            ]}
            yFormatter={(v) => `${formatCompact(v)}`}
            valueFormatter={(v) => formatMbps(v)}
            height={220}
          />,
          <StatLine stat={s?.networkIn} format={formatMbps} />,
        )}
        {chart(
          'Disk Usage',
          <MetricChart data={points} range={range} series={[{ key: 'diskUsage', label: 'Disk used', color: SERIES.s6 }]} yDomain={[0, 100]} yFormatter={(v) => `${v}%`} valueFormatter={(v) => `${v.toFixed(1)}%`} threshold={{ value: 90, label: 'Alert 90%' }} height={220} />,
          <StatLine stat={s?.diskUsage} />,
        )}
        {chart(
          'Request Count',
          <MetricChart data={points} range={range} series={[{ key: 'requestCount', label: 'Requests / min', color: SERIES.s1 }]} yFormatter={(v) => formatCompact(v)} valueFormatter={(v) => `${Math.round(v).toLocaleString()} /min`} height={220} />,
          <StatLine stat={s?.requestCount} format={(v) => `${formatCompact(v)}/min`} />,
        )}
        {chart(
          'Error Rate',
          <MetricChart data={points} range={range} type="line" series={[{ key: 'errorRate', label: 'Error rate', color: 'var(--status-critical)' }]} yFormatter={(v) => `${v}%`} valueFormatter={(v) => `${v.toFixed(2)}%`} height={220} />,
          <StatLine stat={s?.errorRate} format={(v) => `${v.toFixed(2)}%`} />,
        )}
      </div>

      <Card title="Alerts for this resource" flush>
        {!alerts.length ? (
          <EmptyState compact title="No alerts recorded" description="This resource has not triggered any alert rules." />
        ) : (
          <div className="list">
            {alerts.map((a) => (
              <Link key={a._id} to={`/alerts?focus=${a._id}`} className="list-item clickable" style={{ color: 'inherit', textDecoration: 'none' }}>
                <SeverityPill severity={a.severity} />
                <div className="list-item-main">
                  <div className="list-item-title">{a.title}</div>
                  <div className="list-item-sub">{a.description}</div>
                </div>
                <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                  <StatusBadge status={a.status} />
                  <span className="xs muted">{timeAgo(a.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
