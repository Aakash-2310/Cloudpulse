import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { PageLoader } from './LoadingSpinner';
import EmptyState from './EmptyState';
import type { UserRole } from '../types/auth';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

/** Renders children only for the given roles; shows an access notice otherwise. */
export function RoleGate({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { hasRole } = useAuth();
  if (!hasRole(...roles)) {
    return (
      <div className="card">
        <EmptyState
          icon={<ShieldAlert size={20} />}
          title="You don’t have access to this page"
          description={`This area is available to: ${roles.join(', ')}. Ask an administrator if you need access.`}
        />
      </div>
    );
  }
  return <>{children}</>;
}

/** Inline helper: render only when the user has one of the roles. */
export function IfRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { hasRole } = useAuth();
  return hasRole(...roles) ? <>{children}</> : null;
}
