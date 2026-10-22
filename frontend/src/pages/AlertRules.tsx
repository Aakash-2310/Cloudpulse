import { useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, Zap } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Modal, { ConfirmDialog } from '../components/Modal';
import { SeverityPill } from '../components/StatusBadge';
import EmptyState, { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { IfRole } from '../components/ProtectedRoute';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/usePreferences';
import { alertService } from '../services/alertService';
import type { AlertRule, AlertRulePayload, RuleMetric, RuleOperator } from '../types/alert';
import { timeAgo } from '../utils/formatters';

const METRICS: Record<RuleMetric, { label: string; unit: string; hint: string }> = {
  cpu: { label: 'CPU utilization', unit: '%', hint: 'Per resource, averaged per sample' },
  memory: { label: 'Memory utilization', unit: '%', hint: 'Per resource' },
  disk: { label: 'Disk usage', unit: '%', hint: 'Volumes, buckets and databases with capacity' },
  network: { label: 'Network utilization', unit: '%', hint: 'Throughput vs provisioned bandwidth (LB, VPC, K8s)' },
  'error-rate': { label: 'Error rate', unit: '%', hint: 'Failed requests share' },
  'cost-increase': { label: 'Cost increase (week over week)', unit: '%', hint: 'Per provider + service' },
  'service-availability': { label: 'Service availability', unit: '%', hint: '0 when a health check reports the service down' },
};

const EMPTY: AlertRulePayload = { name: '', description: '', metric: 'cpu', operator: '>', threshold: 80, duration: 5, severity: 'critical', enabled: true };

function conditionText(r: Pick<AlertRule, 'metric' | 'operator' | 'threshold' | 'duration'>) {
  const m = METRICS[r.metric];
  if (r.metric === 'service-availability') return 'Service unavailable';
  return `${m.label.split(' (')[0]} ${r.operator} ${r.threshold}${m.unit}`;
}

export default function AlertRules() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const toast = useToast();
  const { data, error, loading, reload, setData } = useFetch(() => alertService.rules(), []);
  const [editing, setEditing] = useState<AlertRule | 'new' | null>(null);
  const [deleting, setDeleting] = useState<AlertRule | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = async (rule: AlertRule) => {
    setData((prev) => prev?.map((r) => (r._id === rule._id ? { ...r, enabled: !r.enabled } : r)) ?? prev);
    try {
      await alertService.updateRule(rule._id, { enabled: !rule.enabled });
      toast.success(`Rule ${rule.enabled ? 'disabled' : 'enabled'}`, rule.name);
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : undefined);
      void reload();
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await alertService.deleteRule(deleting._id);
      toast.success('Rule deleted');
      setDeleting(null);
      void reload();
    } catch (err) {
      toast.error('Delete failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Alert Rules"
        subtitle="Threshold conditions evaluated on every monitoring cycle. A rule fires when its condition holds for the full duration."
        actions={
          <IfRole roles={['admin']}>
            <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
              <Plus size={14} /> New rule
            </button>
          </IfRole>
        }
      />
      {!isAdmin && <div className="callout info mb-16">Alert rules are managed by administrators. You have read-only access.</div>}
      <div className="card">
        {loading && !data ? (
          <CardSkeleton rows={6} />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.length ? (
          <EmptyState icon={<Zap size={20} />} title="No alert rules" description="Create a rule to start raising alerts automatically." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Enabled</th>
                  <th>Rule</th>
                  <th>Condition</th>
                  <th>For</th>
                  <th>Action</th>
                  <th className="num">Triggered</th>
                  <th>Last fired</th>
                  {isAdmin && <th className="num">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r._id} style={{ opacity: r.enabled ? 1 : 0.6 }}>
                    <td>
                      <button className={`switch ${r.enabled ? 'on' : ''}`} onClick={() => toggle(r)} disabled={!isAdmin} role="switch" aria-checked={r.enabled} aria-label={`${r.enabled ? 'Disable' : 'Enable'} ${r.name}`} />
                    </td>
                    <td>
                      <div className="cell-title">{r.name}</div>
                      <div className="cell-sub">{r.description}</div>
                    </td>
                    <td className="mono">{conditionText(r)}</td>
                    <td>{r.duration ? `${r.duration} min` : 'Immediately'}</td>
                    <td>
                      <span className="row">
                        Create <SeverityPill severity={r.severity} /> alert
                      </span>
                    </td>
                    <td className="num">{r.triggerCount}</td>
                    <td className="small muted">{r.lastTriggeredAt ? timeAgo(r.lastTriggeredAt) : 'Never'}</td>
                    {isAdmin && (
                      <td>
                        <div className="cell-actions">
                          <button className="icon-btn ghost sm" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}>
                            <Pencil size={14} />
                          </button>
                          <button className="icon-btn ghost sm" onClick={() => setDeleting(r)} aria-label={`Delete ${r.name}`}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <RuleModal
          rule={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}
      <ConfirmDialog open={Boolean(deleting)} title="Delete alert rule?" message={<>“{deleting?.name}” will stop evaluating. Existing alerts are kept.</>} confirmLabel="Delete rule" danger busy={busy} onConfirm={remove} onClose={() => setDeleting(null)} />
    </>
  );
}

function RuleModal({ rule, onClose, onSaved }: { rule: AlertRule | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<AlertRulePayload>(rule ? { name: rule.name, description: rule.description, metric: rule.metric, operator: rule.operator, threshold: rule.threshold, duration: rule.duration, severity: rule.severity, enabled: rule.enabled } : EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 3) return setError('Give the rule a name (3+ characters).');
    if (!Number.isFinite(form.threshold) || form.threshold < 0) return setError('Threshold must be a positive number.');
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim() };
      if (rule) await alertService.updateRule(rule._id, payload);
      else await alertService.createRule(payload);
      toast.success(rule ? 'Rule updated' : 'Rule created', payload.name);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const m = METRICS[form.metric];
  return (
    <Modal
      open
      title={rule ? 'Edit alert rule' : 'New alert rule'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="rule-form" disabled={saving}>
            {saving ? 'Saving…' : rule ? 'Save changes' : 'Create rule'}
          </button>
        </>
      }
    >
      <form id="rule-form" onSubmit={submit}>
        {error && <div className="callout error mb-16">{error}</div>}
        <div className="field">
          <label className="label" htmlFor="ru-name">Name</label>
          <input id="ru-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="High CPU utilization" />
        </div>
        <div className="field">
          <label className="label" htmlFor="ru-metric">Metric</label>
          <select id="ru-metric" className="select" value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value as RuleMetric })}>
            {Object.entries(METRICS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <span className="hint">{m.hint}</span>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor="ru-op">Operator</label>
            <select id="ru-op" className="select" value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value as RuleOperator })}>
              {(['>', '>=', '<', '<=', '=='] as RuleOperator[]).map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="ru-th">Threshold ({m.unit})</label>
            <input id="ru-th" className="input" type="number" min={0} step="any" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor="ru-dur">For (minutes)</label>
            <input id="ru-dur" className="input" type="number" min={0} max={1440} value={form.duration} onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="ru-sev">Action</label>
            <select id="ru-sev" className="select" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as AlertRule['severity'] })}>
              <option value="critical">Create critical alert</option>
              <option value="warning">Create warning alert</option>
              <option value="info">Create info alert</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="ru-desc">Description</label>
          <input id="ru-desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Enabled
        </label>
        <div className="callout mb-16" style={{ marginTop: 14, marginBottom: 0 }}>
          <Zap size={15} />
          <span>
            When <b>{conditionText(form)}</b>
            {form.duration ? ` for ${form.duration} minutes` : ''}, create a <b>{form.severity}</b> alert.
          </span>
        </div>
      </form>
    </Modal>
  );
}
