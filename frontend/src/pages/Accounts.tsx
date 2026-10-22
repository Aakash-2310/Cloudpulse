import { useState } from 'react';
import { Pencil, Plus, Power, RefreshCw, Trash2 } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Modal, { ConfirmDialog } from '../components/Modal';
import AddProviderWizard from '../components/AddProviderWizard';
import StatusBadge from '../components/StatusBadge';
import { ProviderTag } from '../components/ProviderIcon';
import RefreshControl from '../components/RefreshControl';
import { Segmented } from '../components/TimeRangePicker';
import EmptyState, { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { IfRole } from '../components/ProtectedRoute';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/usePreferences';
import { cloudService } from '../services/cloudService';
import type { CloudAccount } from '../types/cloud';
import { PROVIDER_FILTER } from '../utils/constants';
import { formatCurrency, formatDuration, timeAgo } from '../utils/formatters';

export default function Accounts() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [provider, setProvider] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<CloudAccount | null>(null);
  const [removing, setRemoving] = useState<CloudAccount | null>(null);
  const [wizard, setWizard] = useState(false);
  const { data, error, loading, refreshing, reload, lastUpdated } = useFetch(() => cloudService.accounts(provider), [provider], { refreshInterval: 30_000 });

  const run = async (id: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(success);
      await reload();
    } catch (err) {
      toast.error('Action failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Cloud"
        title="Cloud Accounts"
        subtitle="Every connected AWS account, Azure subscription and GCP project."
        actions={
          <>
            <RefreshControl lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} />
            <IfRole roles={['admin']}>
              <button className="btn btn-primary btn-sm" onClick={() => setWizard(true)}>
                <Plus size={14} /> Connect account
              </button>
            </IfRole>
          </>
        }
      />
      <div className="card">
        <div className="toolbar">
          <Segmented label="Provider" value={provider} onChange={setProvider} options={PROVIDER_FILTER} />
        </div>
        {loading && !data ? (
          <CardSkeleton rows={5} />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.length ? (
          <EmptyState title="No accounts connected" description="Connect a cloud account to start monitoring." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Provider</th>
                  <th>Environment</th>
                  <th>Connection</th>
                  <th>Health</th>
                  <th className="num">Regions</th>
                  <th className="num">Resources</th>
                  <th className="num">Cost / month</th>
                  <th>Last sync</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((a) => (
                  <tr key={a._id}>
                    <td>
                      <div className="cell-title">{a.accountName}</div>
                      <div className="cell-sub mono" title={a.accountId}>
                        {a.accountId}
                      </div>
                    </td>
                    <td>
                      <ProviderTag provider={a.provider} />
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{a.environment}</td>
                    <td>
                      <StatusBadge status={a.status} />
                      {a.lastError && a.status === 'error' && <div className="cell-sub text-critical">{a.lastError}</div>}
                    </td>
                    <td>
                      <StatusBadge status={a.health} />
                    </td>
                    <td className="num">{a.regions.length}</td>
                    <td className="num">{a.resourceCount}</td>
                    <td className="num">{formatCurrency(a.monthlyCost)}</td>
                    <td className="small">
                      <div>{timeAgo(a.lastSync)}</div>
                      {a.lastSyncDurationMs && <div className="cell-sub">took {formatDuration(a.lastSyncDurationMs)}</div>}
                    </td>
                    <td>
                      <div className="cell-actions">
                        {hasRole('admin', 'operator') && (
                          <button className="icon-btn ghost sm" title="Synchronize now" aria-label={`Synchronize ${a.accountName}`} disabled={busy === a._id || a.status === 'disconnected'} onClick={() => run(a._id, () => cloudService.sync(a._id), `${a.accountName} synchronized`)}>
                            <RefreshCw size={14} className={busy === a._id ? 'spin' : ''} />
                          </button>
                        )}
                        {hasRole('admin') && (
                          <>
                            <button className="icon-btn ghost sm" title="Edit" aria-label={`Edit ${a.accountName}`} onClick={() => setEditing(a)}>
                              <Pencil size={14} />
                            </button>
                            <button
                              className="icon-btn ghost sm"
                              title={a.status === 'disconnected' ? 'Reconnect' : 'Pause monitoring'}
                              aria-label={a.status === 'disconnected' ? 'Reconnect account' : 'Pause monitoring'}
                              disabled={busy === a._id}
                              onClick={() =>
                                run(a._id, () => cloudService.update(a._id, { status: a.status === 'disconnected' ? 'connected' : 'disconnected' }), a.status === 'disconnected' ? 'Account reconnected' : 'Monitoring paused')
                              }
                            >
                              <Power size={14} />
                            </button>
                            <button className="icon-btn ghost sm" title="Remove" aria-label={`Remove ${a.accountName}`} onClick={() => setRemoving(a)}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <EditAccountModal account={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove cloud account?"
        danger
        confirmLabel="Remove account"
        busy={busy === removing?._id}
        message={
          <>
            <b>{removing?.accountName}</b> and its {removing?.resourceCount} resources, metrics, billing records and alerts will be removed from
            CloudPulse. Nothing is changed in the cloud provider.
          </>
        }
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await run(removing._id, () => cloudService.remove(removing._id), 'Account removed');
          setRemoving(null);
        }}
      />
      {wizard && <AddProviderWizard open onClose={() => setWizard(false)} onConnected={() => void reload()} />}
    </>
  );
}

function EditAccountModal({ account, onClose, onSaved }: { account: CloudAccount; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(account.accountName);
  const [environment, setEnvironment] = useState(account.environment);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await cloudService.update(account._id, { accountName: name.trim(), environment });
      toast.success('Account updated');
      onSaved();
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      title="Edit account"
      subtitle={account.accountId}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || name.trim().length < 2}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="label" htmlFor="acc-name">Account name</label>
        <input id="acc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label className="label" htmlFor="acc-env">Environment</label>
        <select id="acc-env" className="select" value={environment} onChange={(e) => setEnvironment(e.target.value as CloudAccount['environment'])}>
          <option value="production">Production</option>
          <option value="staging">Staging</option>
          <option value="development">Development</option>
        </select>
      </div>
    </Modal>
  );
}
