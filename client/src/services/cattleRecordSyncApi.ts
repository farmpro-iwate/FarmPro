import type { Cattle } from '../types/cattle';
import type { StoredRecord } from '../storage/types';
import {
  assertAnimalSyncContext, getAnimalSyncContext, sameAnimalSyncRecord, withAnimalSyncRequest,
  type AnimalSyncContext,
} from './animalRecordSyncSafety';

type StoredCattle = Cattle & StoredRecord & {
  syncId?: string;
};

export type SyncedCattleRecord = Omit<StoredCattle, 'id'> & {
  id: string;
  legacyId?: number;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

export type CattleSyncRequestOptions = {
  context?: AnimalSyncContext;
  ifMatch?: string;
  ifNoneMatch?: boolean;
};

async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `牛台帳の同期に失敗しました（${response.status}）`;
  } catch {
    return `牛台帳の同期に失敗しました（${response.status}）`;
  }
}

function authHeaders(context: AnimalSyncContext) {
  assertAnimalSyncContext(context);
  if (!context.token) throw new Error('ログインが必要です');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${context.token}`,
  };
}

async function request<T>(url: string, init: RequestInit, context: AnimalSyncContext): Promise<T> {
  assertAnimalSyncContext(context);
  return withAnimalSyncRequest(async signal => {
    const response = await fetch(url, { ...init, signal });
    assertAnimalSyncContext(context);
    if (!response.ok) throw new Error(await readApiError(response));
    const result = await response.json() as T;
    assertAnimalSyncContext(context);
    return result;
  });
}

function conditionalHeaders(options: CattleSyncRequestOptions): Record<string, string> {
  return {
    ...(options.ifMatch ? { 'If-Match': JSON.stringify(options.ifMatch) } : {}),
    ...(options.ifNoneMatch ? { 'If-None-Match': '*' } : {}),
  };
}

export function makeCattleSyncId(cattle: StoredCattle): string {
  const persistedSyncId = String(cattle.syncId ?? '').trim();
  if (persistedSyncId) return persistedSyncId;

  const identificationNumber = String(cattle.identificationNumber ?? '').trim();
  if (identificationNumber) return `idn:${identificationNumber}`;
  const earTag = String(cattle.earTag ?? '').trim();
  if (earTag) return `ear:${earTag}`;
  return `legacy:${String(cattle.id)}`;
}

export function toSyncedCattleRecord(cattle: StoredCattle): SyncedCattleRecord {
  const {
    animalSyncOrigin: _origin, animalSyncBase: _base, animalSyncAttempt: _attempt,
    cloudSyncPending: _pending, cloudUpdatedAt: _cloudTime, syncWarning: _warning, ...content
  } = cattle;
  return {
    ...content,
    id: makeCattleSyncId(cattle),
    legacyId: Number(cattle.id),
  };
}

// Normalize only server-defined defaults; retain timestamps, links and unknown fields.
export function sameCattleSyncContent(left: SyncedCattleRecord, right: SyncedCattleRecord): boolean {
  const comparable = (record: SyncedCattleRecord) => {
    const {
      cloudUpdatedAt: _time, cloudSyncPending: _pending, syncId: _syncId,
      animalSyncOrigin: _origin, animalSyncBase: _base, animalSyncAttempt: _attempt,
      syncWarning: _warning, deletedAt: _deleted, ...content
    } = record;
    return {
      ...content, earTag: String(record.earTag ?? '').trim(),
      identificationNumber: String(record.identificationNumber ?? '').trim(),
      name: record.name ?? '', birthday: record.birthday ?? '', sex: record.sex ?? '雌',
      sire: record.sire ?? '', dam: record.dam ?? '', parity: Number(record.parity ?? 0),
      blvStatus: record.blvStatus ?? '未検査', stage: record.stage ?? '繁殖牛', note: record.note ?? '',
    };
  };
  return sameAnimalSyncRecord(comparable(left), comparable(right));
}

export async function fetchSyncedCattleRecords(context = getAnimalSyncContext()): Promise<SyncedCattleRecord[]> {
  const records = await request<SyncedCattleRecord[]>('/api/cattle/record-sync', {
    headers: authHeaders(context),
    cache: 'no-store',
  }, context);
  if (!Array.isArray(records) || records.some(record => !record || typeof record.id !== 'string')) {
    throw new Error('牛台帳のクラウド確認結果が不正です。端末の記録は保持しています。');
  }
  return records;
}

export async function pushCattleRecordToSyncStore(cattle: StoredCattle, options: CattleSyncRequestOptions = {}): Promise<SyncedCattleRecord> {
  const context = options.context ?? getAnimalSyncContext();
  const record = toSyncedCattleRecord(cattle);
  return request(`/api/cattle/record-sync/${encodeURIComponent(record.id)}`, {
    method: 'PUT',
    headers: { ...authHeaders(context), ...conditionalHeaders(options) },
    body: JSON.stringify(record),
  }, context);
}

export async function deleteCattleRecordFromSyncStore(cattle: StoredCattle, options: CattleSyncRequestOptions = {}): Promise<SyncedCattleRecord> {
  const context = options.context ?? getAnimalSyncContext();
  const id = makeCattleSyncId(cattle);
  return request(`/api/cattle/record-sync/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { ...authHeaders(context), ...conditionalHeaders(options) },
  }, context);
}

// Create-only route: refuses existing sync IDs and matching animals (HTTP 409).
export async function createCattleRecordInCloudIfAbsent(cattle: StoredCattle, context = getAnimalSyncContext()): Promise<SyncedCattleRecord> {
  const record = toSyncedCattleRecord(cattle);
  return request('/api/cattle/record-sync/create-only', {
    method: 'POST',
    headers: authHeaders(context),
    body: JSON.stringify(record),
  }, context);
}
