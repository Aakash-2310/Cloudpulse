import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, User as UserIcon } from 'lucide-react';
import GlobalSearch from './GlobalSearch';
import NotificationCenter from './NotificationCenter';
import { useAuth } from '../hooks/useAuth';
import { usePreferences } from '../hooks/usePreferences';
import { ENVIRONMENTS, ROLE_LABELS } from '../utils/constants';
import { initials } from '../utils/formatters';

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenMobile: () => void;
}

export default function Navbar({ collapsed, onToggleCollapse, onOpenMobile }: Props) {
  const { user } = useAuth();
  const { theme, toggleTheme, environment, setEnvironment } = usePreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  return (
    <header className="navbar">
      <button className="icon-btn ghost mobile-only" onClick={onOpenMobile} aria-label="Open navigation">
        <Menu size={18} />
      </button>
      <button className="icon-btn ghost desktop-only" onClick={onToggleCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} data-desktop-collapse>
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>
      <GlobalSearch />
      <div className="navbar-spacer" />
      <div className="navbar-actions">
        <label className="row small muted">
          <span className="env-label">Environment</span>
          <select className="select env-select" value={environment} onChange={(e) => setEnvironment(e.target.value)} aria-label="Environment">
            {ENVIRONMENTS.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-btn ghost" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title="Toggle theme">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <NotificationCenter />
        <div className="dropdown-wrap" ref={menuRef}>
          <button className="user-chip" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-label="Account menu">
            {user?.avatar ? <img className="avatar" src={user.avatar} alt="" /> : <span className="avatar">{initials(user?.name ?? '?')}</span>}
            <span className="user-meta">
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{user ? ROLE_LABELS[user.role] : ''}</div>
            </span>
          </button>
          {menuOpen && (
            <div className="popover dropdown" style={{ padding: 4, minWidth: 240 }} role="menu">
              <div className="menu-header">
                <div className="bold">{user?.name}</div>
                <div className="xs muted">{user?.email}</div>
              </div>
              <div style={{ padding: 4 }}>
                <Link to="/settings" className="menu-item" onClick={() => setMenuOpen(false)} role="menuitem">
                  <UserIcon size={15} /> Profile
                </Link>
                <Link to="/settings?tab=preferences" className="menu-item" onClick={() => setMenuOpen(false)} role="menuitem">
                  <Settings size={15} /> Preferences
                </Link>
                <div className="menu-divider" />
                <button
                  className="menu-item danger"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate('/logout');
                  }}
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
