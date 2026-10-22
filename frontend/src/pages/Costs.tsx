import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, CalendarDays, DollarSign, Download, History, Receipt, TrendingUp } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import Card from '../components/Card';
import { DailySpendChart, MonthlyCostChart, ProviderCostBar, ServiceDonut, BreakdownBars } from '../components/CostChart';
import RefreshControl from '../components/RefreshControl';
import { SeverityPill } from '../components/StatusBadge';
import { ProviderTag } from '../components/ProviderIcon';
import EmptyState, { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { RoleGate } from '../components/ProtectedRoute';
import { useFetch } from '../hooks/useFetch';
import { useToast } from '../hooks/usePreferences';
import { costService } from '../services/costService';
import { systemService } from '../services/dashboardService';
import { formatChange, formatCurrency } from '../utils/formatters';

function CostsContent() {
  const toast = useToast();
  const summary = useFetch(() => costService.summary(), [], { refreshInterval: 60_000 });
  const byProvider = useFetch(() => costService.byProvider(30), []);
  const byService = useFetch(() => costService.byService(30), []);
  const byRegion = useFetch(() => costService.byRegion(30), []);
  const anomalies = useFetch(() => costService.anomalies(20), []);
  const s = summary.data;
  const busy = summary.loading && !s;

  const reloadAll = () => Promise.all([summary.reload(), byProvider.reload(), byService.reload(), byRegion.reload(), anomalies.reload()]);
  const exportCsv = () => systemService.exportReport('costs', { days: 90 }).catch((e: Error) => toast.error('Export failed', e.message));

  return (
    <>
      <PageHeader
        eyebrow="FinOps"
        title="Cost Overview"
        subtitle="Spend, forecast and breakdowns across every connected cloud account."
        actions={
          <>
            <RefreshControl lastUpdated={summary.lastUpdated} refreshing={summary.refreshing} onRefresh={reloadAll} autoRefreshSeconds={60} />
            <button className="btn btn-sm" onClick={exportCsv}>
              <Download size={14} /> Export CSV
            </button>
          </>
        }
      />

      {summary.error && !s ? (
        <div className="card mb-16">
          <ErrorState message={summary.error} onRetry={summary.reload} />
        </div>
      ) : (
        <div className="kpi-grid">
          <MetricCard label="Current month (MTD)" value={formatCurrency(s?.currentMonth)} icon={<DollarSign size={16} />} tone="primary" loading={busy} change={s?.monthToDateChangePct} footnote={s ? `day ${s.daysElapsed} of ${s.daysInMonth}` : undefined} />
          <MetricCard label="Previous month" value={formatCurrency(s?.previousMonth)} icon={<History size={16} />} loading={busy} footnote="Full calendar month" />
          <MetricCard label="Forecast (month end)" value={formatCurrency(s?.forecast)} icon={<TrendingUp size={16} />} tone={s && s.forecastChangePct > 10 ? 'warning' : 'default'} loading={busy} change={s?.forecastChangePct} footnote="vs previous month" />
          <MetricCard label="Daily cost" value={formatCurrency(s?.dailyCost)} icon={<CalendarDays size={16} />} loading={busy} footnote={s ? `7-day avg ${formatCurrency(s.dailyAverage)}` : undefined} />
          <MetricCard label="Monthly cost (30d)" value={formatCurrency(s?.last30Days)} icon={<Receipt size={16} />} loading={busy} change={s?.last30DaysChangePct} footnote="vs prior 30 days" />
          <MetricCard label="Open anomalies" value={anomalies.data?.length ?? 0} icon={<CalendarClock size={16} />} tone={(anomalies.data?.length ?? 0) > 0 ? 'warning' : 'healthy'} loading={anomalies.loading && !anomalies.data} footnote="Detected in the last 14 days" />
        </div>
      )}

      <div className="grid grid-2 mb-16">
        <Card title="Monthly Cost" subtitle="Last 6 months · current month is month-to-date">
          {!s ? <CardSkeleton chart /> : <MonthlyCostChart data={s.monthly} height={250} />}
        </Card>
        <Card title="Cost by Provider" subtitle="Last 30 days">
          {!byProvider.data ? <CardSkeleton chart /> : <ProviderCostBar data={byProvider.data} height={272} />}
        </Card>
        <Card title="Cost by Service" subtitle="Top services · last 30 days">
          {!byService.data ? <CardSkeleton chart /> : <ServiceDonut data={byService.data} height={230} />}
        </Card>
        <Card title="Daily Spending" subtitle="Stacked by provider · last 30 days">
          {!s ? <CardSkeleton chart /> : <DailySpendChart data={s.daily} height={250} />}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Cost by Region" subtitle="Last 30 days" actions={<Link to="/costs/analysis" className="small row">Analysis <ArrowRight size={13} /></Link>}>
          {!byRegion.data ? <CardSkeleton rows={6} /> : <BreakdownBars data={byRegion.data} />}
        </Card>
        <Card title="Cost Anomalies" subtitle="Unusual spend detected automatically" flush actions={<Link to="/costs/anomalies" className="small row">View all <ArrowRight size={13} /></Link>}>
          {!anomalies.data ? (
            <CardSkeleton rows={4} />
          ) : !anomalies.data.length ? (
            <EmptyState compact title="No anomalies detected" description="Spend is tracking within expected ranges." />
          ) : (
            <div className="list">
              {anomalies.data.slice(0, 5).map((a) => (
                <div className="list-item" key={a.id}>
                  <SeverityPill severity={a.severity} />
                  <div className="list-item-main">
                    <div className="list-item-title">{a.message}</div>
                    <div className="list-item-sub row" style={{ gap: 8 }}>
                      <ProviderTag provider={a.provider} size={14} /> {a.service} · {a.date}
                    </div>
                  </div>
                  <div className="list-item-meta">
                    <div className="bold text-critical tabular">{formatChange(a.differencePct)}</div>
                    <div>+{formatCurrency(a.difference)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export default function Costs() {
  return (
    <RoleGate roles={['admin', 'operator']}>
      <CostsContent />
    </RoleGate>
  );
}
