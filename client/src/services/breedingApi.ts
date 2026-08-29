import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import { createMaster, getMasterList } from './masterApi';
import { getAuthToken } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import type { StoredRecord } from '../storage/types';
import type { Breeding, BreedingInput } from '../types/breeding';
import type { MasterCategory } from '../types/master';

type StoredBreeding = Breeding & StoredRecord & {
  id: string | number;
  recordKind?: 'standard';
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
};

function createRecordId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `breeding-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isStandardBreeding(record: StoredRecord): record is StoredBreeding {
  if (record.recordKind === 'standard') return true;

  return 'cowEarTag' in record || 'breedingMethod' in record;
}

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function isCloudRecordNewer(cloud: StoredBreeding, local?: StoredBreeding): boolean {
  if (!local) return true;
  if (local.cloudSyncPending) return false;

  const cloudServerTime = parseTimestamp(cloud.cloudUpdatedAt);
  const localCloudTime = parseTimestamp(local.cloudUpdatedAt);

  if (!Number.isNaN(cloudServerTime)) {
    if (!Number.isNaN(localCloudTime)) return cloudServerTime > localCloudTime;
    return true;
  }

  const cloudUpdatedAt = parseTimestamp(cloud.updatedAt);
  const localUpdatedAt = parseTimestamp(local.updatedAt);
  if (Number.isNaN(cloudUpdatedAt)) return false;
  if (Number.isNaN(localUpdatedAt)) return true;
  return cloudUpdatedAt > localUpdatedAt;
}

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

async function readSyncApiError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `繁殖記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `繁殖記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function resolveMasterId(
  category: MasterCategory,
  name: string,
  currentId?: number,
): Promise<number | undefined> {
  const normalizedName = name.trim();
  if (!normalizedName) return undefined;
  if (currentId) return currentId;

  const masters = await getMasterList(category);
  const existing = masters.find(
    (master) => master.name.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
  );
  if (existing) return existing.id;

  const created = await createMaster({ category, name: normalizedName });
  return created.id;
}

async function withResolvedBreedingMasters(input: BreedingInput): Promise<BreedingInput> {
  if (input.breedingMethod !== '種付') return input;

  const bullName = input.bullName.trim();
  const inseminatorName = input.inseminatorName.trim();
  const bullMasterId = await resolveMasterId('sire', bullName, input.bullMasterId);
  const inseminatorMasterId = await resolveMasterId('inseminator', inseminatorName, input.inseminatorMasterId);

  return {
    ...input,
    bullName,
    bullMasterId,
    inseminatorName,
    inseminatorMasterId,
  };
}

async function pushSavedBreedingRecord(record: StoredBreeding): Promise<StoredBreeding> {
  if (!shouldUseCloudSync()) return record;

  const synced = await syncBreedingRecordToCloud(record) as StoredBreeding;
  return saveRecordPreservingTimestamps<StoredBreeding>('breedings', {
    ...record,
    ...synced,
    id: record.id,
    recordKind: 'standard',
    cloudSyncPending: false,
  });
}

export async function getBreedingList(): Promise<Breeding[]> {
  if (shouldUseCloudSync()) {
    try {
      await pullNewerBreedingRecordsFromCloud();
    } catch (error) {
      console.warn('繁殖記録のクラウド取り込みをスキップしました', error);
    }
  }

  const records = await getAllRecords<StoredRecord>('breedings');
  return records.filter(isStandardBreeding);
}

export async function getBreeding(id: string | number): Promise<Breeding> {
  const record = await getRecordById<StoredRecord>('breedings', id);

  if (!record || !isStandardBreeding(record)) {
    throw new Error('指定された繁殖記録が見つかりません。');
  }

  return record;
}

export async function createBreeding(input: BreedingInput): Promise<Breeding> {
  const resolvedInput = await withResolvedBreedingMasters(input);
  const record: StoredBreeding = {
    ...resolvedInput,
    id: createRecordId(),
    recordKind: 'standard',
    cloudSyncPending: shouldUseCloudSync(),
  };

  const saved = await saveRecord('breedings', record);
  return pushSavedBreedingRecord(saved);
}

export async function updateBreeding(
  id: string | number,
  input: BreedingInput,
): Promise<Breeding> {
  const existing = await getRecordById<StoredRecord>('breedings', id);

  if (!existing || !isStandardBreeding(existing)) {
    throw new Error('更新する繁殖記録が見つかりません。');
  }

  const resolvedInput = await withResolvedBreedingMasters(input);

  const saved = await saveRecord('breedings', {
    ...existing,
    ...resolvedInput,
    id,
    recordKind: 'standard',
    createdAt: existing.createdAt,
    cloudSyncPending: shouldUseCloudSync(),
  } as StoredBreeding);
  return pushSavedBreedingRecord(saved);
}

export async function syncBreedingRecordToCloud(record: Breeding): Promise<Breeding> {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');

  const response = await fetch(`/api/breeding/record-sync/${encodeURIComponent(String(record.id))}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(record),
  });

  if (!response.ok) throw new Error(await readSyncApiError(response));
  return response.json() as Promise<Breeding>;
}

export async function pullNewerBreedingRecordsFromCloud(): Promise<number> {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');

  const response = await fetch('/api/breeding/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await readSyncApiError(response));

  const cloudRecords = await response.json() as StoredBreeding[];
  const localRecords = (await getAllRecords<StoredRecord>('breedings')).filter(isStandardBreeding);
  const localById = new Map(localRecords.map((item) => [String(item.id), item]));
  let applied = 0;

  for (const cloudRecord of cloudRecords) {
    const localRecord = localById.get(String(cloudRecord.id));
    if (!isCloudRecordNewer(cloudRecord, localRecord)) continue;

    const saved = await saveRecordPreservingTimestamps<StoredBreeding>('breedings', {
      ...cloudRecord,
      recordKind: 'standard',
      cloudSyncPending: false,
    });
    localById.set(String(saved.id), saved);
    applied += 1;
  }

  return applied;
}

export async function deleteBreeding(id: string | number): Promise<void> {
  const existing = await getRecordById<StoredRecord>('breedings', id);

  if (!existing || !isStandardBreeding(existing)) {
    throw new Error('削除する繁殖記録が見つかりません。');
  }

  await deleteRecord('breedings', id);
}
