import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Gauge, Waypoints } from 'lucide-react';
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
import { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { useFetch } from '../hooks/useFetch';
import { usePreferences } from '../hooks/usePreferences';
import { dashboardService } from '../services/dashboardService';
import type { TimeRange } from '../types/common';
import { PROVIDERS, PROVIDER_FILTER, RESOURCE_TYPES, SERIES } from '../utils/constants';
import { formatCompact, formatMbps } from '../utils/formatters';

export default function Network() {
  const { environment } = usePreferences();
  const navigate = useNavigate();
  const [range, setRange] = useState<TimeRange>('24h');
  const [provider, setProvider] = useState('all');
  const { data, error, loading, refreshing, reload, lastUpdated } = useFetch(
    () => dashboardService.network(range, environment, provider),
    [range, environment, provider],
    { refreshInterval: 30_000 },
  );
  const t = data?.totals;
  const busy = loading && !data;

  return (
    <>
      <PageHeader
        eyebrow="Monitoring"
        title="Network"
        subtitle="Traffic, bandwidth, request volume and error rates across load balancers, VPCs and workloads."
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
          <div className="kpi-grid cols-5">
            <MetricCard label="Incoming traffic" value={formatMbps(t?.incomingMbps)} icon={<ArrowDownToLine size={16} />} tone="primary" loading={busy} footnote={t ? `avg ${formatMbps(t.avgIncomingMbps)}` : undefined} />
            <MetricCard label="Outgoing traffic" value={formatMbps(t?.outgoingMbps)} icon={<ArrowUpFromLine size={16} />} tone="primary" loading={busy} footnote={t ? `avg ${formatMbps(t.avgOutgoingMbps)}` : undefined} />
            <MetricCard label="Bandwidth utilization" value={(t?.bandwidthUtilization ?? 0).toFixed(1)} unit="%" icon={<Gauge size={16} />} tone={(t?.bandwidthUtilization ?? 0) > 80 ? 'warning' : 'healthy'} loading={busy} footnote={t ? `of ${t.totalCapacityGbps} Gbps provisioned` : undefined} />
            <MetricCard label="Network errors" value={formatCompact(t?.errorsPerMin)} unit="/min" icon={<AlertTriangle size={16} />} tone={(t?.errorRate ?? 0) > 2 ? 'critical' : 'warning'} loading={busy} footnote={t ? `${t.errorRate.toFixed(2)}% of requests` : undefined} />
            <MetricCard label="Request count" value={formatCompact(t?.requestsPerMin)} unit="/min" icon={<Waypoints size={16} />} loading={busy} />
          </div>

          <div className="grid grid-2 mb-16">
            <Card title="Network Traffic" subtitle="Aggregate inbound and outbound throughput">
              {!data ? (
                <CardSkeleton chart />
              ) : (
                <MetricChart
                  data={data.timeline}
                  range={range}
                  type="line"
                  series={[
                    { key: 'networkIn', label: 'Inbound', color: SERIES.s1 },
                    { key: 'networkOut', label: 'Outbound', color: SERIES.s3, dashed: true },
                  ]}
                  yFormatter={(v) => formatCompact(v)}
                  valueFormatter={(v) => formatMbps(v)}
                  height={240}
                />
              )}
            </Card>
            <Card title="Bandwidth Usage" subtitle="Throughput as a share of provisioned bandwidth">
              {!data ? (
                <CardSkeleton chart />
              ) : (
                <MetricChart data={data.timeline} range={range} series={[{ key: 'bandwidth', label: 'Bandwidth used', color: SERIES.s6 }]} yDomain={[0, 'auto']} yFormatter={(v) => `${v}%`} valueFormatter={(v) => `${v.toFixed(1)}%`} threshold={{ value: 80, label: '80%' }} height={262} />
              )}
            </Card>
            <Card title="Network Errors" subtitle="Failed requests per minute">
              {!data ? (
                <CardSkeleton chart />
              ) : (
                <MetricChart data={data.timeline} range={range} type="line" series={[{ key: 'errors', label: 'Errors / min', color: 'var(--status-critical)' }]} yFormatter={(v) => formatCompact(v)} valueFormatter={(v) => `${v.toFixed(1)} /min`} height={240} />
              )}
            </Card>
            <Card title="Traffic by Provider" subtitle="Current throughput">
              {!data ? (
                <CardSkeleton chart />
              ) : (
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.byProvider} margin={{ top: 22, right: 8, left: -4, bottom: 0 }} barCategoryGap="30%">
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => formatCompact(v)} width={52} />
                      <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip series={[{ key: 'throughputMbps', label: 'Throughput', color: 'var(--text-3)' }]} formatValue={(v) => formatMbps(v)} />} />
                      <Bar dataKey="throughputMbps" radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={false}>
                        {data.byProvider.map((p) => (
                          <Cell key={p.provider} fill={PROVIDERS[p.provider].color} />
                        ))}
                        <LabelList dataKey="throughputMbps" position="top" formatter={(v: unknown) => formatMbps(Number(v))} style={{ fill: 'var(--text-2)', fontSize: 12, fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <Card title="Top Talkers" subtitle="Resources with the highest current throughput" flush>
            {!data ? (
              <CardSkeleton rows={6} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Resource</th>
                      <th>Provider</th>
                      <th>Region</th>
                      <th className="num">Throughput</th>
                      <th>Bandwidth used</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topTalkers.map((r) => (
                      <tr key={r._id} className="clickable" onClick={() => navigate(`/resources/${r._id}`)}>
                        <td>
                          <div className="cell-title">{r.name}</div>
                          <div className="cell-sub">{RESOURCE_TYPES[r.type].label}</div>
                        </td>
                        <td>
                          <ProviderTag provider={r.provider} />
                        </td>
                        <td className="mono">{r.region}</td>
                        <td className="num">{formatMbps(r.throughputMbps)}</td>
                        <td>
                          <UtilBar value={r.utilization} warning={70} critical={85} />
                        </td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
