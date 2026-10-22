import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Cpu, MemoryStick, PauseCircle, PlayCircle, Server } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import Card from '../components/Card';
import MetricChart from '../components/MetricChart';
import ChartTooltip from '../components/ChartTooltip';
import TimeRangePicker, { Segmented } from '../components/TimeRangePicker';
import RefreshControl from '../components/RefreshControl';
import StatusBadge from '../components/StatusBadge';
import { ProviderTag } from '../components/ProviderIcon';
import UtilBar from '../components/UtilBar';
import EmptyState, { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { useFetch } from '../hooks/useFetch';
import { usePreferences } from '../hooks/usePreferences';
import { dashboardService } from '../services/dashboardService';
import type { TimeRange } from '../types/common';
import { PROVIDERS, PROVIDER_FILTER, RESOURCE_TYPES, SERIES, STATUS_META } from '../utils/constants';
import { formatCurrency } from '../utils/formatters';

export default function Compute() {
  const { environment } = usePreferences();
  const navigate = useNavigate();
  const [range, setRange] = useState<TimeRange>('24h');
  const [provider, setProvider] = useState('all');
  const { data, error, loading, refreshing, reload, lastUpdated } = useFetch(
    () => dashboardService.compute(range, environment, provider),
    [range, environment, provider],
    { refreshInterval: 30_000 },
  );
  const t = data?.totals;

  return (
    <>
      <PageHeader
        eyebrow="Monitoring"
        title="Compute"
        subtitle="Virtual machines, Kubernetes clusters, containers and serverless functions."
        actions={<RefreshControl lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} autoRefreshSeconds={30} />}
      />
      <div className="row wrap mb-16" style={{ gap: 10 }}>
        <Segmented label="Provider" value={provider} onChange={setProvider} options={PROVIDER_FILTER} />
        <TimeRangePicker value={range} onChange={setRange} />
      </div>

      {error && !data ? (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <MetricCard label="Compute instances" value={t?.instances ?? 0} icon={<Server size={16} />} tone="primary" loading={loading && !data} />
            <MetricCard label="Running" value={t?.running ?? 0} icon={<PlayCircle size={16} />} tone="healthy" loading={loading && !data} />
            <MetricCard label="Stopped" value={t?.stopped ?? 0} icon={<PauseCircle size={16} />} loading={loading && !data} />
            <MetricCard label="Avg CPU" value={(t?.avgCpu ?? 0).toFixed(1)} unit="%" icon={<Cpu size={16} />} loading={loading && !data} footnote="Running instances" />
            <MetricCard label="Avg memory" value={(t?.avgMemory ?? 0).toFixed(1)} unit="%" icon={<MemoryStick size={16} />} loading={loading && !data} footnote="Running instances" />
            <MetricCard
              label="Instance health"
              value={t ? `${t.healthy}` : 0}
              unit={t ? ` / ${t.instances}` : undefined}
              icon={<Activity size={16} />}
              tone={t && t.critical > 0 ? 'critical' : 'healthy'}
              loading={loading && !data}
              footnote={t ? `${t.warning} warning · ${t.critical} critical` : undefined}
            />
          </div>

          <div className="grid grid-2 mb-16">
            <Card title="CPU Usage" subtitle="Fleet average across compute resources">
              {!data ? <CardSkeleton chart /> : <MetricChart data={data.timeline} range={range} series={[{ key: 'cpu', label: 'Avg CPU', color: SERIES.s1 }]} yDomain={[0, 100]} yFormatter={(v) => `${v}%`} valueFormatter={(v) => `${v.toFixed(1)}%`} height={230} />}
            </Card>
            <Card title="Memory Usage" subtitle="Fleet average across compute resources">
              {!data ? <CardSkeleton chart /> : <MetricChart data={data.timeline} range={range} series={[{ key: 'memory', label: 'Avg memory', color: SERIES.s2 }]} yDomain={[0, 100]} yFormatter={(v) => `${v}%`} valueFormatter={(v) => `${v.toFixed(1)}%`} height={230} />}
            </Card>
            <Card title="Instance Status" subtitle="Health of all compute resources">
              {!data ? (
                <CardSkeleton chart />
              ) : (
                <div style={{ width: '100%', height: 230 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.statusDistribution.map((s) => ({ ...s, label: STATUS_META[s.status].label }))} margin={{ top: 22, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                      <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip series={[{ key: 'count', label: 'Instances', color: 'var(--text-3)' }]} />} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={false}>
                        {data.statusDistribution.map((s) => (
                          <Cell key={s.status} fill={STATUS_META[s.status].color} />
                        ))}
                        <LabelList dataKey="count" position="top" style={{ fill: 'var(--text-2)', fontSize: 12, fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <Card title="Provider Distribution" subtitle="Running vs total instances per provider">
              {!data ? (
                <CardSkeleton chart />
              ) : !data.byProvider.length ? (
                <EmptyState compact title="No compute resources" />
              ) : (
                <div className="stack" style={{ gap: 16, paddingTop: 6 }}>
                  {data.byProvider.map((p) => (
                    <div key={p.provider}>
                      <div className="row-between small" style={{ marginBottom: 6 }}>
                        <ProviderTag provider={p.provider} />
                        <span className="tabular">
                          <b>{p.running}</b> running of {p.total} · avg CPU {p.avgCpu.toFixed(0)}%
                        </span>
                      </div>
                      <div className="util-bar" style={{ height: 10 }}>
                        <div className="util-fill" style={{ width: `${(p.total / Math.max(...data.byProvider.map((x) => x.total))) * 100}%`, background: PROVIDERS[p.provider].color }} />
                      </div>
                    </div>
                  ))}
                  <div className="divider" style={{ margin: '4px 0' }} />
                  <div className="row wrap" style={{ gap: 8 }}>
                    {data.byType.map((t) => (
                      <span key={t.type} className="badge outline">
                        {RESOURCE_TYPES[t.type].label}: {t.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          <Card title="Top Resource Consumers" subtitle="Running compute ranked by CPU and memory" flush>
            {!data ? (
              <CardSkeleton rows={6} />
            ) : !data.topConsumers.length ? (
              <EmptyState compact title="No running compute" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Resource</th>
                      <th>Provider</th>
                      <th>Region</th>
                      <th>Status</th>
                      <th>CPU</th>
                      <th>Memory</th>
                      <th className="num">Cost / mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topConsumers.map((r) => (
                      <tr key={r._id} className="clickable" onClick={() => navigate(`/resources/${r._id}`)}>
                        <td>
                          <div className="cell-title">{r.name}</div>
                          <div className="cell-sub">
                            {RESOURCE_TYPES[r.type].label} · {r.sku}
                          </div>
                        </td>
                        <td>
                          <ProviderTag provider={r.provider} />
                        </td>
                        <td className="mono">{r.region}</td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td>
                          <UtilBar value={r.cpu} />
                        </td>
                        <td>
                          <UtilBar value={r.memory} warning={80} critical={92} />
                        </td>
                        <td className="num">{formatCurrency(r.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data && data.underutilized.length > 0 && (
              <div className="card-footer">
                <span>
                  {data.underutilized.length} instance{data.underutilized.length > 1 ? 's' : ''} below 10% CPU:{' '}
                  {data.underutilized.map((u) => u.name).join(', ')}
                </span>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
