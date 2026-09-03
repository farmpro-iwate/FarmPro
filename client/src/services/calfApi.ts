import { Calf, CalfInput } from '../types/calf';
import { Cattle, CattleSex } from '../types/cattle';
import { createCattle } from './api';
import { getAuthToken } from './authClient';
import { syncCalfCreatedFromCalving } from './calfRecordSync';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import type { StoredRecord } from '../storage/types';

type StoredCalf = Calf & StoredRecord & {
  calvingId?: string;
  birthDate?: string;
  earTag?: string;
  motherCowName?: string;
  recipientCowId?: string;
  recipientCowName?: string;
  geneticMotherCowId?: string;
  memo?: string;
  cloudUpdatedAt?: string;
};

type CloudCalfRecord = Partial<StoredCalf> & {
  id: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

function normalizeInput(input: CalfInput): CalfInput {
  return {
    ...input,
    calfNumber: input.calfNumber.trim(),
    identificationNumber: input.identificationNumber.trim(),
    name: input.name.trim(),
    motherName: input.motherName.trim(),
    note: input.note.trim(),
  };
}

function normalizeCattleSex(sex?: string): CattleSex {
  if (sex === '雄' || sex === 'オス') return '雄';
  if (sex === '去勢') return '去勢';
  return '雌';
}

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function parseCalfId(id: string) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error('指定された子牛が見つかりません。');
  }
  return numericId;
}

function calfSyncId(record: Pick<StoredCalf, 'id' | 'calvingId'>) {
  return record.calvingId ? `calving:${record.calvingId}` : `local-calf:${record.id}`;
}

function cloudRecordIsNewer(cloud: CloudCalfRecord, local: StoredCalf) {
  const cloudServerTime = parseTimestamp(cloud.cloudUpdatedAt);
  const localCloudTime = parseTimestamp(local.cloudUpdatedAt);

  if (!Number.isNaN(cloudServerTime)) {
    if (Number.isNaN(localCloudTime)) return true;
    return cloudServerTime > localCloudTime;
  }

  const cloudTime = parseTimestamp(cloud.updatedAt);
  const localTime = parseTimestamp(local.updatedAt);
  if (Number.isNaN(cloudTime)) return false;
  if (Number.isNaN(localTime)) return true;
  return cloudTime > localTime;
}

