import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import { createMaster, getMasterList } from './masterApi';
import { getAuthToken } from './authClient';
import { deleteExpenseBySource, upsertExpenseBySource } from './expensesApi';
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
  cloudRecordId?: string | number;
};

export class DuplicateBreedingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateBreedingError';
  }
}

function normalizeText(value?: string) {
  return (value || '').trim().toLocaleLowerCase();
}

function sameCow(a?: string, b?: string) {
  return normalizeText(a) !== '' && normalizeText(a) === normalizeText(b);
}

function isDuplicateHeat(input: BreedingInput, existing: StoredBreeding) {
  if (!input.heatDate) return false;
  return sameCow(input.cowEarTag, existing.cowEarTag) && input.heatDate === existing.heatDate;
}

function isDuplicateInsemination(input: BreedingInput, existing: StoredBreeding) {
  if (input.breedingMethod !== '種付' || !input.inseminationDate) return false;
  if (!sameCow(input.cowEarTag, existing.cowEarTag)) return false;
  if (input.inseminationDate !== existing.inseminationDate) return false;
  return normalizeText(input.bullName) === normalizeText(existing.bullName);
}

async function ensureNoDuplicateBreeding(input: BreedingInput, excludeId?: string | number) {
  const records = (await getAllRecords<StoredRecord>('breedings')).filter(isStandardBreeding);
  const candidates = excludeId === undefined
    ? records
    : records.filter((record) => String(record.id) !== String(excludeId));

  if (input.breedingMethod === '未選択' && candidates.some((record) => isDuplicateHeat(input, record))) {
    throw new DuplicateBreedingError('同じ牛・同じ発情日の記録がすでにあります。重複登録はできません。');
  }

  if (input.breedingMethod === '種付' && candidates.some((record) => isDuplicateInsemination(input, record))) {
    throw new DuplicateBreedingError('同じ牛・同じ種付日・同じ種雄牛の記録がすでにあります。重複登録はできません。');
  }
}

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

function syncIdentity(record: Pick<StoredBreeding, 'cowEarTag' | 'breedingMethod' | 'inseminationDate' | 'transferDate' | 'heatDate'>) {
  const performedDate = record.breedingMethod === '受精卵移植'
    ? record.transferDate
    : record.inseminationDate;
  return [
    record.cowEarTag?.trim() || '',
    record.breedingMethod?.trim() || '',
    performedDate?.trim() || '',
    record.heatDate?.trim() || '',
  ].join('|');
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
    cloudRecordId: synced.id,
    cloudSyncPending: false,
  });
}

async function syncBreedingExpenses(record: Breeding): Promise<void> {
  const sourceId = String(record.id);
  const common = {
    expenseCategoryMasterId: undefined,
    vendorMasterId: undefined,
    paymentMethod: '',
    target: `${record.cowEarTag} ${record.cowName}`.trim(),
    animalType: 'cattle' as const,
    animalEarTag: record.cowEarTag,
    animalName: record.cowName,
    sourceType: 'breeding' as const,
    sourceId,
    memo: `繁殖記録から自動作成（繁殖記録ID: ${sourceId}）`,
  };

  const inseminationCost = Number(record.inseminationCost || 0);
  if (record.breedingMethod === '種付' && inseminationCost > 0) {
    await upsertExpenseBySource({
      ...common,
      category: '種付け・繁殖費',
      sourceDetail: 'insemination',
      paymentDate: record.inseminationDate || record.heatDate || '',
      description: '人工授精・種付費',
      vendor: record.inseminatorName || '',
      amount: String(inseminationCost),
    });
  } else {
    await deleteExpenseBySource('breeding', sourceId, '種付け・繁殖費', 'insemination');
  }

  const transferCost = Number(record.transferCost || 0);
  if (record.breedingMethod === '受精卵移植' && transferCost > 0) {
    await upsertExpenseBySource({
      ...common,
      category: '種付け・繁殖費',
      sourceDetail: 'transfer',
      paymentDate: record.transferDate || record.transferPlannedDate || '',
      description: '受精卵移植（ET）費',
      vendor: record.transferTechnician || record.supplierName || '',
      amount: String(transferCost),
    });
  } else {
    await deleteExpenseBySource('breeding', sourceId, '種付け・繁殖費', 'transfer');
  }

  const pregnancyCheckCost = Number(record.pregnancyCheckCost || 0);
  if (pregnancyCheckCost > 0) {
    await upsertExpenseBySource({
      ...common,
      category: '診療費',
      sourceDetail: 'pregnancy-check',
      paymentDate: record.pregnancyCheckDate || record.pregnancyCheckExpectedDate || '',
      description: '妊娠鑑定（診療費）',
      vendor: '',
      amount: String(pregnancyCheckCost),
    });
  } else {
    await deleteExpenseBySource('breeding', sourceId, '診療費', 'pregnancy-check');
  }
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
  await ensureNoDuplicateBreeding(input);
  const resolvedInput = await withResolvedBreedingMasters(input);
  const record: StoredBreeding = {
    ...resolvedInput,
    id: createRecordId(),
    recordKind: 'standard',
    cloudSyncPending: shouldUseCloudSync(),
  };

  const saved = await saveRecord('breedings', record);
  const synced = await pushSavedBreedingRecord(saved);
  await syncBreedingExpenses(synced);
  return synced;
}

