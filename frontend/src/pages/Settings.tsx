import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Database, Download, FileSpreadsheet, Play, Server, ShieldCheck, Zap } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import { ErrorState } from '../components/EmptyState';
import { CardSkeleton } from '../components/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { usePreferences, useToast } from '../hooks/usePreferences';
import { useFetch } from '../hooks/useFetch';
import { authService } from '../services/authService';
import { systemService } from '../services/dashboardService';
import { passwordIssues } from './Register';
import { ENVIRONMENTS, ROLE_LABELS } from '../utils/constants';
import { formatDate, formatDuration, formatNumber, initials, timeAgo } from '../utils/formatters';

const TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'security', label: 'Security' },
  { value: 'preferences', label: 'Preferences' },
  { value: 'reports', label: 'Reports' },
  { value: 'system', label: 'System', admin: true },
];

export default function Settings() {
  const { hasRole } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'profile';
  const tabs = TABS.filter((t) => !t.admin || hasRole('admin'));

  return (
    <>
      <PageHeader eyebrow="System" title="Settings" subtitle="Manage your profile, security, preferences and platform configuration." />
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.value} role="tab" aria-selected={tab === t.value} className={`tab ${tab === t.value ? 'active' : ''}`} onClick={() => setParams({ tab: t.value }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'profile' && <ProfileTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'system' && hasRole('admin') && <SystemTab />}
    </>
  );
}

