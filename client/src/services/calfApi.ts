import { Calf, CalfInput } from '../types/calf';
import { Cattle, CattleSex } from '../types/cattle';
import { createCattle } from './api';
import { getAuthToken } from './authClient';
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
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  cloudRecordId?: string;
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

function syncIdentity(record: Pick<StoredCalf, 'calfNumber' | 'temporaryCalfNumber' | 'identificationNumber' | 'birthday' | 'motherName'>) {
  const officialId = (record.identificationNumber || '').trim();
  if (officialId) return `identification:${officialId}`;

  const calfNumber = (record.calfNumber || record.temporaryCalfNumber || '').trim();
  return `calf:${calfNumber}|${record.birthday || ''}|${record.motherName || ''}`;
}

function isCloudRecordNewer(cloud: StoredCalf, local?: StoredCalf) {
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

async function readSyncApiError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `子牛台帳のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `子牛台帳のクラウド同期に失敗しました（${response.status}）`;
  }
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

async function syncCalfRecordToCloud(record: StoredCalf): Promise<StoredCalf> {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');

  const cloudId = record.cloudRecordId || syncIdentity(record);
  const response = await fetch(`/api/calves/record-sync/${encodeURIComponent(cloudId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...record, id: cloudId }),
  });

  if (!response.ok) throw new Error(await readSyncApiError(response));
  return response.json() as Promise<StoredCalf>;
}

async function pushSavedCalf(record: StoredCalf): Promise<StoredCalf> {
  if (!shouldUseCloudSync()) return record;

  try {
    const synced = await syncCalfRecordToCloud(record);
    return saveRecordPreservingTimestamps<StoredCalf>('calves', {
      ...record,
      ...synced,
      id: record.id,
      cloudRecordId: String(synced.id),
      cloudSyncPending: false,
    });
  } catch (error) {
    console.warn('子牛台帳のクラウド送信を保留しました', error);
    return record;
  }
}

async function pushPendingCalves() {
  if (!shouldUseCloudSync()) return;
  const localRecords = await getAllRecords<StoredCalf>('calves');
  for (const record of localRecords) {
    if (!record.cloudSyncPending) continue;
    await pushSavedCalf(record);
  }
}

export async function pullNewerCalfRecordsFromCloud(): Promise<number> {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');

  const response = await fetch('/api/calves/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await readSyncApiError(response));

  const cloudRecords = await response.json() as StoredCalf[];
  const localRecords = await getAllRecords<StoredCalf>('calves');
  const localByCloudId = new Map(
    localRecords
      .filter((item) => item.cloudRecordId)
      .map((item) => [String(item.cloudRecordId), item]),
  );
  const localByIdentity = new Map(localRecords.map((item) => [syncIdentity(item), item]));
  let nextId = localRecords.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  let applied = 0;

  for (const cloudRecord of cloudRecords) {
    const cloudId = String(cloudRecord.id);
    const localRecord = localByCloudId.get(cloudId) ?? localByIdentity.get(syncIdentity(cloudRecord));
    if (!isCloudRecordNewer(cloudRecord, localRecord)) continue;

    const localId = localRecord?.id ?? nextId++;
    const saved = await saveRecordPreservingTimestamps<StoredCalf>('calves', {
      ...cloudRecord,
      id: localId,
      cloudRecordId: cloudId,
      cloudSyncPending: false,
    });
    localByCloudId.set(cloudId, saved);
    localByIdentity.set(syncIdentity(saved), saved);
    applied += 1;
  }

  return applied;
}

export async function getCalfList() {
  if (shouldUseCloudSync()) {
    try {
      await pushPendingCalves();
      await pullNewerCalfRecordsFromCloud();
    } catch (error) {
      console.warn('子牛台帳のクラウド同期をスキップしました', error);
    }
  }
  return getAllRecords<StoredCalf>('calves');
}

export async function getCalf(id: string) {
  const calf = await getRecordById<StoredCalf>('calves', Number(id));
  if (!calf) throw new Error('指定された子牛が見つかりません。');
  return calf;
}

export async function createCalf(input: CalfInput) {
  const normalized = normalizeInput(input);
  await validateCalfUniqueness(normalized);

  const calves = await getAllRecords<StoredCalf>('calves');
  const nextId = calves.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const saved = await saveRecord<StoredCalf>('calves', {
    id: nextId,
    ...normalized,
    cloudSyncPending: shouldUseCloudSync(),
  });
  return pushSavedCalf(saved);
}

export async function updateCalf(id: string, input: CalfInput) {
  const numericId = Number(id);
  const existing = await getRecordById<StoredCalf>('calves', numericId);
  if (!existing) throw new Error('更新対象の子牛が見つかりません。');

  const normalized = normalizeInput(input);
  await validateCalfUniqueness(normalized, numericId);
  const saved = await saveRecord<StoredCalf>('calves', {
    ...existing,
    ...normalized,
    id: numericId,
    cloudSyncPending: shouldUseCloudSync(),
  });
  return pushSavedCalf(saved);
}

export async function registerCalfEarTag(id: string, earTag: string): Promise<Calf> {
  const numericId = Number(id);
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
    cloudSyncPending: shouldUseCloudSync(),
  });
  return pushSavedCalf(updated);
}

export async function registerCalfName(id: string, name: string): Promise<Calf> {
  const numericId = Number(id);
  const existing = await getRecordById<StoredCalf>('calves', numericId);
  if (!existing) throw new Error('更新対象の子牛が見つかりません。');

  const normalizedName = name.trim();
  if (!normalizedName) throw new Error('名号を入力してください。');

  const updated = await saveRecord<StoredCalf>('calves', {
    ...existing,
    name: normalizedName,
    id: numericId,
    updatedAt: new Date().toISOString(),
    cloudSyncPending: shouldUseCloudSync(),
  });
  return pushSavedCalf(updated);
}

export async function promoteCalf(id: string): Promise<Cattle> {
  const calf = await getCalf(id) as StoredCalf;
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
    cloudSyncPending: shouldUseCloudSync(),
  });
  await pushSavedCalf(updated);

  return cattle;
}

export async function deleteCalf(id: number) {
  await deleteRecord('calves', id);
}
