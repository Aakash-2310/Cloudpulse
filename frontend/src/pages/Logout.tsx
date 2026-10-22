import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { PageLoader } from '../components/LoadingSpinner';

export default function Logout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    logout().finally(() => navigate('/login', { replace: true }));
  }, [logout, navigate]);
  return <PageLoader label="Signing out…" />;
}
