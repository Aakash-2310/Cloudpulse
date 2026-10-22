import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BellOff, Download, Plus, Search } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import AlertCard from '../components/AlertCard';
import Pagination from '../components/Pagination';
import RefreshControl from '../components/RefreshControl';
import Modal, { ConfirmDialog } from '../components/Modal';
import EmptyState, { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { IfRole } from '../components/ProtectedRoute';
import { useFetch } from '../hooks/useFetch';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/usePreferences';
import { alertService } from '../services/alertService';
import { systemService } from '../services/dashboardService';
import type { Alert } from '../types/alert';
import type { Severity } from '../types/common';
import { PROVIDERS, PROVIDER_KEYS } from '../utils/constants';

const TABS = [
  { value: 'active', label: 'Active', count: 'active' },
  { value: 'open', label: 'Open', count: 'open' },
  { value: 'acknowledged', label: 'Acknowledged', count: 'acknowledged' },
  { value: 'resolved', label: 'Resolved', count: 'resolved' },
  { value: 'all', label: 'All' },
] as const;

const TYPES: Record<string, string> = {
  'high-cpu': 'High CPU',
  'high-memory': 'High memory',
  'high-network': 'High network usage',
  'storage-capacity': 'Storage capacity',
  'service-down': 'Service down',
  'cost-spike': 'Cost spike',
  'resource-failure': 'Resource failure',
  'resource-created': 'Resource created',
};

export default function Alerts() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const focus = params.get('focus');
  const [status, setStatus] = useState(focus ? 'all' : 'active');
  const [severity, setSeverity] = useState('all');
  const [provider, setProvider] = useState('all');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search, 300);
  const [busy, setBusy] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Alert | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => setPage(1), [status, severity, provider, type, debounced]);

  const { data, error, loading, refreshing, reload, lastUpdated, setData } = useFetch(
    () => alertService.list({ status, severity, provider, type, search: debounced, page, limit: focus ? 100 : 15 }),
    [status, severity, provider, type, debounced, page, focus],
    { refreshInterval: 15_000 },
  );

  // Scroll a deep-linked alert into view once (not on every background refresh).
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!focus || !data || scrolledTo.current === focus) return;
    const el = document.getElementById(`alert-${focus}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      scrolledTo.current = focus;
    }
  }, [focus, data]);

  const act = async (a: Alert, fn: () => Promise<Alert>, msg: string) => {
    setBusy(a._id);
    try {
      const updated = await fn();
      setData((prev) => (prev ? { ...prev, items: prev.items.map((x) => (x._id === a._id ? updated : x)) } : prev));
      toast.success(msg, a.title);
      void reload();
    } catch (err) {
      toast.error('Action failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(toDelete._id);
    try {
      await alertService.remove(toDelete._id);
      toast.success('Alert deleted');
      setToDelete(null);
      void reload();
    } catch (err) {
      toast.error('Delete failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const counts = data?.counts;
  const canAct = hasRole('admin', 'operator');

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Alerts"
        subtitle="Triage alerts raised by threshold rules, health checks and cost anomaly detection."
        actions={
          <>
            <RefreshControl lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} autoRefreshSeconds={15} />
            <button className="btn btn-sm" onClick={() => systemService.exportReport('alerts', { status }).catch((e: Error) => toast.error('Export failed', e.message))}>
              <Download size={14} /> Export CSV
            </button>
            <IfRole roles={['admin', 'operator']}>
              <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
                <Plus size={14} /> New alert
              </button>
            </IfRole>
          </>
        }
      />

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={status === t.value}
            className={`tab ${status === t.value ? 'active' : ''}`}
            onClick={() => {
              setStatus(t.value);
              if (focus) {
                params.delete('focus');
                setParams(params, { replace: true });
              }
            }}
          >
            {t.label}
            {'count' in t && counts && <span className="count">{counts[t.count]}</span>}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-field">
            <Search size={15} />
            <input className="input" placeholder="Search alerts or resources…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search alerts" />
          </div>
          <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity">
            <option value="all">All severities</option>
            <option value="critical">Critical{counts ? ` (${counts.critical} active)` : ''}</option>
            <option value="warning">Warning{counts ? ` (${counts.warning} active)` : ''}</option>
            <option value="info">Info{counts ? ` (${counts.info} active)` : ''}</option>
          </select>
          <select className="select" value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Provider">
            <option value="all">All providers</option>
            {PROVIDER_KEYS.map((p) => (
              <option key={p} value={p}>
                {PROVIDERS[p].label}
              </option>
            ))}
            <option value="platform">Platform</option>
          </select>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Alert type">
            <option value="all">All types</option>
            {Object.entries(TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {loading && !data ? (
          <CardSkeleton rows={8} />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.items.length ? (
          <EmptyState icon={<BellOff size={20} />} title="No alerts here" description={status === 'active' ? 'No active alerts — everything is within thresholds.' : 'No alerts match the current filters.'} />
        ) : (
          <>
            {data.items.map((a) => (
              <AlertCard
                key={a._id}
                alert={a}
                focused={a._id === focus}
                busy={busy === a._id}
                canAct={canAct}
                canDelete={hasRole('admin')}
                onAcknowledge={(x) => act(x, () => alertService.acknowledge(x._id), 'Alert acknowledged')}
                onResolve={(x) => act(x, () => alertService.resolve(x._id), 'Alert resolved')}
                onDelete={setToDelete}
              />
            ))}
            <Pagination meta={data.meta} onPage={setPage} label="alerts" />
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Delete alert?"
        message={<>“{toDelete?.title}” will be permanently deleted from the alert history.</>}
        confirmLabel="Delete"
        danger
        busy={busy === toDelete?._id}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
      {creating && (
        <CreateAlertModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

function CreateAlertModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ title: '', description: '', severity: 'warning' as Severity, provider: 'platform', resourceName: '', type: 'resource-failure' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.title.trim().length < 3) return setError('Enter a title (3+ characters).');
    setSaving(true);
    try {
      await alertService.create({ ...form, title: form.title.trim(), resourceName: form.resourceName.trim() || undefined });
      toast.success('Alert created');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create alert');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="New alert"
      subtitle="Raise a manual alert, e.g. for an incident reported outside CloudPulse."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="create-alert" disabled={saving}>
            {saving ? 'Creating…' : 'Create alert'}
          </button>
        </>
      }
    >
      <form id="create-alert" onSubmit={submit}>
        {error && <div className="callout error mb-16">{error}</div>}
        <div className="field">
          <label className="label" htmlFor="al-title">Title</label>
          <input id="al-title" className="input" value={form.title} onChange={set('title')} placeholder="Checkout latency elevated in eu-west-1" />
        </div>
        <div className="field">
          <label className="label" htmlFor="al-desc">Description</label>
          <textarea id="al-desc" className="textarea" value={form.description} onChange={set('description')} />
        </div>
        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor="al-sev">Severity</label>
            <select id="al-sev" className="select" value={form.severity} onChange={set('severity')}>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="al-type">Type</label>
            <select id="al-type" className="select" value={form.type} onChange={set('type')}>
              {Object.entries(TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="al-prov">Provider</label>
            <select id="al-prov" className="select" value={form.provider} onChange={set('provider')}>
              <option value="platform">Platform</option>
              {PROVIDER_KEYS.map((p) => (
                <option key={p} value={p}>{PROVIDERS[p].label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="al-res">Resource (optional)</label>
            <input id="al-res" className="input" value={form.resourceName} onChange={set('resourceName')} placeholder="checkout-service" />
          </div>
        </div>
      </form>
    </Modal>
  );
}