async function syncExistingCalfIfEnabled(record: StoredCalf) {
  if (!shouldUseCloudSync()) return;
  try {
    const synced = await syncCalfCreatedFromCalving({ ...record, memo: record.note ?? '' }) as CloudCalfRecord;
    if (synced.cloudUpdatedAt) {
      await saveRecordPreservingTimestamps<StoredCalf>('calves', {
        ...record,
        memo: record.note ?? '',
        cloudUpdatedAt: synced.cloudUpdatedAt,
      });
    }
  } catch (error) {
    console.warn('子牛台帳は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

async function readCloudSyncError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `子牛台帳のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `子牛台帳のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function syncCalfDeletionToCloud(record: StoredCalf) {
  if (!shouldUseCloudSync()) return;
  const token = getAuthToken();
  if (!token) return;

  const response = await fetch(`/api/calves/record-sync/${encodeURIComponent(calfSyncId(record))}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await readCloudSyncError(response));
}

function normalizeCloudCalf(record: CloudCalfRecord, id: number): StoredCalf {
  const birthday = String(record.birthday || record.birthDate || '');
  const motherName = String(record.motherName || record.motherCowName || '');
  const note = record.note !== undefined
    ? String(record.note)
    : String(record.memo || '');

  return {
    ...record,
    id,
    calfNumber: String(record.calfNumber || record.earTag || ''),
    temporaryCalfNumber: record.temporaryCalfNumber,
    identificationNumber: String(record.identificationNumber || ''),
    name: String(record.name || '耳標未装着'),
    birthday,
    birthDate: birthday,
    sex: String(record.sex || '不明'),
    motherName,
    geneticMotherCowName: record.geneticMotherCowName,
    recipientCowName: record.recipientCowName,
    sireName: record.sireName,
    startWeight: Number(record.startWeight || 0),
    currentWeight: Number(record.currentWeight || 0),
    elapsedDays: Number(record.elapsedDays || 0),
    milkAmount: Number(record.milkAmount || 0),
    starterAmount: Number(record.starterAmount || 0),
    feedingMethod: record.feedingMethod || '人工哺育',
    weaningPlannedDate: String(record.weaningPlannedDate || ''),
    weaningDate: String(record.weaningDate || ''),
    weaningStatus: record.weaningStatus || '離乳前',
    weaningWeight: Number(record.weaningWeight || 0),
    weaningStarterAmount: Number(record.weaningStarterAmount || 0),
    milkEndDate: String(record.milkEndDate || ''),
    managementStatus: record.managementStatus || '育成中',
    promotedCattleId: record.promotedCattleId,
    promotedAt: record.promotedAt,
    note,
    memo: note,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    cloudUpdatedAt: record.cloudUpdatedAt,
    calvingId: record.calvingId,
  };
}

function fallbackKey(record: Partial<StoredCalf>) {
  return `${record.birthday || record.birthDate || ''}|${record.motherName || record.motherCowName || ''}|${record.sex || ''}`;
}

async function pullCalfChangesFromCloud(): Promise<number> {
  if (!shouldUseCloudSync()) return 0;

  const token = getAuthToken();
  if (!token) return 0;

  const response = await fetch('/api/calves/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readCloudSyncError(response));

  const cloudRecords = await response.json() as CloudCalfRecord[];
  const localRecords = await getAllRecords<StoredCalf>('calves');
  const localByCalvingId = new Map(
    localRecords
      .filter((item) => item.calvingId)
      .map((item) => [String(item.calvingId), item]),
  );
  const localByFallbackKey = new Map(localRecords.map((item) => [fallbackKey(item), item]));
  const localFallbackKeys = new Set(localByFallbackKey.keys());
  let nextId = localRecords.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  let applied = 0;

  for (const cloudRecord of cloudRecords) {
    const calvingId = String(cloudRecord.calvingId || '').trim();
    const cloudFallbackKey = fallbackKey(cloudRecord);
    const localRecord = calvingId
      ? localByCalvingId.get(calvingId)
      : localByFallbackKey.get(cloudFallbackKey);

    if (cloudRecord.deletedAt) {
      if (!localRecord) continue;
      await deleteRecord('calves', localRecord.id);
      if (calvingId) localByCalvingId.delete(calvingId);
      localByFallbackKey.delete(cloudFallbackKey);
      localFallbackKeys.delete(cloudFallbackKey);
      applied += 1;
      continue;
    }

    if (localRecord) {
      if (!cloudRecordIsNewer(cloudRecord, localRecord)) continue;
      const saved = await saveRecordPreservingTimestamps<StoredCalf>(
        'calves',
        normalizeCloudCalf(cloudRecord, localRecord.id),
      );
      if (calvingId) localByCalvingId.set(calvingId, saved);
      localByFallbackKey.set(fallbackKey(saved), saved);
      applied += 1;
      continue;
    }

    if (localFallbackKeys.has(cloudFallbackKey)) continue;

    const saved = await saveRecordPreservingTimestamps<StoredCalf>(
      'calves',
      normalizeCloudCalf(cloudRecord, nextId++),
    );
    if (calvingId) localByCalvingId.set(calvingId, saved);
    localByFallbackKey.set(fallbackKey(saved), saved);
    localFallbackKeys.add(fallbackKey(saved));
    applied += 1;
  }

  return applied;
}

async function validateCalfUniqueness(input: CalfInput, currentId?: number) {
  const calves = await getAllRecords<StoredCalf>('calves');

  const duplicateEarTag = calves.find(
    (item) => item.id !== currentId && item.calfNumber.trim() === input.calfNumber,
  );
  if (duplicateEarTag) {
    throw new Error(`耳標番号「${input.calfNumber}」はすでに子牛台帳へ登録されています。`);
  }

  if (input.identificationNumber) {
    const duplicateIdentificationNumber = calves.find(
      (item) =>
        item.id !== currentId &&
        (item.identificationNumber ?? '').trim() === input.identificationNumber,
    );
    if (duplicateIdentificationNumber) {
      throw new Error(
        `個体識別番号「${input.identificationNumber}」はすでに子牛台帳へ登録されています。`,
      );
    }
  }
}

export async function getCalfList() {
  try {
    await pullCalfChangesFromCloud();
  } catch (error) {
    console.warn('子牛台帳のクラウド取り込みをスキップしました', error);
  }
  return getAllRecords<StoredCalf>('calves');
}

export async function getCalf(id: string) {
  const numericId = parseCalfId(id);
  const calf = await getRecordById<StoredCalf>('calves', numericId);
  if (!calf) throw new Error('指定された子牛が見つかりません。');
  return calf;
}

export async function createCalf(input: CalfInput) {
  const normalized = normalizeInput(input);
  const calves = await getAllRecords<StoredCalf>('calves');
  const nextId = calves.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const temporaryCalfNumber = normalized.calfNumber ? undefined : `TEMP-MANUAL-${nextId}`;
  const prepared: CalfInput = {
    ...normalized,
    calfNumber: normalized.calfNumber || temporaryCalfNumber || '',
    name: normalized.name || '耳標未装着',
  };

  await validateCalfUniqueness(prepared);

  const saved = await saveRecord<StoredCalf>('calves', {
    id: nextId,
    ...prepared,
    temporaryCalfNumber,
  });
  await syncExistingCalfIfEnabled(saved);
  return saved;
}

export async function updateCalf(id: string, input: CalfInput) {
  const numericId = parseCalfId(id);
  const existing = await getRecordById<StoredCalf>('calves', numericId);
  if (!existing) throw new Error('更新対象の子牛が見つかりません。');

  const normalized = normalizeInput(input);
  await validateCalfUniqueness(normalized, numericId);
  const saved = await saveRecord<StoredCalf>('calves', {
    ...existing,
    ...normalized,
    memo: normalized.note,
    id: numericId,
  });
  await syncExistingCalfIfEnabled(saved);
  return saved;
}

export async function registerCalfEarTag(id: string, earTag: string): Promise<Calf> {
  const numericId = parseCalfId(id);
  const existing = await getRecordById<StoredCalf>('calves', numericId);
  if (!existing) throw new Error('更新対象の子牛が見つかりません。');

  const normalizedEarTag = earTag.trim();
  if (!normalizedEarTag) throw new Error('正式な耳標番号を入力してください。');
  if (normalizedEarTag.startsWith('TEMP-')) throw new Error('仮管理番号ではなく、正式な耳標番号を入力してください。');

  const calves = await getAllRecords<StoredCalf>('calves');
  const duplicateEarTag = calves.find(
    (item) => item.id !== numericId && item.calfNumber.trim() === normalizedEarTag,
  );
  if (duplicateEarTag) {
    throw new Error(`耳標番号「${normalizedEarTag}」はすでに子牛台帳へ登録されています。`);
  }

  const temporaryCalfNumber = existing.temporaryCalfNumber || (existing.calfNumber.startsWith('TEMP-') ? existing.calfNumber : undefined);
  const updated = await saveRecord<StoredCalf>('calves', {
    ...existing,
    calfNumber: normalizedEarTag,
    temporaryCalfNumber,
    id: numericId,
    updatedAt: new Date().toISOString(),
  });
  await syncExistingCalfIfEnabled(updated);
  return updated;
}

export async function registerCalfName(id: string, name: string): Promise<Calf> {
  const numericId = parseCalfId(id);
  const existing = await getRecordById<StoredCalf>('calves', numericId);
  if (!existing) throw new Error('更新対象の子牛が見つかりません。');

  const normalizedName = name.trim();
  if (!normalizedName) throw new Error('名号を入力してください。');

  const updated = await saveRecord<StoredCalf>('calves', {
    ...existing,
    name: normalizedName,
    id: numericId,
    updatedAt: new Date().toISOString(),
  });
  await syncExistingCalfIfEnabled(updated);
  return updated;
}

export async function promoteCalf(id: string): Promise<Cattle> {
  const calf = await getCalf(id);
  if (calf.promotedCattleId) {
    throw new Error('この子牛はすでに牛台帳へ移行済みです。');
  }
  if (!calf.calfNumber || calf.calfNumber.startsWith('TEMP-')) {
    throw new Error('牛台帳へ移行する前に、正式な耳標番号を登録してください。');
  }

  const cattle = await createCattle({
    earTag: calf.calfNumber,
    identificationNumber: calf.identificationNumber ?? '',
    name: calf.name,
    birthday: calf.birthday,
    sex: normalizeCattleSex(calf.sex),
    sire: calf.sireName || '',
    dam: calf.geneticMotherCowName || calf.motherName,
    parity: 0,
    blvStatus: '未検査',
    stage: '育成牛',
    sourceCalfId: calf.id,
    note: calf.note,
  });

  const updated = await saveRecord<StoredCalf>('calves', {
    ...calf,
    managementStatus: '牛台帳へ移行済み',
    promotedCattleId: cattle.id,
    promotedAt: new Date().toISOString(),
  });
  await syncExistingCalfIfEnabled(updated);

  return cattle;
}

export async function deleteCalf(id: number) {
  const existing = await getRecordById<StoredCalf>('calves', id);
  if (!existing) return;

  await deleteRecord('calves', id);

  try {
    await syncCalfDeletionToCloud(existing);
  } catch (error) {
    console.warn('子牛台帳は端末内から削除しましたが、クラウド削除同期に失敗しました。', error);
  }
}