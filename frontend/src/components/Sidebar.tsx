import { NavLink } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  Cloud,
  Cpu,
  DollarSign,
  HardDrive,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  Network,
  Server,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useFetch } from '../hooks/useFetch';
import { alertService } from '../services/alertService';
import type { UserRole } from '../types/auth';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
  end?: boolean;
  badge?: 'alerts';
}

interface NavSection {
  title?: string;
  items: NavItem[];
  roles?: UserRole[];
}

const NAV: NavSection[] = [
  { items: [{ to: '/dashboard', label: 'Overview', icon: LayoutDashboard }] },
  {
    title: 'Monitoring',
    items: [
      { to: '/resources', label: 'Resources', icon: Server },
      { to: '/compute', label: 'Compute', icon: Cpu },
      { to: '/storage', label: 'Storage', icon: HardDrive },
      { to: '/network', label: 'Network', icon: Network },
      { to: '/service-health', label: 'Service Health', icon: HeartPulse },
    ],
  },
  {
    title: 'Cloud',
    items: [
      { to: '/providers', label: 'Providers', icon: Cloud },
      { to: '/accounts', label: 'Accounts', icon: KeyRound },
    ],
  },
  {
    title: 'FinOps',
    roles: ['admin', 'operator'],
    items: [
      { to: '/costs', label: 'Cost Overview', icon: DollarSign, end: true },
      { to: '/costs/analysis', label: 'Cost Analysis', icon: BarChart3 },
      { to: '/costs/anomalies', label: 'Anomalies', icon: TrendingUp },
    ],
  },
  {
    title: 'Operations',
    items: [
      { to: '/alerts', label: 'Alerts', icon: Bell, badge: 'alerts' },
      { to: '/alert-rules', label: 'Alert Rules', icon: SlidersHorizontal },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings },
      { to: '/users', label: 'Users', icon: Users, roles: ['admin'] },
    ],
  },
];

interface Props {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: Props) {
  const { hasRole } = useAuth();
  const { data: alertData } = useFetch(() => alertService.list({ status: 'active', limit: 1 }), [], { refreshInterval: 60_000 });
  const criticalCount = alertData?.counts.critical ?? 0;

  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar-brand">
        <span className="brand-mark">
          <Activity size={17} strokeWidth={2.6} />
        </span>
        <div className="brand-text">
          <div className="brand-name">CloudPulse</div>
          <div className="brand-sub">Multi-cloud operations</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {NAV.filter((s) => !s.roles || hasRole(...s.roles)).map((section, i) => (
          <div className="nav-section" key={section.title ?? i}>
            {section.title && <div className="nav-section-title">{section.title}</div>}
            {section.items
              .filter((item) => !item.roles || hasRole(...item.roles))
              .map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} onClick={onNavigate} title={item.label}>
                  <item.icon size={17} strokeWidth={1.9} />
                  <span className="nav-label">{item.label}</span>
                  {item.badge === 'alerts' && criticalCount > 0 && (
                    <span className="nav-badge" aria-label={`${criticalCount} critical alerts`}>
                      {criticalCount}
                    </span>
                  )}
                </NavLink>
              ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="live-dot" aria-hidden />
        <span className="sidebar-footer-text">Live monitoring · v1.0</span>
      </div>
    </aside>
  );
}
