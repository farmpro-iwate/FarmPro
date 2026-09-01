import type { Master } from '../types/master';
import { getAuthToken } from './authClient';

type StoredMaster = Master & {
  syncId?: string;
  cloudUpdatedAt?: string;
};

export type SyncedMasterRecord = Omit<Master, 'id'> & {
  id: string;
  legacyId?: number;
  syncId?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `マスター同期に失敗しました（${response.status}）`;
  } catch {
    return `マスター同期に失敗しました（${response.status}）`;
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

export function makeMasterSyncId(master: StoredMaster): string {
  const persistedSyncId = String(master.syncId ?? '').trim();
  if (persistedSyncId) return persistedSyncId;

  const category = String(master.category ?? '').trim();
  const name = String(master.name ?? '').trim().toLocaleLowerCase();
  if (category && name) return `master:${category}:${encodeURIComponent(name)}`;

  return `legacy:${String(master.id)}`;
}

export function toSyncedMasterRecord(master: StoredMaster): SyncedMasterRecord {
  return {
    ...master,
    id: makeMasterSyncId(master),
    legacyId: Number(master.id),
  };
}

export async function fetchSyncedMasterRecords(): Promise<SyncedMasterRecord[]> {
  const response = await fetch('/api/masters/record-sync', {
    headers: authHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<SyncedMasterRecord[]>;
}

export async function pushMasterRecordToSyncStore(
  master: StoredMaster,
): Promise<SyncedMasterRecord> {
  const record = toSyncedMasterRecord(master);
  const response = await fetch(`/api/masters/record-sync/${encodeURIComponent(record.id)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(record),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<SyncedMasterRecord>;
}

export async function deleteMasterRecordFromSyncStore(
  master: StoredMaster,
): Promise<SyncedMasterRecord> {
  const id = makeMasterSyncId(master);
  const response = await fetch(`/api/masters/record-sync/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<SyncedMasterRecord>;
}
