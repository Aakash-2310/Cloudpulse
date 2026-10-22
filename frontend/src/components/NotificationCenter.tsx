import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, Bell, CheckCircle2, DollarSign, Info, PlugZap } from 'lucide-react';
import { alertService } from '../services/alertService';
import { useFetch } from '../hooks/useFetch';
import type { Notification } from '../types/alert';
import { timeAgo } from '../utils/formatters';
import LoadingSpinner from './LoadingSpinner';

function iconFor(n: Notification) {
  if (n.type === 'cost-anomaly') return { Icon: DollarSign, bg: 'var(--status-warning-soft)', fg: 'var(--status-warning)' };
  if (n.type === 'connection-failure') return { Icon: PlugZap, bg: 'var(--status-critical-soft)', fg: 'var(--status-critical)' };
  if (n.type === 'alert-resolved' || n.severity === 'success') return { Icon: CheckCircle2, bg: 'var(--status-healthy-soft)', fg: 'var(--status-healthy)' };
  if (n.severity === 'critical') return { Icon: AlertOctagon, bg: 'var(--status-critical-soft)', fg: 'var(--status-critical)' };
  if (n.severity === 'warning') return { Icon: AlertTriangle, bg: 'var(--status-warning-soft)', fg: 'var(--status-warning)' };
  return { Icon: Info, bg: 'var(--status-info-soft)', fg: 'var(--status-info)' };
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data, loading, setData, reload } = useFetch(() => alertService.notifications(), [], { refreshInterval: 30_000 });

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = data?.unread ?? 0;

  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.read) {
      setData((prev) => (prev ? { unread: Math.max(0, prev.unread - 1), items: prev.items.map((x) => (x._id === n._id ? { ...x, read: true } : x)) } : prev));
      alertService.markRead(n._id).catch(() => undefined);
    }
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    setData((prev) => (prev ? { unread: 0, items: prev.items.map((x) => ({ ...x, read: true })) } : prev));
    await alertService.markAllRead().catch(() => reload());
  };

  return (
    <div className="dropdown-wrap" ref={ref}>
      <button
        className="icon-btn ghost"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void reload();
        }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unread > 0 && <span className="count-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="popover dropdown notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-header">
            <div>
              <div className="bold">Notifications</div>
              <div className="xs muted">{unread ? `${unread} unread` : 'You’re all caught up'}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={markAll} disabled={!unread}>
              Mark all read
            </button>
          </div>
          <div className="notif-list">
            {loading && !data ? (
              <div className="state compact">
                <LoadingSpinner />
              </div>
            ) : !data?.items.length ? (
              <div className="state compact">
                <div className="state-text">No notifications yet.</div>
              </div>
            ) : (
              data.items.map((n) => {
                const { Icon, bg, fg } = iconFor(n);
                return (
                  <button key={n._id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => openItem(n)}>
                    <span className="notif-icon" style={{ background: bg, color: fg }}>
                      <Icon size={15} />
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="notif-item-title" style={{ display: 'block' }}>
                        {n.title}
                      </span>
                      {n.message && (
                        <span className="notif-item-msg" style={{ display: '-webkit-box' }}>
                          {n.message}
                        </span>
                      )}
                      <span className="notif-item-time" style={{ display: 'block' }}>
                        {timeAgo(n.createdAt)}
                      </span>
                    </span>
                    {!n.read && <span className="live-dot" style={{ background: 'var(--primary)', boxShadow: 'none', marginTop: 6 }} aria-label="Unread" />}
                  </button>
                );
              })
            )}
          </div>
          <div className="card-footer" style={{ justifyContent: 'center' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOpen(false);
                navigate('/alerts');
              }}
            >
              View all alerts
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
