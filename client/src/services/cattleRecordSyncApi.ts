import type { Cattle } from '../types/cattle';
import type { StoredRecord } from '../storage/types';
import { getAuthToken } from './authClient';

type StoredCattle = Cattle & StoredRecord;

export type SyncedCattleRecord = Omit<StoredCattle, 'id'> & {
  id: string;
  legacyId?: number;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `牛台帳の同期に失敗しました（${response.status}）`;
  } catch {
    return `牛台帳の同期に失敗しました（${response.status}）`;
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

export function makeCattleSyncId(cattle: StoredCattle): string {
  const identificationNumber = String(cattle.identificationNumber ?? '').trim();
  if (identificationNumber) return `idn:${identificationNumber}`;
  const earTag = String(cattle.earTag ?? '').trim();
  if (earTag) return `ear:${earTag}`;
  return `legacy:${String(cattle.id)}`;
}

export function toSyncedCattleRecord(cattle: StoredCattle): SyncedCattleRecord {
  return {
    ...cattle,
    id: makeCattleSyncId(cattle),
    legacyId: Number(cattle.id),
  };
}

export async function fetchSyncedCattleRecords(): Promise<SyncedCattleRecord[]> {
  const response = await fetch('/api/cattle/record-sync', {
    headers: authHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<SyncedCattleRecord[]>;
}

export async function pushCattleRecordToSyncStore(cattle: StoredCattle): Promise<SyncedCattleRecord> {
  const record = toSyncedCattleRecord(cattle);
  const response = await fetch(`/api/cattle/record-sync/${encodeURIComponent(record.id)}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(record),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<SyncedCattleRecord>;
}

export async function deleteCattleRecordFromSyncStore(cattle: StoredCattle): Promise<SyncedCattleRecord> {
  const id = makeCattleSyncId(cattle);
  const response = await fetch(`/api/cattle/record-sync/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<SyncedCattleRecord>;
}
