const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
const BASE_PATH = import.meta.env.BASE_URL || '/';
const TOKEN_KEY = 'relay.token';
const REFRESH_KEY = 'relay.refreshToken';

/** Абсолютний origin API — потрібний для сокета та файлів користувачів. */
export const API_ORIGIN = API_URL.startsWith('http') ? new URL(API_URL).origin : '';

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export const tokenStore = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get refreshToken() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(token: string, refreshToken: string) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  auth?: boolean;
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = tokenStore.refreshToken;
    if (!refreshToken) return null;
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) throw new Error('Refresh failed');
      const data = await response.json() as { token: string; refreshToken: string };
      tokenStore.set(data.token, data.refreshToken);
      return data.token;
    } catch {
      tokenStore.clear();
      window.dispatchEvent(new Event('auth:expired'));
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function request<T>(path: string, options: RequestOptions = {}, canRetry = true): Promise<T> {
  const { body, auth = true, headers: customHeaders, ...init } = options;
  const headers = new Headers(customHeaders);
  const token = tokenStore.token;
  if (auth && token) headers.set('Authorization', `Bearer ${token}`);

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers, body: payload });
  if (response.status === 401 && auth && canRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) return request<T>(path, options, false);
  }

  if (!response.ok) {
    let message = `Помилка запиту (${response.status})`;
    let details: unknown;
    try {
      const data = await response.json() as { message?: string; error?: string | { message?: string } };
      details = data;
      message = data.message
        || (typeof data.error === 'string' ? data.error : data.error?.message)
        || message;
    } catch {
      // Non-JSON errors still get a useful HTTP status message.
    }
    throw new ApiError(message, response.status, details);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Файл з client/public: додає базовий префікс, потрібний для GitHub Pages. */
export function publicAsset(path: string): string {
  if (/^(https?:|blob:|data:|\/\/)/.test(path)) return path;
  return `${BASE_PATH}${path.replace(/^\//, '')}`;
}

export function assetUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|blob:|data:)/.test(url)) return url;
  // Завантаження користувачів live на сервері, решта — у збірці клієнта.
  if (url.startsWith('/uploads/')) return API_ORIGIN ? `${API_ORIGIN}${url}` : url;
  return publicAsset(url);
}
