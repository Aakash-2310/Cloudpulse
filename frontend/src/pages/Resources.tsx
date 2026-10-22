import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Plus, Search, Server, X } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import ResourceTable from '../components/ResourceTable';
import Pagination from '../components/Pagination';
import RefreshControl from '../components/RefreshControl';
import Modal, { ConfirmDialog } from '../components/Modal';
import EmptyState, { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { IfRole } from '../components/ProtectedRoute';
import { useFetch } from '../hooks/useFetch';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../hooks/useAuth';
import { usePreferences, useToast } from '../hooks/usePreferences';
import { resourceService } from '../services/resourceService';
import { cloudService } from '../services/cloudService';
import { systemService } from '../services/dashboardService';
import type { Resource, ResourceType } from '../types/resource';
import type { Provider } from '../types/common';
import { ENVIRONMENTS, PROVIDERS, PROVIDER_KEYS, RESOURCE_TYPES, STATUS_META } from '../utils/constants';

export default function Resources() {
  const [params, setParams] = useSearchParams();
  const { environment, setEnvironment } = usePreferences();
  const { hasRole } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const debounced = useDebounce(search, 300);
  const [toDelete, setToDelete] = useState<Resource | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const filters = {
    provider: params.get('provider') ?? 'all',
    status: params.get('status') ?? 'all',
    type: params.get('type') ?? 'all',
    region: params.get('region') ?? 'all',
    sort: params.get('sort') ?? 'name',
    order: (params.get('order') as 'asc' | 'desc') ?? 'asc',
    page: Number(params.get('page') ?? 1),
    limit: Number(params.get('limit') ?? 20),
  };

  const update = (patch: Record<string, string | number | undefined>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === '' || v === 'all') next.delete(k);
      else next.set(k, String(v));
    }
    if (resetPage && !('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if ((params.get('search') ?? '') !== debounced) update({ search: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const query = { ...filters, search: debounced, environment };
  const { data, error, loading, refreshing, reload, lastUpdated } = useFetch(() => resourceService.list(query), [JSON.stringify(query)], {
    refreshInterval: 30_000,
  });

  const onSort = (field: string) => {
    const order = filters.sort === field && filters.order === 'asc' ? 'desc' : 'asc';
    update({ sort: field, order }, false);
  };

  const activeFilters = ['provider', 'status', 'type', 'region'].filter((k) => filters[k as keyof typeof filters] !== 'all');

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await resourceService.remove(toDelete._id);
      toast.success('Resource removed', `${toDelete.name} is no longer monitored.`);
      setToDelete(null);
      void reload();
    } catch (err) {
      toast.error('Could not remove resource', err instanceof Error ? err.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  const exportCsv = async () => {
    try {
      await systemService.exportReport('resources', { ...filters, search: debounced, environment, page: undefined, limit: undefined });
    } catch (err) {
      toast.error('Export failed', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Monitoring"
        title="Resources"
        subtitle="Unified inventory of every monitored resource across providers, accounts and regions."
        actions={
          <>
            <RefreshControl lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={reload} autoRefreshSeconds={30} />
            <button className="btn btn-sm" onClick={exportCsv}>
              <Download size={14} /> Export CSV
            </button>
            <IfRole roles={['admin']}>
              <button className="btn btn-sm btn-primary" onClick={() => setShowAdd(true)}>
                <Plus size={14} /> Register resource
              </button>
            </IfRole>
          </>
        }
      />

      <div className="card">
        <div className="toolbar">
          <div className="search-field">
            <Search size={15} />
            <input className="input" placeholder="Search name, ID, service or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search resources" />
          </div>
          <select className="select" value={filters.provider} onChange={(e) => update({ provider: e.target.value })} aria-label="Provider">
            <option value="all">All providers</option>
            {PROVIDER_KEYS.map((p) => (
              <option key={p} value={p}>
                {PROVIDERS[p].label}
              </option>
            ))}
          </select>
          <select className="select" value={filters.status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
            <option value="all">All statuses</option>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select className="select" value={filters.type} onChange={(e) => update({ type: e.target.value })} aria-label="Resource type">
            <option value="all">All types</option>
            {Object.entries(RESOURCE_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select className="select" value={filters.region} onChange={(e) => update({ region: e.target.value })} aria-label="Region">
            <option value="all">All regions</option>
            {(data?.facets.regions ?? []).map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select className="select" value={environment} onChange={(e) => setEnvironment(e.target.value)} aria-label="Environment">
            {ENVIRONMENTS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
          {activeFilters.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => update({ provider: 'all', status: 'all', type: 'all', region: 'all' })}>
              <X size={14} /> Clear filters
            </button>
          )}
        </div>

        {loading && !data ? (
          <CardSkeleton rows={8} />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.items.length ? (
          <EmptyState
            icon={<Server size={20} />}
            title="No resources match these filters"
            description="Try a different search term or clear the filters."
            action={
              activeFilters.length || debounced ? (
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setSearch('');
                    update({ provider: 'all', status: 'all', type: 'all', region: 'all', search: '' });
                  }}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ResourceTable items={data.items} sort={filters.sort} order={filters.order} onSort={onSort} onDelete={hasRole('admin') ? setToDelete : undefined} />
            <Pagination meta={data.meta} onPage={(page) => update({ page }, false)} onLimit={(limit) => update({ limit })} label="resources" />
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Remove resource from monitoring?"
        message={
          <>
            <b>{toDelete?.name}</b> and its metric history will be removed from CloudPulse. The resource itself is not touched in the cloud
            provider and will reappear on the next account sync if it still exists.
          </>
        }
        confirmLabel="Remove"
        danger
        busy={deleting}
        onConfirm={confirmDelete}
        onClose={() => setToDelete(null)}
      />
      {showAdd && (
        <AddResourceModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            void reload();
          }}
        />
      )}
    </>
  );
}

function AddResourceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const accounts = useFetch(() => cloudService.accounts(), []);
  const [form, setForm] = useState({
    name: '',
    cloudAccountId: '',
    type: 'virtual-machine' as ResourceType,
    service: '',
    sku: '',
    region: '',
    environment: 'production',
    cost: '0',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const account = accounts.data?.find((a) => a._id === form.cloudAccountId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!account) return setError('Choose a cloud account.');
    if (!/^[a-zA-Z0-9._-]{2,}$/.test(form.name)) return setError('Name may contain letters, numbers, dots, dashes and underscores.');
    if (!form.region || !form.service) return setError('Region and service are required.');
    setSaving(true);
    setError(null);
    try {
      await resourceService.create({
        name: form.name,
        cloudAccountId: account._id,
        provider: account.provider as Provider,
        type: form.type,
        service: form.service,
        sku: form.sku || undefined,
        region: form.region,
        environment: form.environment as Resource['environment'],
        cost: Number(form.cost) || 0,
      });
      toast.success('Resource registered', `${form.name} will report metrics on the next monitoring cycle.`);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register resource');
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Modal
      open
      title="Register resource"
      subtitle="Manually add a resource that isn’t discovered by account sync."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" form="add-resource" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Register'}
          </button>
        </>
      }
    >
      <form id="add-resource" onSubmit={submit}>
        {error && <div className="callout error mb-16">{error}</div>}
        <div className="field">
          <label className="label" htmlFor="r-name">Name</label>
          <input id="r-name" className="input" value={form.name} onChange={set('name')} placeholder="reporting-api-01" />
        </div>
        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor="r-acc">Cloud account</label>
            <select id="r-acc" className="select" value={form.cloudAccountId} onChange={(e) => {
              const acc = accounts.data?.find((a) => a._id === e.target.value);
              setForm((f) => ({ ...f, cloudAccountId: e.target.value, region: acc?.regions[0] ?? '' }));
            }}>
              <option value="">Select account…</option>
              {(accounts.data ?? []).map((a) => (
                <option key={a._id} value={a._id}>
                  {PROVIDERS[a.provider].label} · {a.accountName}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="r-region">Region</label>
            <select id="r-region" className="select" value={form.region} onChange={set('region')} disabled={!account}>
              <option value="">Select region…</option>
              {(account?.regions ?? []).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor="r-type">Type</label>
            <select id="r-type" className="select" value={form.type} onChange={set('type')}>
              {Object.entries(RESOURCE_TYPES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="r-service">Service</label>
            <input id="r-service" className="input" value={form.service} onChange={set('service')} placeholder="EC2, Virtual Machines…" />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor="r-sku">SKU / size</label>
            <input id="r-sku" className="input" value={form.sku} onChange={set('sku')} placeholder="m6i.large" />
          </div>
          <div className="field">
            <label className="label" htmlFor="r-env">Environment</label>
            <select id="r-env" className="select" value={form.environment} onChange={set('environment')}>
              {ENVIRONMENTS.filter((e) => e.value !== 'all').map((e) => (
                <option key={e.value} value={e.value}>{e.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label" htmlFor="r-cost">Monthly cost (USD)</label>
          <input id="r-cost" className="input" type="number" min={0} step="0.01" value={form.cost} onChange={set('cost')} />
        </div>
      </form>
    </Modal>
  );
}
