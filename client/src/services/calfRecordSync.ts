import { getAuthToken } from './authClient';

export type CalfRecordForSync = {
  id: number;
  calvingId?: string;
  [key: string]: unknown;
};

async function readApiError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `子牛台帳のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `子牛台帳のクラウド同期に失敗しました（${response.status}）`;
  }
}

export async function syncCalfCreatedFromCalving(record: CalfRecordForSync) {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');

  const stableId = record.calvingId
    ? `calving:${record.calvingId}`
    : `local-calf:${record.id}`;

  const response = await fetch(`/api/calves/record-sync/${encodeURIComponent(stableId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...record, id: stableId }),
  });

  if (!response.ok) throw new Error(await readApiError(response));
  return response.json();
}
