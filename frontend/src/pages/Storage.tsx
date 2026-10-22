import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, Database, DollarSign, HardDrive, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import Card from '../components/Card';
import MetricChart from '../components/MetricChart';
import ChartTooltip, { ChartLegend } from '../components/ChartTooltip';
import { DailySpendChart } from '../components/CostChart';
import { Segmented } from '../components/TimeRangePicker';
import RefreshControl from '../components/RefreshControl';
import StatusBadge from '../components/StatusBadge';
import { ProviderTag } from '../components/ProviderIcon';
import UtilBar from '../components/UtilBar';
import { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../hooks/useAuth';
import { usePreferences } from '../hooks/usePreferences';
import { dashboardService } from '../services/dashboardService';
import { PROVIDERS, PROVIDER_FILTER, RESOURCE_TYPES, SERIES } from '../utils/constants';
import { formatChange, formatCurrency, formatShortDate, formatStorage } from '../utils/formatters';

export default function Storage() {
  const { environment } = usePreferences();
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [provider, setProvider] = useState('all');
  const { data, error, loading, refreshing, reload, lastUpdated } = useFetch(() => dashboardService.storage(environment, provider), [environment, provider], {
    refreshInterval: 30_000,
  });
  const t = data?.totals;
  const busy = loading && !data;

  return (
    <>
      <PageHeader
        eyebrow="Monitoring"
        title="Storage"
        subtitle="Object storage, database volumes and instance disks across all providers."
        actions={<RefreshControl lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} autoRefreshSeconds={30} />}
      />
      <div className="row wrap mb-16">
        <Segmented label="Provider" value={provider} onChange={setProvider} options={PROVIDER_FILTER} />
      </div>
      {error && !data ? (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : (
        <>
          <div className="kpi-grid cols-5">
            <MetricCard label="Total storage" value={t ? t.totalTB.toFixed(1) : '0'} unit="TB" icon={<HardDrive size={16} />} tone="primary" loading={busy} />
            <MetricCard label="Used storage" value={t ? t.usedTB.toFixed(1) : '0'} unit="TB" icon={<Database size={16} />} loading={busy} footnote={t ? `${t.utilization}% utilized` : undefined} />
            <MetricCard label="Free storage" value={t ? t.freeTB.toFixed(1) : '0'} unit="TB" icon={<Archive size={16} />} tone="healthy" loading={busy} footnote={t ? `${t.nearCapacity} volume(s) near capacity` : undefined} />
            <MetricCard label="Storage growth (30d)" value={t ? `+${t.growth30dTB.toFixed(2)}` : '0'} unit="TB" icon={<TrendingUp size={16} />} loading={busy} change={t?.growth30dPct} footnote="vs 30 days ago" />
            <MetricCard label="Storage cost (MTD)" value={hasRole('admin', 'operator') ? formatCurrency(t?.monthToDateCost) : '—'} icon={<DollarSign size={16} />} loading={busy} change={hasRole('admin', 'operator') ? t?.costChangePct : undefined} footnote="vs same period last month" />
          </div>

          <div className="grid grid-2 mb-16">
            <Card title="Storage Utilization" subtitle="Used vs provisioned capacity by provider">
              {!data ? (
                <CardSkeleton chart />
              ) : (
                <>
                  <ChartLegend
                    series={[
                      { key: 'usedTB', label: 'Used', color: SERIES.s1 },
                      { key: 'freeTB', label: 'Free', color: 'var(--surface-3)' },
                    ]}
                  />
                  <div style={{ width: '100%', height: 220, marginTop: 10 }}>
                    <ResponsiveContainer>
                      <BarChart data={data.byProvider.map((p) => ({ ...p, freeTB: +(p.totalTB - p.usedTB).toFixed(2) }))} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap="30%">
                        <CartesianGrid horizontal={false} />
                        <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `${v} TB`} />
                        <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={56} />
                        <Tooltip
                          cursor={{ fill: 'var(--surface-2)' }}
                          content={
                            <ChartTooltip
                              series={[
                                { key: 'usedTB', label: 'Used', color: SERIES.s1 },
                                { key: 'freeTB', label: 'Free', color: 'var(--surface-3)' },
                              ]}
                              formatValue={(v) => `${v.toFixed(2)} TB`}
                              footer={(p) => (
                                <div className="chart-tooltip-row">
                                  <span>Utilization</span>
                                  <span className="val">{String(p.utilization)}%</span>
                                </div>
                              )}
                            />
                          }
                        />
                        <Bar dataKey="usedTB" stackId="s" fill={SERIES.s1} isAnimationActive={false} radius={[4, 0, 0, 4]} />
                        <Bar dataKey="freeTB" stackId="s" fill="var(--surface-3)" isAnimationActive={false} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </Card>
            <Card title="Storage Growth" subtitle="Used capacity over the last 30 days">
              {!data ? (
                <CardSkeleton chart />
              ) : (
                <MetricChart
                  data={data.growth}
                  xKey="date"
                  series={[{ key: 'usedTB', label: 'Used (TB)', color: SERIES.s1 }]}
                  xFormatter={formatShortDate}
                  yDomain={['dataMin', 'dataMax']}
                  yFormatter={(v) => `${v.toFixed(0)} TB`}
                  valueFormatter={(v) => `${v.toFixed(2)} TB`}
                  height={250}
                />
              )}
            </Card>
            <Card title="Storage by Provider" subtitle="Provisioned capacity">
              {!data ? (
                <CardSkeleton chart />
              ) : (
                <div style={{ width: '100%', height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.byProvider} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barCategoryGap="30%">
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${v} TB`} width={60} />
                      <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<ChartTooltip series={[{ key: 'totalTB', label: 'Provisioned', color: 'var(--text-3)' }]} formatValue={(v) => `${v.toFixed(1)} TB`} />} />
                      <Bar dataKey="totalTB" radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={false}>
                        {data.byProvider.map((p) => (
                          <Cell key={p.provider} fill={PROVIDERS[p.provider].color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <Card title="Storage Cost" subtitle="Daily spend on S3, Blob Storage and Cloud Storage">
              {!hasRole('admin', 'operator') ? (
                <div className="state compact">
                  <div className="state-text">Cost data is available to administrators and operators.</div>
                </div>
              ) : !data ? (
                <CardSkeleton chart />
              ) : (
                <DailySpendChart data={data.costTrend} height={230} />
              )}
            </Card>
          </div>

          <Card title="Volumes & Buckets" subtitle={t ? `${formatStorage(t.usedTB * 1024)} used · growth ${formatChange(t.growth30dPct)} over 30 days` : undefined} flush>
            {!data ? (
              <CardSkeleton rows={6} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Provider</th>
                      <th>Type</th>
                      <th>Region</th>
                      <th className="num">Used</th>
                      <th className="num">Capacity</th>
                      <th>Utilization</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.volumes.map((v) => (
                      <tr key={v._id} className="clickable" onClick={() => navigate(`/resources/${v._id}`)}>
                        <td>
                          <div className="cell-title">{v.name}</div>
                          <div className="cell-sub">{v.service}</div>
                        </td>
                        <td>
                          <ProviderTag provider={v.provider} />
                        </td>
                        <td>{RESOURCE_TYPES[v.type].label}</td>
                        <td className="mono">{v.region}</td>
                        <td className="num">{formatStorage(v.usedGB)}</td>
                        <td className="num">{formatStorage(v.totalGB)}</td>
                        <td>
                          <UtilBar value={v.utilization} warning={85} critical={95} />
                        </td>
                        <td>
                          <StatusBadge status={v.status} />
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
