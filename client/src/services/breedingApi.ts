import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import { createMaster, getMasterList } from './masterApi';
import { getAuthToken } from './authClient';
import type { StoredRecord } from '../storage/types';
import type { Breeding, BreedingInput } from '../types/breeding';
import type { MasterCategory } from '../types/master';

type StoredBreeding = Breeding & StoredRecord & {
  id: string | number;
  recordKind?: 'standard';
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

function isCloudRecordNewer(cloud: StoredBreeding, local?: StoredBreeding): boolean {
  if (!local) return true;
  const cloudUpdatedAt = typeof cloud.updatedAt === 'string' ? Date.parse(cloud.updatedAt) : Number.NaN;
  const localUpdatedAt = typeof local.updatedAt === 'string' ? Date.parse(local.updatedAt) : Number.NaN;
  if (Number.isNaN(cloudUpdatedAt)) return false;
  if (Number.isNaN(localUpdatedAt)) return true;
  return cloudUpdatedAt > localUpdatedAt;
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

export async function getBreedingList(): Promise<Breeding[]> {
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
  };

  return saveRecord('breedings', record);
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

  return saveRecord('breedings', {
    ...existing,
    ...resolvedInput,
    id,
    recordKind: 'standard',
    createdAt: existing.createdAt,
  } as StoredBreeding);
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
    await saveRecordPreservingTimestamps<StoredBreeding>('breedings', {
      ...cloudRecord,
      recordKind: 'standard',
    });
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
