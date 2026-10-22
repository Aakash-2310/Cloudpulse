import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authService } from '../services/authService';
import { UNAUTHORIZED_EVENT } from '../services/api';
import type { LoginPayload, RegisterPayload, User, UserRole } from '../types/auth';

export interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
  hasRole: (...roles: UserRole[]) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await authService.me());
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  // Any 401 from the API (expired cookie) drops the session; ProtectedRoute redirects to /login.
  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, handler);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const u = await authService.login(payload);
    setUser(u);
    return u;
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const u = await authService.register(payload);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const hasRole = useCallback((...roles: UserRole[]) => Boolean(user && roles.includes(user.role)), [user]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser, setUser, hasRole }),
    [user, loading, login, register, logout, refreshUser, hasRole],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
