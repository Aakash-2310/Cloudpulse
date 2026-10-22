import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ProviderCard from '../components/ProviderCard';
import Card from '../components/Card';
import AddProviderWizard from '../components/AddProviderWizard';
import RefreshControl from '../components/RefreshControl';
import { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { IfRole } from '../components/ProtectedRoute';
import { ProviderCostBar } from '../components/CostChart';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/usePreferences';
import { cloudService } from '../services/cloudService';
import type { Provider } from '../types/common';
import { formatCurrency, formatNumber } from '../utils/formatters';

export default function CloudProviders() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [wizard, setWizard] = useState<{ open: boolean; provider?: Provider }>({ open: false });
  const [syncing, setSyncing] = useState<string | null>(null);
  const { data, error, loading, refreshing, reload, lastUpdated } = useFetch(() => cloudService.providers(), [], { refreshInterval: 30_000 });

  const syncProvider = async (p: Provider) => {
    const accounts = data?.find((x) => x.provider === p)?.accounts ?? [];
    setSyncing(p);
    try {
      let total = 0;
      for (const a of accounts) total += (await cloudService.sync(a._id)).discovered;
      toast.success('Synchronization complete', `${total} resources discovered across ${accounts.length} account(s).`);
      void reload();
    } catch (err) {
      toast.error('Synchronization failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSyncing(null);
    }
  };

  const connected = (data ?? []).filter((p) => p.status !== 'not-connected');
  const totalCost = connected.reduce((s, p) => s + p.monthlyCost, 0);

  return (
    <>
      <PageHeader
        eyebrow="Cloud"
        title="Cloud Providers"
        subtitle="Connection status, footprint and spend for each cloud provider."
        actions={
          <>
            <RefreshControl lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} />
            <IfRole roles={['admin']}>
              <button className="btn btn-primary btn-sm" onClick={() => setWizard({ open: true })}>
                <Plus size={14} /> Add cloud provider
              </button>
            </IfRole>
          </>
        }
      />

      {error && !data ? (
        <div className="card">
          <ErrorState message={error} onRetry={reload} />
        </div>
      ) : loading && !data ? (
        <div className="grid grid-3">
          {[0, 1, 2].map((i) => (
            <div className="card" key={i}>
              <CardSkeleton rows={5} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-3 mb-16">
            {data!.map((p) => (
              <ProviderCard
                key={p.provider}
                provider={p}
                syncing={syncing === p.provider}
                onSync={hasRole('admin', 'operator') ? () => syncProvider(p.provider) : undefined}
                onConnect={hasRole('admin') ? () => setWizard({ open: true, provider: p.provider }) : undefined}
              />
            ))}
          </div>
          <div className="grid grid-main-side">
            <Card title="Provider comparison" subtitle="Footprint and spend side by side" flush>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Provider</th>
                      <th className="num">Accounts</th>
                      <th className="num">Regions</th>
                      <th className="num">Resources</th>
                      <th className="num">Cost / month</th>
                      <th className="num">Share of spend</th>
                      <th className="num">Cost / resource</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connected.map((p) => (
                      <tr key={p.provider}>
                        <td className="cell-title">{p.label}</td>
                        <td className="num">{p.accounts.length}</td>
                        <td className="num">{p.regionCount}</td>
                        <td className="num">{formatNumber(p.resourceCount)}</td>
                        <td className="num">{formatCurrency(p.monthlyCost)}</td>
                        <td className="num">{totalCost ? ((p.monthlyCost / totalCost) * 100).toFixed(1) : 0}%</td>
                        <td className="num">{formatCurrency(p.resourceCount ? p.monthlyCost / p.resourceCount : 0)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="cell-title">Total</td>
                      <td className="num bold">{connected.reduce((s, p) => s + p.accounts.length, 0)}</td>
                      <td className="num bold">{connected.reduce((s, p) => s + p.regionCount, 0)}</td>
                      <td className="num bold">{formatNumber(connected.reduce((s, p) => s + p.resourceCount, 0))}</td>
                      <td className="num bold">{formatCurrency(totalCost)}</td>
                      <td className="num bold">100%</td>
                      <td className="num" />
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="card-footer">
                <span>Manage individual accounts, environments and sync schedules.</span>
                <Link to="/accounts" className="row small">
                  Accounts <ArrowRight size={13} />
                </Link>
              </div>
            </Card>
            <Card title="Spend by provider" subtitle="Last 30 days">
              <ProviderCostBar
                data={connected.map((p) => ({ name: p.provider, label: p.label, provider: p.provider, amount: p.monthlyCost, share: totalCost ? (p.monthlyCost / totalCost) * 100 : 0, previous: 0, changePct: null }))}
                height={230}
              />
            </Card>
          </div>
        </>
      )}

      {wizard.open && <AddProviderWizard open initialProvider={wizard.provider} onClose={() => setWizard({ open: false })} onConnected={() => void reload()} />}
    </>
  );
}