export async function updateBreeding(
  id: string | number,
  input: BreedingInput,
): Promise<Breeding> {
  const existing = await getRecordById<StoredRecord>('breedings', id);

  if (!existing || !isStandardBreeding(existing)) {
    throw new Error('更新する繁殖記録が見つかりません。');
  }

  await ensureNoDuplicateBreeding(input, id);
  const resolvedInput = await withResolvedBreedingMasters(input);

  const saved = await saveRecord('breedings', {
    ...existing,
    ...resolvedInput,
    id,
    recordKind: 'standard',
    createdAt: existing.createdAt,
    cloudSyncPending: shouldUseCloudSync(),
  } as StoredBreeding);
  const synced = await pushSavedBreedingRecord(saved);
  await syncBreedingExpenses(synced);
  return synced;
}

export async function syncBreedingRecordToCloud(record: Breeding): Promise<Breeding> {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');

  const storedRecord = record as StoredBreeding;
  const cloudId = storedRecord.cloudRecordId ?? record.id;
  const response = await fetch(`/api/breedings/record-sync/${encodeURIComponent(String(cloudId))}`, {
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

  const response = await fetch('/api/breedings/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await readSyncApiError(response));

  const cloudRecords = await response.json() as StoredBreeding[];
  const localRecords = (await getAllRecords<StoredRecord>('breedings')).filter(isStandardBreeding);
  const localById = new Map(localRecords.map((item) => [String(item.id), item]));
  const localByCloudId = new Map(
    localRecords
      .filter((item) => item.cloudRecordId !== undefined && item.cloudRecordId !== '')
      .map((item) => [String(item.cloudRecordId), item]),
  );
  const localByIdentity = new Map(localRecords.map((item) => [syncIdentity(item), item]));
  let applied = 0;

  for (const cloudRecord of cloudRecords) {
    const cloudId = String(cloudRecord.id);
    const localRecord = localByCloudId.get(cloudId)
      ?? localById.get(cloudId)
      ?? localByIdentity.get(syncIdentity(cloudRecord));

    if (!isCloudRecordNewer(cloudRecord, localRecord)) continue;

    const localId = localRecord?.id ?? cloudRecord.id;
    const saved = await saveRecordPreservingTimestamps<StoredBreeding>('breedings', {
      ...cloudRecord,
      id: localId,
      recordKind: 'standard',
      cloudRecordId: cloudRecord.id,
      cloudSyncPending: false,
    });
    localById.set(String(saved.id), saved);
    localByCloudId.set(cloudId, saved);
    localByIdentity.set(syncIdentity(saved), saved);
    applied += 1;
  }

  return applied;
}

export async function deleteBreeding(id: string | number): Promise<void> {
  const existing = await getRecordById<StoredRecord>('breedings', id);

  if (!existing || !isStandardBreeding(existing)) {
    throw new Error('削除する繁殖記録が見つかりません。');
  }

  if (shouldUseCloudSync()) {
    const token = getAuthToken();
    if (!token) throw new Error('ログインが必要です');

    const cloudId = existing.cloudRecordId ?? existing.id;
    const response = await fetch(`/api/breedings/${encodeURIComponent(String(cloudId))}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(await readSyncApiError(response));
    }
  }

  await deleteExpenseBySource('breeding', String(existing.id), '種付け・繁殖費', 'insemination');
  await deleteExpenseBySource('breeding', String(existing.id), '種付け・繁殖費', 'transfer');
  await deleteExpenseBySource('breeding', String(existing.id), '診療費', 'pregnancy-check');
  await deleteRecord('breedings', id);
}
