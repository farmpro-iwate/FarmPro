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

type AuthResponse = {
  token: string;
  user: AuthUser;
};

type MeResponse = {
  user: AuthUser;
};

type RegistrationStartResponse = {
  email: string;
  verificationRequired: true;
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

function storeAuth(result: AuthResponse): AuthUser {
  const user = normalizeAuthUser(result.user);
  window.localStorage.setItem(AUTH_TOKEN_KEY, result.token);
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  return user;
}

function storeUser(userInput: Partial<AuthUser>): AuthUser {
  const user = normalizeAuthUser(userInput);
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  return user;
}

export async function startFreeRegistration(input: {
  farmName: string;
  name: string;
  email: string;
  password: string;
}): Promise<RegistrationStartResponse> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      farmName: input.farmName.trim(),
      name: input.name.trim(),
      email: input.email.trim(),
      password: input.password,
    }),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response.json() as Promise<RegistrationStartResponse>;
}

export async function verifyFreeRegistration(email: string, code: string): Promise<AuthUser> {
  const response = await fetch('/api/auth/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), code: code.trim() }),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response));
  return storeAuth(await response.json() as AuthResponse);
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response));
  return storeAuth(await response.json() as AuthResponse);
}

export async function updateAccountProfile(input: { farmName: string; name: string }): Promise<AuthUser> {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');

  const response = await fetch('/api/auth/me', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ farmName: input.farmName.trim(), name: input.name.trim() }),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response));
  const result = await response.json() as MeResponse;
  return storeUser(result.user);
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

    if (response.status === 401) {
      clearAuthSession();
      return null;
    }

    if (!response.ok) return getStoredAuthUser();

    const result = await response.json() as MeResponse;
    return storeUser(result.user);
  } catch {
    return getStoredAuthUser();
  }
}
