import { useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import ChartTooltip, { ChartLegend } from '../components/ChartTooltip';
import { SeverityPill } from '../components/StatusBadge';
import { ProviderTag } from '../components/ProviderIcon';
import { Segmented } from '../components/TimeRangePicker';
import EmptyState, { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { RoleGate } from '../components/ProtectedRoute';
import RefreshControl from '../components/RefreshControl';
import { useFetch } from '../hooks/useFetch';
import { costService } from '../services/costService';
import { formatChange, formatCompactCurrency, formatCurrency } from '../utils/formatters';

const TYPE_LABEL: Record<string, string> = {
  'week-over-week': 'Week-over-week increase',
  'daily-spike': 'Abnormal daily usage',
  'new-service': 'Unexpected service spend',
  'resource-creation': 'Sudden resource creation',
};

const THRESHOLDS = [
  { value: '10', label: '> 10%' },
  { value: '20', label: '> 20%' },
  { value: '30', label: '> 30%' },
];

function AnomaliesContent() {
  const [threshold, setThreshold] = useState('20');
  const { data, error, loading, reload, refreshing, lastUpdated } = useFetch(() => costService.anomalies(Number(threshold)), [threshold]);

  const chartData = (data ?? []).slice(0, 8).map((a) => ({ name: `${a.service}`, expected: a.expected, actual: a.actual, severity: a.severity }));

  return (
    <>
      <PageHeader
        eyebrow="FinOps"
        title="Cost Anomalies"
        subtitle="Week-over-week increases, abnormal daily usage, unexpected services and sudden resource creation."
        actions={<RefreshControl lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} />}
      />
      <div className="row wrap mb-16" style={{ gap: 10 }}>
        <span className="small muted">Week-over-week threshold</span>
        <Segmented label="Threshold" value={threshold} onChange={setThreshold} options={THRESHOLDS} />
      </div>
      {error && !data ? (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : loading && !data ? (
        <div className="card">
          <CardSkeleton rows={6} />
        </div>
      ) : !data?.length ? (
        <div className="card">
          <EmptyState icon={<CheckCircle2 size={20} />} title="No cost anomalies" description="All provider and service spend is within the expected range." />
        </div>
      ) : (
        <>
          {data.slice(0, 2).map((a) => (
            <div key={a.id} className={`callout ${a.severity === 'critical' ? 'error' : 'warning'} mb-16`}>
              <AlertTriangle size={16} />
              <div>
                <b>Cost anomaly detected</b> — {a.message}
              </div>
            </div>
          ))}
          <Card title="Expected vs actual spend" subtitle="Largest anomalies" className="mb-16">
            <ChartLegend
              series={[
                { key: 'expected', label: 'Expected', color: 'var(--status-unknown)' },
                { key: 'actual', label: 'Actual', color: 'var(--series-2)' },
              ]}
            />
            <div style={{ width: '100%', height: 260, marginTop: 10 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -4, bottom: 0 }} barGap={2} barCategoryGap="24%">
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} tick={{ fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={formatCompactCurrency} width={56} />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-2)' }}
                    content={
                      <ChartTooltip
                        series={[
                          { key: 'expected', label: 'Expected', color: 'var(--status-unknown)' },
                          { key: 'actual', label: 'Actual', color: 'var(--series-2)' },
                        ]}
                        formatValue={(v) => formatCurrency(v)}
                      />
                    }
                  />
                  <Bar dataKey="expected" fill="var(--status-unknown)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                  <Bar dataKey="actual" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="All anomalies" subtitle={`${data.length} detected`} flush>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Date</th>
                    <th>Provider</th>
                    <th>Service</th>
                    <th>Type</th>
                    <th className="num">Expected</th>
                    <th className="num">Actual</th>
                    <th className="num">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((a) => (
                    <tr key={a.id} title={a.message}>
                      <td>
                        <SeverityPill severity={a.severity} />
                      </td>
                      <td>{a.date}</td>
                      <td>
                        <ProviderTag provider={a.provider} size={16} />
                      </td>
                      <td className="cell-title">{a.service}</td>
                      <td className="small">{TYPE_LABEL[a.type]}</td>
                      <td className="num muted">{formatCurrency(a.expected)}</td>
                      <td className="num bold">{formatCurrency(a.actual)}</td>
                      <td className="num text-critical">
                        +{formatCurrency(a.difference)} <span className="xs">({formatChange(a.differencePct)})</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

export default function Anomalies() {
  return (
    <RoleGate roles={['admin', 'operator']}>
      <AnomaliesContent />
    </RoleGate>
  );
}