function ProfileTab() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [title, setTitle] = useState(user?.title ?? '');
  const [avatar, setAvatar] = useState(user?.avatar ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      setUser(await authService.updateProfile({ name: name.trim(), title: title.trim(), avatar: avatar.trim() }));
      toast.success('Profile updated');
    } catch (err) {
      toast.error('Update failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;
  return (
    <div className="grid grid-main-side">
      <Card title="Profile">
        <form onSubmit={save} style={{ maxWidth: 520 }}>
          <div className="field">
            <label className="label" htmlFor="p-name">Full name</label>
            <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label" htmlFor="p-title">Job title</label>
            <input id="p-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Site Reliability Engineer" />
          </div>
          <div className="field">
            <label className="label" htmlFor="p-avatar">Avatar URL</label>
            <input id="p-avatar" className="input" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" />
          </div>
          <div className="field">
            <label className="label">Email</label>
            <input className="input" value={user.email} disabled />
            <span className="hint">Contact an administrator to change your sign-in email.</span>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving || name.trim().length < 2}>
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </Card>
      <Card title="Account">
        <div className="row" style={{ gap: 14, marginBottom: 16 }}>
          {user.avatar ? <img className="avatar lg" src={user.avatar} alt="" /> : <span className="avatar lg">{initials(user.name)}</span>}
          <div>
            <div className="bold">{user.name}</div>
            <div className="small muted">{user.title || user.email}</div>
          </div>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <div className="row-between small">
            <span className="muted">Role</span>
            <span className="badge role">{ROLE_LABELS[user.role]}</span>
          </div>
          <div className="row-between small">
            <span className="muted">Member since</span>
            <span>{formatDate(user.createdAt)}</span>
          </div>
          <div className="row-between small">
            <span className="muted">Last sign-in</span>
            <span>{timeAgo(user.lastLoginAt)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SecurityTab() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const issues = passwordIssues(next);
    if (issues.length) return setError(`New password needs ${issues.join(', ')}.`);
    if (next !== confirm) return setError('Passwords do not match.');
    setSaving(true);
    setError(null);
    try {
      await authService.changePassword(current, next);
      toast.success('Password changed');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-main-side">
      <Card title="Change password">
        <form onSubmit={submit} style={{ maxWidth: 520 }}>
          {error && <div className="callout error mb-16">{error}</div>}
          <div className="field">
            <label className="label" htmlFor="s-cur">Current password</label>
            <input id="s-cur" className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="field">
            <label className="label" htmlFor="s-new">New password</label>
            <input id="s-new" className="input" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            <span className="hint">8+ characters with upper- and lowercase letters and a number.</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="s-conf">Confirm new password</label>
            <input id="s-conf" className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving || !current || !next}>
            {saving ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </Card>
      <Card title="Session security">
        <div className="stack" style={{ gap: 12 }}>
          <div className="callout success">
            <ShieldCheck size={16} />
            <div>Your session token is stored in an HTTP-only cookie and is never readable by JavaScript.</div>
          </div>
          <div className="small muted">Passwords are hashed with bcrypt (cost 12). Sign-in and password-reset endpoints are rate limited.</div>
        </div>
      </Card>
    </div>
  );
}

function PreferencesTab() {
  const { user, setUser } = useAuth();
  const { theme, setTheme, environment, setEnvironment } = usePreferences();
  const toast = useToast();
  const [email, setEmail] = useState(user?.preferences?.emailNotifications ?? true);

  const persist = async (prefs: { theme?: 'light' | 'dark'; defaultEnvironment?: string; emailNotifications?: boolean }) => {
    try {
      setUser(await authService.updateProfile({ preferences: prefs }));
    } catch (err) {
      toast.error('Could not save preference', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <Card title="Preferences">
      <div className="stack" style={{ gap: 20, maxWidth: 560 }}>
        <div className="row-between">
          <div>
            <div className="bold">Theme</div>
            <div className="small muted">Applies to this browser.</div>
          </div>
          <select
            className="select"
            style={{ width: 160 }}
            value={theme}
            onChange={(e) => {
              const t = e.target.value as 'light' | 'dark';
              setTheme(t);
              void persist({ theme: t });
            }}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="row-between">
          <div>
            <div className="bold">Default environment</div>
            <div className="small muted">Filters dashboards and resource lists.</div>
          </div>
          <select
            className="select"
            style={{ width: 180 }}
            value={environment}
            onChange={(e) => {
              setEnvironment(e.target.value);
              void persist({ defaultEnvironment: e.target.value });
            }}
          >
            {ENVIRONMENTS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <div className="row-between">
          <div>
            <div className="bold">Email notifications</div>
            <div className="small muted">Critical alerts and cost anomalies (requires an SMTP provider to be configured).</div>
          </div>
          <button
            className={`switch ${email ? 'on' : ''}`}
            role="switch"
            aria-checked={email}
            aria-label="Email notifications"
            onClick={() => {
              setEmail(!email);
              void persist({ emailNotifications: !email });
            }}
          />
        </div>
      </div>
    </Card>
  );
}

function ReportsTab() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const reports = [
    { type: 'resources' as const, title: 'Resource inventory', desc: 'All resources with utilization, status and cost (CSV).', roles: true },
    { type: 'alerts' as const, title: 'Alert history', desc: 'Every alert with severity, status and timestamps (CSV).', roles: true },
    { type: 'service-health' as const, title: 'Service health', desc: 'Current status, uptime and latency per service (CSV).', roles: true },
    { type: 'costs' as const, title: 'Billing records', desc: 'Daily cost line items for the last 90 days (CSV).', roles: hasRole('admin', 'operator') },
    { type: 'summary' as const, title: 'Executive summary', desc: 'KPIs, health score, insights, costs and anomalies (JSON).', roles: hasRole('admin', 'operator') },
  ];
  const run = async (type: (typeof reports)[number]['type']) => {
    setBusy(type);
    try {
      await systemService.exportReport(type, type === 'costs' ? { days: 90 } : undefined);
      toast.success('Report downloaded');
    } catch (err) {
      toast.error('Export failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card title="Export monitoring reports" flush>
      <div className="list">
        {reports
          .filter((r) => r.roles)
          .map((r) => (
            <div className="list-item" key={r.type}>
              <span className="metric-icon tone-primary">
                <FileSpreadsheet size={16} />
              </span>
              <div className="list-item-main">
                <div className="list-item-title">{r.title}</div>
                <div className="list-item-sub">{r.desc}</div>
              </div>
              <button className="btn btn-sm" onClick={() => run(r.type)} disabled={busy === r.type}>
                <Download size={14} /> {busy === r.type ? 'Exporting…' : 'Download'}
              </button>
            </div>
          ))}
      </div>
    </Card>
  );
}

function SystemTab() {
  const toast = useToast();
  const { data, error, loading, reload } = useFetch(() => systemService.status(), [], { refreshInterval: 15_000 });
  const [running, setRunning] = useState(false);

  const runCycle = async () => {
    setRunning(true);
    try {
      await systemService.runMonitoring();
      toast.success('Monitoring cycle completed');
      void reload();
    } catch (err) {
      toast.error('Run failed', err instanceof Error ? err.message : undefined);
    } finally {
      setRunning(false);
    }
  };

  if (loading && !data) return <div className="card"><CardSkeleton rows={6} /></div>;
  if (error && !data) return <div className="card"><ErrorState message={error} onRetry={reload} /></div>;
  if (!data) return null;
  const hitRate = data.cache.hits + data.cache.misses ? (data.cache.hits / (data.cache.hits + data.cache.misses)) * 100 : 0;

  return (
    <div className="grid grid-2">
      <Card title="Platform status" actions={<Server size={16} className="muted" />}>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row-between small"><span className="muted">MongoDB</span><StatusBadge status={data.mongodb === 'connected' ? 'connected' : 'error'} label={data.mongodb} /></div>
          <div className="row-between small"><span className="muted">Redis cache</span><StatusBadge status={data.redis === 'connected' ? 'connected' : 'error'} label={data.redis} /></div>
          <div className="row-between small"><span className="muted">Provider mode</span><span className="badge outline">{data.providerMode}</span></div>
          <div className="row-between small"><span className="muted">Demo mode</span><span>{data.demoMode ? 'On' : 'Off'}</span></div>
          <div className="row-between small"><span className="muted">API uptime</span><span>{formatDuration(data.uptimeSeconds * 1000)}</span></div>
          <div className="row-between small"><span className="muted">Node.js</span><span className="mono">{data.nodeVersion}</span></div>
        </div>
      </Card>
      <Card title="Monitoring loop" actions={<button className="btn btn-sm" onClick={runCycle} disabled={running}><Play size={14} /> {running ? 'Running…' : 'Run now'}</button>}>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row-between small"><span className="muted">Status</span><StatusBadge status={data.monitoring.enabled ? 'running' : 'stopped'} /></div>
          <div className="row-between small"><span className="muted">Interval</span><span>{formatDuration(data.monitoring.intervalMs)}</span></div>
          <div className="row-between small"><span className="muted">Last cycle</span><span>{data.monitoring.lastCycle ? timeAgo(data.monitoring.lastCycle.at) : '—'}</span></div>
          <div className="row-between small"><span className="muted">Samples / cycle</span><span>{data.monitoring.lastCycle?.samples ?? '—'}</span></div>
          <div className="row-between small"><span className="muted">Cycle duration</span><span>{data.monitoring.lastCycle ? formatDuration(data.monitoring.lastCycle.durationMs) : '—'}</span></div>
        </div>
      </Card>
      <Card title="Redis cache" actions={<Zap size={16} className="muted" />}>
        <div className="stack" style={{ gap: 12 }}>
          <div className="row-between small"><span className="muted">Hit rate</span><span className="bold">{hitRate.toFixed(1)}%</span></div>
          <div className="row-between small"><span className="muted">Hits / misses</span><span>{formatNumber(data.cache.hits)} / {formatNumber(data.cache.misses)}</span></div>
          {Object.entries(data.cache.ttl).map(([k, v]) => (
            <div className="row-between small" key={k}><span className="muted">TTL · {k}</span><span className="mono">{v}s</span></div>
          ))}
        </div>
      </Card>
      <Card title="Data volume" actions={<Database size={16} className="muted" />}>
        <div className="stack" style={{ gap: 12 }}>
          {Object.entries(data.counts).map(([k, v]) => (
            <div className="row-between small" key={k}><span className="muted" style={{ textTransform: 'capitalize' }}>{k}</span><span className="tabular">{formatNumber(v)}</span></div>
          ))}
        </div>
      </Card>
    </div>
  );
}
