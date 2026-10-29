import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../api';
import { tokenStore } from '../api/client';
import type { AuthResponse, User } from '../types/models';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (email: string, username: string, displayName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  endSession: (reason?: string) => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Пояснення примусового виходу, яке показує сторінка входу після роз'єднання. */
export const SESSION_NOTICE_KEY = 'miston.sessionNotice';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      if (!tokenStore.token && !tokenStore.refreshToken) {
        setLoading(false);
        return;
      }
      try {
        const { user: currentUser } = await api.auth.me();
        if (active) setUser(currentUser);
      } catch {
        tokenStore.clear();
      } finally {
        if (active) setLoading(false);
      }
    }
    void bootstrap();
    const expire = () => setUser(null);
    window.addEventListener('auth:expired', expire);
    return () => {
      active = false;
      window.removeEventListener('auth:expired', expire);
    };
  }, []);

  const saveSession = useCallback((session: AuthResponse) => {
    tokenStore.set(session.token, session.refreshToken);
    setUser(session.user);
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    saveSession(await api.auth.login(identifier, password));
  }, [saveSession]);

  const register = useCallback(async (email: string, username: string, displayName: string, password: string) => {
    saveSession(await api.auth.register(email, username, displayName, password));
  }, [saveSession]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      tokenStore.clear();
      setUser(null);
    }
  }, []);

  const endSession = useCallback((reason?: string) => {
    if (reason) sessionStorage.setItem(SESSION_NOTICE_KEY, reason);
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout, endSession, updateUser: setUser }), [user, loading, login, register, logout, endSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
