import type { FarmProBackup } from '../storage/backup';

const AUTH_TOKEN_KEY = 'farmpro.authToken';

function getAuthToken(): string {
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY)?.trim() ?? '';
  if (!token) {
    throw new Error('クラウド保存を利用するにはログインが必要です。');
  }
  return token;
}

function authHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${getAuthToken()}`,
    'Content-Type': 'application/json',
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `クラウド通信に失敗しました（${response.status}）`;
  } catch {
    return `クラウド通信に失敗しました（${response.status}）`;
  }
}

export async function uploadCloudSnapshot(backup: FarmProBackup): Promise<{
  savedAt: string;
  exportedAt: string;
  appVersion: string;
}> {
  const response = await fetch('/api/cloud-snapshots/latest', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(backup),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
}

export async function downloadLatestCloudSnapshot(): Promise<{
  savedAt: string;
  snapshot: FarmProBackup;
} | null> {
  const response = await fetch('/api/cloud-snapshots/latest', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
}
