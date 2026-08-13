import type { FarmProPlanId } from '../plans/policy';

export type AuthUser = {
  id: string;
  farmId: string;
  farmName: string;
  name: string;
  email: string;
  role: 'owner' | 'member';
  active: boolean;
  plan: FarmProPlanId;
};

type LoginResponse = {
  token: string;
  user: AuthUser;
};

type MeResponse = {
  user: AuthUser;
};

const AUTH_TOKEN_KEY = 'farmpro.authToken';
const AUTH_USER_KEY = 'farmpro.authUser';

function normalizeAuthUser(user: Partial<AuthUser>): AuthUser {
  return {
    ...user,
    plan: user.plan === 'standard' || user.plan === 'pro' ? user.plan : 'free',
  } as AuthUser;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `認証に失敗しました（${response.status}）`;
  } catch {
    return `認証に失敗しました（${response.status}）`;
  }
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const result = await response.json() as LoginResponse;
  const user = normalizeAuthUser(result.user);
  window.localStorage.setItem(AUTH_TOKEN_KEY, result.token);
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  return user;
}

export function clearAuthSession(): void {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
}

export function logout(): void {
  clearAuthSession();
}

export function getAuthToken(): string | null {
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY)?.trim() ?? '';
  return token || null;
}

export function getStoredAuthUser(): AuthUser | null {
  const raw = window.localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeAuthUser(parsed);
  } catch {
    window.localStorage.removeItem(AUTH_USER_KEY);
    return null;
  }
}

export function hasAuthToken(): boolean {
  return Boolean(getAuthToken());
}

export async function refreshAuthUser(): Promise<AuthUser | null> {
  const token = getAuthToken();
  if (!token) return null;

  try {
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401 || response.status === 403) {
      clearAuthSession();
      return null;
    }

    if (!response.ok) {
      return getStoredAuthUser();
    }

    const result = await response.json() as MeResponse;
    const user = normalizeAuthUser(result.user);
    window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    return user;
  } catch {
    return getStoredAuthUser();
  }
}
