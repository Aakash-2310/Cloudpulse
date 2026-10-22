import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, ArrowRight, Boxes, CheckCircle2, Cloud, Download, DollarSign, Gauge, Lightbulb, TrendingUp, Zap } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import MetricCard from '../components/MetricCard';
import Card from '../components/Card';
import MetricChart from '../components/MetricChart';
import { ProviderCostBar } from '../components/CostChart';
import HealthScore from '../components/HealthScore';
import RefreshControl from '../components/RefreshControl';
import TimeRangePicker from '../components/TimeRangePicker';
import StatusBadge, { SeverityPill } from '../components/StatusBadge';
import ProviderIcon from '../components/ProviderIcon';
import EmptyState, { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { IfRole } from '../components/ProtectedRoute';
import { useAuth } from '../hooks/useAuth';
import { usePreferences, useToast } from '../hooks/usePreferences';
import { useFetch } from '../hooks/useFetch';
import { dashboardService, systemService } from '../services/dashboardService';
import type { TimeRange } from '../types/common';
import type { Insight } from '../types/metrics';
import { REFRESH_INTERVAL_MS, SERIES } from '../utils/constants';
import { formatCurrency, formatNumber, greeting, timeAgo } from '../utils/formatters';

const INSIGHT_ICON: Record<Insight['severity'], typeof Lightbulb> = {
  info: Lightbulb,
  warning: AlertTriangle,
  critical: AlertOctagon,
  success: CheckCircle2,
};

export default function Dashboard() {
  const { user } = useAuth();
  const { environment } = usePreferences();
  const toast = useToast();
  const navigate = useNavigate();
  const [range, setRange] = useState<TimeRange>('24h');
  const [exporting, setExporting] = useState(false);

  const summary = useFetch(() => dashboardService.summary(environment), [environment], { refreshInterval: REFRESH_INTERVAL_MS });
  const metrics = useFetch(() => dashboardService.metrics(range, environment), [range, environment], { refreshInterval: REFRESH_INTERVAL_MS });
  const insights = useFetch(() => dashboardService.insights(environment), [environment], { refreshInterval: 60_000 });

  const refreshAll = async () => {
    await Promise.all([summary.reload(), metrics.reload(), insights.reload()]);
  };

  const exportReport = async () => {
    setExporting(true);
    try {
      await systemService.exportReport('summary');
      toast.success('Report exported', 'Executive summary downloaded as JSON.');
    } catch (err) {
      toast.error('Export failed', err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const k = summary.data?.kpis;
  const loadingKpis = summary.loading && !summary.data;

  return (
    <>
      <PageHeader
        eyebrow="Infrastructure overview"
        title={greeting(user?.name)}
        subtitle={
          k
            ? `${formatNumber(k.totalResources)} resources across ${k.cloudProviders} providers and ${k.cloudAccounts} accounts${environment !== 'all' ? ` · ${environment}` : ''}`
            : 'Unified visibility across your entire cloud infrastructure.'
        }
        actions={
          <>
            <RefreshControl lastUpdated={summary.lastUpdated} refreshing={summary.refreshing || metrics.refreshing} onRefresh={refreshAll} autoRefreshSeconds={30} />
            <IfRole roles={['admin', 'operator']}>
              <button className="btn btn-sm" onClick={exportReport} disabled={exporting}>
                <Download size={14} /> {exporting ? 'Exporting…' : 'Export report'}
              </button>
            </IfRole>
          </>
        }
      />

      {summary.error && !summary.data ? (
        <div className="card mb-16">
          <ErrorState message={summary.error} onRetry={summary.reload} />
        </div>
      ) : (
        <div className="kpi-grid">
          <MetricCard label="Cloud Providers" value={k?.cloudProviders ?? 0} icon={<Cloud size={16} />} tone="primary" loading={loadingKpis} footnote={k ? `${k.cloudAccounts} connected accounts` : undefined} onClick={() => navigate('/providers')} />
          <MetricCard label="Resources" value={formatNumber(k?.totalResources)} icon={<Boxes size={16} />} tone="primary" loading={loadingKpis} footnote={k ? `${k.unknown} stopped / unknown` : undefined} onClick={() => navigate('/resources')} />
          <MetricCard label="Healthy" value={formatNumber(k?.healthy)} icon={<CheckCircle2 size={16} />} tone="healthy" loading={loadingKpis} footnote={k && k.totalResources ? `${Math.round((k.healthy / k.totalResources) * 100)}% of fleet` : undefined} onClick={() => navigate('/resources?status=healthy')} />
          <MetricCard label="Warnings" value={formatNumber(k?.warning)} icon={<AlertTriangle size={16} />} tone="warning" loading={loadingKpis} footnote="Approaching thresholds" onClick={() => navigate('/resources?status=warning')} />
          <MetricCard label="Critical" value={formatNumber(k?.critical)} icon={<AlertOctagon size={16} />} tone="critical" loading={loadingKpis} footnote={k ? `${k.criticalAlerts} critical alerts open` : undefined} onClick={() => navigate('/resources?status=critical')} />
          <MetricCard label="Monthly Cost" value={formatCurrency(k?.monthlyCost)} icon={<DollarSign size={16} />} loading={loadingKpis} change={k?.monthlyCostChangePct} footnote="vs prior 30 days" />
        </div>
      )}

      <div className="grid grid-main-side mb-16">
        <Card
          title="Resource Health"
          subtitle="Average CPU and memory utilization across the fleet"
          actions={<TimeRangePicker value={range} onChange={setRange} />}
        >
          {metrics.loading && !metrics.data ? (
            <CardSkeleton chart />
          ) : metrics.error && !metrics.data ? (
            <ErrorState compact message={metrics.error} onRetry={metrics.reload} />
          ) : (
            <MetricChart
              data={metrics.data?.timeline ?? []}
              range={range}
              series={[
                { key: 'cpu', label: 'Avg CPU', color: SERIES.s1 },
                { key: 'memory', label: 'Avg memory', color: SERIES.s2 },
              ]}
              yDomain={[0, 100]}
              yFormatter={(v) => `${v}%`}
              valueFormatter={(v) => `${v.toFixed(1)}%`}
              height={270}
            />
          )}
        </Card>

        <Card title="Infrastructure Health" subtitle="Weighted score across resources, services and alerts" actions={<Gauge size={16} className="muted" />}>
          {summary.data ? <HealthScore data={summary.data.healthScore} /> : <CardSkeleton rows={4} />}
          <div className="divider" />
          <div className="stack" style={{ gap: 10 }}>
            {(summary.data?.providers ?? []).map((p) => {
              const total = p.resources || 1;
              return (
                <div key={p.provider}>
                  <div className="row-between" style={{ marginBottom: 6 }}>
                    <span className="row">
                      <ProviderIcon provider={p.provider} size={22} />
                      <span className="bold">{p.label}</span>
                      <span className="xs muted">{p.resources} resources</span>
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="stackbar" aria-label={`${p.label}: ${p.healthy} healthy, ${p.warning} warning, ${p.critical} critical, ${p.unknown} unknown`}>
                    {p.healthy > 0 && <span style={{ width: `${(p.healthy / total) * 100}%`, background: 'var(--status-healthy)' }} />}
                    {p.warning > 0 && <span style={{ width: `${(p.warning / total) * 100}%`, background: 'var(--status-warning)' }} />}
                    {p.critical > 0 && <span style={{ width: `${(p.critical / total) * 100}%`, background: 'var(--status-critical)' }} />}
                    {p.unknown > 0 && <span style={{ width: `${(p.unknown / total) * 100}%`, background: 'var(--status-unknown)' }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-3 mb-16">
        <Card title="Cloud Cost" subtitle="Spend by provider · last 30 days" actions={<IfRole roles={['admin', 'operator']}><Link to="/costs" className="small row">Details <ArrowRight size={13} /></Link></IfRole>}>
          {metrics.data ? <ProviderCostBar data={metrics.data.costByProvider} height={250} /> : <CardSkeleton chart />}
        </Card>

        <Card title="Provider Health" subtitle="Connection and resource status" flush>
          {!summary.data ? (
            <CardSkeleton rows={3} />
          ) : !summary.data.providers.length ? (
            <EmptyState compact title="No providers connected" action={<Link to="/providers" className="btn btn-sm btn-primary">Connect a provider</Link>} />
          ) : (
            <div className="list">
              {summary.data.providers.map((p) => (
                <div key={p.provider} className="list-item clickable" onClick={() => navigate('/providers')}>
                  <ProviderIcon provider={p.provider} size={32} />
                  <div className="list-item-main">
                    <div className="list-item-title">{p.label}</div>
                    <div className="list-item-sub">
                      {p.regions} regions · {p.accounts} account{p.accounts === 1 ? '' : 's'} · synced {timeAgo(p.lastSync)}
                    </div>
                  </div>
                  <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                    <StatusBadge status={p.status} />
                    <span className="xs muted tabular">{formatCurrency(p.cost)}/mo</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Recent Alerts" subtitle="Active alerts, most severe first" flush actions={<Link to="/alerts" className="small row">View all <ArrowRight size={13} /></Link>}>
          {!summary.data ? (
            <CardSkeleton rows={5} />
          ) : !summary.data.recentAlerts.length ? (
            <EmptyState compact icon={<CheckCircle2 size={20} />} title="No active alerts" description="Everything is running within thresholds." />
          ) : (
            <div className="list">
              {summary.data.recentAlerts.map((a) => (
                <div key={a._id} className="list-item clickable" onClick={() => navigate(`/alerts?focus=${a._id}`)}>
                  <SeverityPill severity={a.severity} />
                  <div className="list-item-main">
                    <div className="list-item-title">{a.title}</div>
                    <div className="list-item-sub">
                      {a.resourceName ?? a.provider} · {timeAgo(a.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="Operational Insights" subtitle="Generated from live telemetry and billing data" flush actions={<Zap size={16} className="muted" />}>
          {!insights.data ? (
            <CardSkeleton rows={5} />
          ) : !insights.data.insights.length ? (
            <EmptyState compact title="No insights right now" />
          ) : (
            insights.data.insights.map((i) => {
              const Icon = INSIGHT_ICON[i.severity];
              return (
                <div className="insight" key={i.id}>
                  <span className={`insight-icon ${i.severity}`}>
                    <Icon size={15} />
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="insight-cat">{i.category}</div>
                    <div className="insight-text">{i.message}</div>
                  </div>
                  {i.link && (
                    <Link to={i.link} className="icon-btn ghost sm" aria-label="Open related page">
                      <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
              );
            })
          )}
        </Card>

        <Card
          title="Cost Optimization"
          subtitle={insights.data ? `Potential savings ≈ ${formatCurrency(insights.data.potentialSavings)}/month` : 'Rightsizing and storage recommendations'}
          flush
          actions={<TrendingUp size={16} className="muted" />}
        >
          {!insights.data ? (
            <CardSkeleton rows={5} />
          ) : !insights.data.recommendations.length ? (
            <EmptyState compact icon={<CheckCircle2 size={20} />} title="No recommendations" description="Your resources look right-sized." />
          ) : (
            <div className="list">
              {insights.data.recommendations.slice(0, 6).map((r) => (
                <div key={`${r.resource._id}-${r.action}`} className="list-item clickable" onClick={() => navigate(`/resources/${r.resource._id}`)}>
                  <ProviderIcon provider={r.resource.provider} size={28} />
                  <div className="list-item-main">
                    <div className="list-item-title">
                      {r.action}: {r.resource.name}
                    </div>
                    <div className="list-item-sub">{r.detail}</div>
                  </div>
                  <div className="list-item-meta">
                    <div className="bold text-healthy tabular">−{formatCurrency(r.estimatedSavings)}</div>
                    <div>per month</div>
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
