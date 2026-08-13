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

const AUTH_TOKEN_KEY = 'farmpro.authToken';
const AUTH_USER_KEY = 'farmpro.authUser';

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
  window.localStorage.setItem(AUTH_TOKEN_KEY, result.token);
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user));
  return result.user;
}

export function logout(): void {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_USER_KEY);
}

export function getStoredAuthUser(): AuthUser | null {
  const raw = window.localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    window.localStorage.removeItem(AUTH_USER_KEY);
    return null;
  }
}

export function hasAuthToken(): boolean {
  return Boolean(window.localStorage.getItem(AUTH_TOKEN_KEY)?.trim());
}
