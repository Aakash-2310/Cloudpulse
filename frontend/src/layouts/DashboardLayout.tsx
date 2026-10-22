import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import { PageLoader } from '../components/LoadingSpinner';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem('cp-sidebar-collapsed') === '1';
  } catch {
    return false;
  }
}

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('cp-sidebar-collapsed', c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  return (
    <div className={`app-shell ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <Sidebar onNavigate={() => setMobileOpen(false)} />
      <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-hidden />
      <div className="app-main">
        <Navbar collapsed={collapsed} onToggleCollapse={toggleCollapse} onOpenMobile={() => setMobileOpen(true)} />
        <main className="app-content" id="main">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
