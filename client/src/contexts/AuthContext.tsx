import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthResponse, LoginChallenge, User } from '../types/models';
import { api } from '../api';
import { tokenStore } from '../api/client';
import { getFcmToken, getNativeFcmToken, watchNativeFcmToken } from '../utils/firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  pendingLogin: LoginChallenge | null;
  pendingTwoFactor: string | null;
  login: (identifier: string, password: string) => Promise<void>;
  confirmLogin: (code: string) => Promise<void>;
  completeTwoFactor: (password: string) => Promise<void>;
  resendLogin: () => Promise<void>;
  requestLoginEmail: () => Promise<void>;
  cancelLogin: () => void;
  register: (email: string, username: string, displayName: string, password: string, phone?: string) => Promise<void>;
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
  // Вхід, який очікує 8-значного коду. Токени ще не видані сервером.
  const [pendingLogin, setPendingLogin] = useState<LoginChallenge | null>(null);
  // Короткоживучий токен другого етапу перевірки (якщо увімкнено 2FA).
  const [pendingTwoFactor, setPendingTwoFactor] = useState<string | null>(null);
  // Токен цього пристрою, щоб зняти його при виході з акаунта.
  const pushTokenRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const registerToken = (token: string, platform: string) => {
        if (cancelled) return;
        pushTokenRef.current = token;
        void api.push.register(token, platform).catch(() => undefined);
      };

      const nativeToken = await getNativeFcmToken();
      if (nativeToken) {
        registerToken(nativeToken, 'android');
        // Токен може оновитися без перезапуску застосунку.
        void watchNativeFcmToken((token) => registerToken(token, 'android'));
        return;
      }
      const token = await getFcmToken();
      if (token) registerToken(token, 'web');
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const saveSession = useCallback((session: AuthResponse) => {
    tokenStore.set(session.token, session.refreshToken);
    setUser(session.user);
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const result = await api.auth.login(identifier, password);
    if ('loginRequired' in result) {
      setPendingLogin(result);
      return;
    }
    saveSession(result);
  }, [saveSession]);

  const confirmLogin = useCallback(async (code: string) => {
    if (!pendingLogin) throw new Error('Немає запиту на вхід');
    const result = await api.auth.loginVerify(pendingLogin.challengeId, code);
    if ('twoFactorRequired' in result) {
      setPendingTwoFactor(result.twoFactorToken);
      return;
    }
    saveSession(result);
    setPendingLogin(null);
  }, [pendingLogin, saveSession]);

  const completeTwoFactor = useCallback(async (password: string) => {
    if (!pendingTwoFactor) throw new Error('Немає запиту на другий етап');
    const session = await api.auth.login2fa(pendingTwoFactor, password);
    saveSession(session);
    setPendingLogin(null);
    setPendingTwoFactor(null);
  }, [pendingTwoFactor, saveSession]);

  const resendLogin = useCallback(async () => {
    if (!pendingLogin) return;
    setPendingLogin(await api.auth.loginResend(pendingLogin.challengeId));
  }, [pendingLogin]);

  const requestLoginEmail = useCallback(async () => {
    if (!pendingLogin) return;
    setPendingLogin(await api.auth.loginEmail(pendingLogin.challengeId));
  }, [pendingLogin]);

  const cancelLogin = useCallback(() => { setPendingLogin(null); setPendingTwoFactor(null); }, []);

  const register = useCallback(async (email: string, username: string, displayName: string, password: string, phone?: string) => {
    saveSession(await api.auth.register(email, username, displayName, password, phone));
  }, [saveSession]);

  const logout = useCallback(async () => {
    const pushToken = pushTokenRef.current;
    pushTokenRef.current = null;
    if (pushToken) void api.push.unregister(pushToken).catch(() => undefined);
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

  const value = useMemo(() => ({
    user, loading, pendingLogin, pendingTwoFactor, login, confirmLogin, completeTwoFactor, resendLogin, requestLoginEmail, cancelLogin,
    register, logout, endSession, updateUser: setUser,
  }), [user, loading, pendingLogin, pendingTwoFactor, login, confirmLogin, completeTwoFactor, resendLogin, requestLoginEmail, cancelLogin, register, logout, endSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
