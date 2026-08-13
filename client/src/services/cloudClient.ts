import type { FarmProBackup } from '../storage/backup';
import { clearAuthSession, getAuthToken } from './authClient';

export class CloudSnapshotConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudSnapshotConflictError';
  }
}

function requireAuthToken(): string {
  const token = getAuthToken();
  if (!token) {
    throw new Error('クラウド保存を利用するにはログインが必要です。');
  }
  return token;
}

function authHeaders(expectedRevision?: number | null): HeadersInit {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${requireAuthToken()}`,
    'Content-Type': 'application/json',
  };
  if (expectedRevision !== undefined && expectedRevision !== null) {
    headers['X-FarmPro-Cloud-Revision'] = String(expectedRevision);
  }
  return headers;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `クラウド通信に失敗しました（${response.status}）`;
  } catch {
    return `クラウド通信に失敗しました（${response.status}）`;
  }
}

async function assertCloudResponse(response: Response): Promise<void> {
  if (response.ok) return;

  if (response.status === 401) {
    clearAuthSession();
    throw new Error('ログインの有効期限が切れました。もう一度ログインしてください。');
  }

  if (response.status === 409) {
    throw new CloudSnapshotConflictError(await readErrorMessage(response));
  }

  throw new Error(await readErrorMessage(response));
}

export async function uploadCloudSnapshot(
  backup: FarmProBackup,
  expectedRevision?: number | null,
): Promise<{
  savedAt: string;
  revision: number;
  exportedAt: string;
  appVersion: string;
}> {
  const response = await fetch('/api/cloud-snapshots/latest', {
    method: 'PUT',
    headers: authHeaders(expectedRevision),
    body: JSON.stringify(backup),
  });

  await assertCloudResponse(response);
  return response.json();
}

export async function downloadLatestCloudSnapshot(): Promise<{
  savedAt: string;
  revision: number;
  snapshot: FarmProBackup;
} | null> {
  const response = await fetch('/api/cloud-snapshots/latest', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${requireAuthToken()}`,
    },
  });

  await assertCloudResponse(response);
  return response.json();
}
