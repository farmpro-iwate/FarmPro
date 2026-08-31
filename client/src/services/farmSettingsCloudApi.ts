import { getAuthToken } from './authClient';

export type FarmSettingsCloudRecord = {
  farmName: string;
  ownerName: string;
  staffName: string;
  phone: string;
  address: string;
  estrousCycleDays: number;
  bullMasters: string[];
  supplierMasters: string[];
  memo: string;
  cloudUpdatedAt?: string;
};

async function readApiError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `農場設定のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `農場設定のクラウド同期に失敗しました（${response.status}）`;
  }
}

function authHeaders() {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchFarmSettingsFromCloud(): Promise<FarmSettingsCloudRecord> {
  const response = await fetch('/api/farm-settings', {
    headers: authHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<FarmSettingsCloudRecord>;
}

export async function saveFarmSettingsToCloud(
  settings: FarmSettingsCloudRecord,
): Promise<FarmSettingsCloudRecord> {
  const response = await fetch('/api/farm-settings', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<FarmSettingsCloudRecord>;
}
