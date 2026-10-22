import { useState, type FormEvent } from 'react';
import { Plus, Trash2, UserCog } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Modal, { ConfirmDialog } from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import EmptyState, { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { RoleGate } from '../components/ProtectedRoute';
import { useFetch } from '../hooks/useFetch';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/usePreferences';
import { systemService } from '../services/dashboardService';
import type { User, UserRole } from '../types/auth';
import { ROLE_LABELS } from '../utils/constants';
import { initials, timeAgo } from '../utils/formatters';
import { passwordIssues } from './Register';

const ROLE_HELP: Record<UserRole, string> = {
  admin: 'Full access: providers, users, alert rules and settings.',
  operator: 'Monitor resources, view costs, acknowledge and resolve alerts.',
  viewer: 'Read-only dashboards, resources, metrics and reports.',
};

function UsersContent() {
  const { user: me } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useFetch(() => systemService.users(), []);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (u: User, patch: { role?: UserRole; active?: boolean }) => {
    setBusy(u._id);
    try {
      const updated = await systemService.updateUser(u._id, patch);
      setData((prev) => prev?.map((x) => (x._id === u._id ? updated : x)) ?? prev);
      toast.success('User updated', u.name);
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(deleting._id);
    try {
      await systemService.deleteUser(deleting._id);
      toast.success('User deleted');
      setDeleting(null);
      void reload();
    } catch (err) {
      toast.error('Delete failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Users"
        subtitle="Invite teammates and control what they can do."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={14} /> Add user
          </button>
        }
      />
      <div className="grid grid-3 mb-16">
        {(Object.keys(ROLE_HELP) as UserRole[]).map((r) => (
          <div className="card metric-card" key={r}>
            <div className="metric-card-top">
              <span className="metric-label">{ROLE_LABELS[r]}s</span>
              <span className="metric-icon tone-primary">
                <UserCog size={16} />
              </span>
            </div>
            <div className="metric-value">{data?.filter((u) => u.role === r).length ?? '—'}</div>
            <div className="metric-foot">{ROLE_HELP[r]}</div>
          </div>
        ))}
      </div>
      <div className="card">
        {loading && !data ? (
          <CardSkeleton rows={5} />
        ) : error && !data ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !data?.length ? (
          <EmptyState title="No users" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                  <th className="num">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => {
                  const self = u._id === me?._id;
                  return (
                    <tr key={u._id}>
                      <td>
                        <div className="row" style={{ gap: 10 }}>
                          <span className="avatar">{initials(u.name)}</span>
                          <div>
                            <div className="cell-title">
                              {u.name} {self && <span className="badge outline" style={{ marginLeft: 4 }}>You</span>}
                            </div>
                            <div className="cell-sub">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select className="select" style={{ width: 150 }} value={u.role} disabled={self || busy === u._id} onChange={(e) => update(u, { role: e.target.value as UserRole })} aria-label={`Role for ${u.name}`}>
                          {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="row">
                          <button className={`switch ${u.active ? 'on' : ''}`} role="switch" aria-checked={u.active} aria-label={`${u.active ? 'Disable' : 'Enable'} ${u.name}`} disabled={self || busy === u._id} onClick={() => update(u, { active: !u.active })} />
                          <StatusBadge status={u.active ? 'healthy' : 'unknown'} label={u.active ? 'Active' : 'Disabled'} />
                        </div>
                      </td>
                      <td className="small muted">{timeAgo(u.lastLoginAt)}</td>
                      <td>
                        <div className="cell-actions">
                          <button className="icon-btn ghost sm" disabled={self} onClick={() => setDeleting(u)} aria-label={`Delete ${u.name}`}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {adding && <AddUserModal onClose={() => setAdding(false)} onCreated={() => { setAdding(false); void reload(); }} />}
      <ConfirmDialog open={Boolean(deleting)} title="Delete user?" message={<><b>{deleting?.name}</b> will lose access to CloudPulse immediately.</>} confirmLabel="Delete user" danger busy={busy === deleting?._id} onConfirm={remove} onClose={() => setDeleting(null)} />
    </>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' as UserRole, title: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError('Enter a name.');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError('Enter a valid email.');
    const issues = passwordIssues(form.password);
    if (issues.length) return setError(`Temporary password needs ${issues.join(', ')}.`);
    setSaving(true);
    try {
      await systemService.createUser({ ...form, name: form.name.trim(), email: form.email.trim(), title: form.title.trim() || undefined });
      toast.success('User created', `Share the temporary password with ${form.name} securely.`);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create user');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      title="Add user"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="submit" form="add-user" disabled={saving}>{saving ? 'Creating…' : 'Create user'}</button>
        </>
      }
    >
      <form id="add-user" onSubmit={submit}>
        {error && <div className="callout error mb-16">{error}</div>}
        <div className="field-row">
          <div className="field">
            <label className="label" htmlFor="u-name">Full name</label>
            <input id="u-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label className="label" htmlFor="u-title">Job title</label>
            <input id="u-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label className="label" htmlFor="u-email">Email</label>
          <input id="u-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label className="label" htmlFor="u-pw">Temporary password</label>
          <input id="u-pw" type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label" htmlFor="u-role">Role</label>
          <select id="u-role" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <span className="hint">{ROLE_HELP[form.role]}</span>
        </div>
      </form>
    </Modal>
  );
}

export default function Users() {
  return (
    <RoleGate roles={['admin']}>
      <UsersContent />
    </RoleGate>
  );
}
