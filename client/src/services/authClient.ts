export type AuthUser = {
  id: string;
  farmId: string;
  farmName: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  active: boolean;
};

type LoginResponse = {
  token: string;
  user: AuthUser;
};

const TOKEN_KEY = 'farmpro.auth.token';
const USER_KEY = 'farmpro.auth.user';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getCurrentUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return Boolean(getAuthToken());
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function login(email: string, password: string) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await response.json().catch(() => ({})) as Partial<LoginResponse> & { message?: string };
  if (!response.ok || !body.token || !body.user) {
    throw new Error(body.message || 'ログインできませんでした');
  }

  localStorage.setItem(TOKEN_KEY, body.token);
  localStorage.setItem(USER_KEY, JSON.stringify(body.user));
  return body.user;
}

export function logout() {
  clearAuth();
  window.location.assign('/login');
}

export function installAuthenticatedFetch() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isFarmProApi = url.startsWith('/api/') && !url.startsWith('/api/auth/') && url !== '/api/health';
    if (!isFarmProApi) return originalFetch(input, init);

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const token = getAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await originalFetch(input, { ...init, headers });
    if (response.status === 401) {
      clearAuth();
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return response;
  };
}
