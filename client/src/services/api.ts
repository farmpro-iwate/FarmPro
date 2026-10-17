import { Cattle, CattleInput } from '../types/cattle';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { canRegisterBreedingFemale, getFarmProPlan } from '../plans/policy';
import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import { getAuthToken } from './authClient';
import {
  deleteCattleRecordFromSyncStore,
  fetchSyncedCattleRecords,
  pushCattleRecordToSyncStore,
  type SyncedCattleRecord,
} from './cattleRecordSyncApi';


type StoredCattle = Cattle & StoredRecord & {
  syncId?: string;
  cloudUpdatedAt?: string;
};

export type CattleCloudBackfillPreview = {
  missing: StoredCattle[];
  matched: StoredCattle[];
  conflicts: Array<{
    local: StoredCattle;
    cloud: StoredCattle;
    reason: 'id' | 'earTag' | 'identificationNumber';
  }>;
};

export type CattleCloudBackfillResult = {
  uploaded: number;
  missingAfter: number;
  matchedAfter: number;
  conflictsAfter: number;
};

function normalizeInput(input: CattleInput): CattleInput {
  return {
    ...input,
    earTag: input.earTag.trim(),
    identificationNumber: input.identificationNumber.trim(),
    name: input.name.trim(),
  };
}

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

function parseTimestamp(value?: unknown) {
  if (typeof value !== 'string' || !value) return Number.NaN;
  return Date.parse(value);
}

function syncedRecordIsNewer(cloud: SyncedCattleRecord, local?: StoredCattle) {
  if (!local) return true;

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

function cloudDeletionIsNewer(cloud: SyncedCattleRecord, local: StoredCattle) {
  const cloudDeletionTime = Math.max(
    parseTimestamp(cloud.deletedAt),
    parseTimestamp(cloud.cloudUpdatedAt),
  );
  if (!Number.isFinite(cloudDeletionTime)) return false;

  const localLatestTime = Math.max(
    parseTimestamp(local.cloudUpdatedAt),
    parseTimestamp(local.updatedAt),
    parseTimestamp(local.createdAt),
  );
  if (!Number.isFinite(localLatestTime)) return true;

  return cloudDeletionTime > localLatestTime;
}

function toLocalCattle(cloud: SyncedCattleRecord, localId: number): StoredCattle {
  const { id: syncId, legacyId: _legacyId, deletedAt: _deletedAt, ...record } = cloud;
  return {
    ...record,
    id: localId,
    syncId,
    earTag: String(cloud.earTag || ''),
    identificationNumber: String(cloud.identificationNumber || ''),
    name: String(cloud.name || ''),
    birthday: String(cloud.birthday || ''),
    cloudUpdatedAt: cloud.cloudUpdatedAt,
  } as StoredCattle;
}

async function syncExistingCattleIfEnabled(record: StoredCattle) {
  if (!shouldUseCloudSync()) return;

  try {
    const synced = await pushCattleRecordToSyncStore(record);
    if (synced.cloudUpdatedAt) {
      await saveRecordPreservingTimestamps<StoredCattle>('cattle', {
        ...record,
        syncId: synced.id,
        cloudUpdatedAt: synced.cloudUpdatedAt,
      });
    }
  } catch (error) {
    console.warn('牛台帳は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

async function validateCattleUniqueness(input: CattleInput, currentId?: number) {
  const cattle = await getAllRecords<StoredCattle>('cattle');
  const duplicateEarTag = cattle.find(
    (item) => item.id !== currentId && item.earTag.trim() === input.earTag,
  );
  if (duplicateEarTag) {
    throw new Error(`耳標番号「${input.earTag}」はすでに登録されています。`);
  }

  if (input.identificationNumber) {
    const duplicateIdentificationNumber = cattle.find(
      (item) =>
        item.id !== currentId &&
        (item.identificationNumber ?? '').trim() === input.identificationNumber,
    );
    if (duplicateIdentificationNumber) {
      throw new Error(`個体識別番号「${input.identificationNumber}」はすでに登録されています。`);
    }
  }
}

async function validateBreedingFemalePlanLimit(input: CattleInput) {
  if (input.sex !== '雌') return;

  const cattle = await getAllRecords<StoredCattle>('cattle');
  const currentBreedingFemaleCount = cattle.filter((item) => item.sex === '雌').length;
  const planId = getCurrentFarmProPlanId();

  if (!canRegisterBreedingFemale(planId, currentBreedingFemaleCount)) {
    const plan = getFarmProPlan(planId);
    throw new Error(`${plan.label}プランでは繁殖雌牛を${plan.maxBreedingFemales}頭まで登録できます。料金プランをご確認ください。`);
  }
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `クラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `クラウド同期に失敗しました（${response.status}）`;
  }
}

async function fetchCloudCattle(): Promise<StoredCattle[]> {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');

  const response = await fetch('/api/cattle', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<StoredCattle[]>;
}

function isCloudRecordNewer(cloud: StoredCattle, local?: StoredCattle): boolean {
  if (!local) return true;
  const cloudUpdatedAt = typeof cloud.updatedAt === 'string' ? Date.parse(cloud.updatedAt) : Number.NaN;
  const localUpdatedAt = typeof local.updatedAt === 'string' ? Date.parse(local.updatedAt) : Number.NaN;
  if (Number.isNaN(cloudUpdatedAt)) return false;
  if (Number.isNaN(localUpdatedAt)) return true;
  return cloudUpdatedAt > localUpdatedAt;
}

export async function getCattleList() {
  return getAllRecords<StoredCattle>('cattle');
}

export async function getCattle(id: string) {
  const cattle = await getRecordById<StoredCattle>('cattle', Number(id));
  if (!cattle) throw new Error('指定された牛が見つかりません。');
  return cattle;
}

export async function createCattle(input: CattleInput) {
  const normalized = normalizeInput(input);
  await validateCattleUniqueness(normalized);
  await validateBreedingFemalePlanLimit(normalized);

  const cattle = await getAllRecords<StoredCattle>('cattle');
  const nextId = cattle.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  const saved = await saveRecord<StoredCattle>('cattle', { id: nextId, ...normalized });
  await syncExistingCattleIfEnabled(saved);
  return saved;
}

export async function updateCattle(id: string, input: CattleInput) {
  const numericId = Number(id);
  const existing = await getRecordById<StoredCattle>('cattle', numericId);
  if (!existing) throw new Error('更新対象の牛が見つかりません。');

  const normalized = normalizeInput(input);
  await validateCattleUniqueness(normalized, numericId);
  const saved = await saveRecord<StoredCattle>('cattle', { ...existing, ...normalized, id: numericId });
  await syncExistingCattleIfEnabled(saved);
  return saved;
}

export async function syncCattleRecordToCloud(cattle: StoredCattle): Promise<Cattle> {
  const token = getAuthToken();
  if (!token) throw new Error('ログインが必要です');

  const response = await fetch(`/api/cattle/${encodeURIComponent(String(cattle.id))}/sync`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(cattle),
  });

  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<Cattle>;
}

export async function previewCattleCloudBackfill(): Promise<CattleCloudBackfillPreview> {
  const [localCattle, cloudCattle] = await Promise.all([
    getAllRecords<StoredCattle>('cattle'),
    fetchCloudCattle(),
  ]);
  const cloudById = new Map(cloudCattle.map((item) => [Number(item.id), item]));
  const cloudByEarTag = new Map(cloudCattle.map((item) => [item.earTag.trim(), item]));
  const cloudByIdentificationNumber = new Map(
    cloudCattle
      .filter((item) => (item.identificationNumber ?? '').trim())
      .map((item) => [(item.identificationNumber ?? '').trim(), item]),
  );
  const preview: CattleCloudBackfillPreview = { missing: [], matched: [], conflicts: [] };

  for (const local of localCattle) {
    const byId = cloudById.get(Number(local.id));
    const byEarTag = cloudByEarTag.get(local.earTag.trim());
    const identificationNumber = (local.identificationNumber ?? '').trim();
    const byIdentificationNumber = identificationNumber
      ? cloudByIdentificationNumber.get(identificationNumber)
      : undefined;

    if (!byId && !byEarTag && !byIdentificationNumber) {
      preview.missing.push(local);
      continue;
    }

    if (byId && byId.earTag.trim() !== local.earTag.trim()) {
      preview.conflicts.push({ local, cloud: byId, reason: 'id' });
      continue;
    }
    if (byEarTag && Number(byEarTag.id) !== Number(local.id)) {
      preview.conflicts.push({ local, cloud: byEarTag, reason: 'earTag' });
      continue;
    }
    if (byIdentificationNumber && Number(byIdentificationNumber.id) !== Number(local.id)) {
      preview.conflicts.push({ local, cloud: byIdentificationNumber, reason: 'identificationNumber' });
      continue;
    }

    preview.matched.push(local);
  }

  return preview;
}

export async function backfillMissingCattleToCloud(): Promise<CattleCloudBackfillResult> {
  const before = await previewCattleCloudBackfill();

  if (before.conflicts.length > 0) {
    throw new Error(`衝突が${before.conflicts.length}件あるため、牛台帳のクラウド補完を中止しました。`);
  }

  let uploaded = 0;
  for (const cattle of before.missing) {
    await syncCattleRecordToCloud(cattle);
    uploaded += 1;
  }

  const after = await previewCattleCloudBackfill();
  if (after.conflicts.length > 0) {
    throw new Error(`補完後の確認で衝突が${after.conflicts.length}件見つかりました。追加の変更は停止しました。`);
  }

  return {
    uploaded,
    missingAfter: after.missing.length,
    matchedAfter: after.matched.length,
    conflictsAfter: after.conflicts.length,
  };
}

export async function pullNewerCattleRecordsFromCloud(): Promise<number> {
  if (!shouldUseCloudSync()) return 0;

  const cloudRecords = await fetchSyncedCattleRecords();
  const localRecords = await getAllRecords<StoredCattle>('cattle');
  const localCalves = await getAllRecords<StoredRecord>('calves');
  let nextId = localRecords.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  let applied = 0;

  for (const cloudRecord of cloudRecords) {
    const identificationNumber = String(cloudRecord.identificationNumber ?? '').trim();
    const earTag = String(cloudRecord.earTag ?? '').trim();
    // Keep every candidate so duplicate identifiers cannot be hidden by a Map.
    const candidates = localRecords.filter(item =>
      (item.syncId && String(item.syncId) === String(cloudRecord.id)) ||
      (identificationNumber && String(item.identificationNumber ?? '').trim() === identificationNumber) ||
      (earTag && String(item.earTag ?? '').trim() === earTag)
    );
    const candidateIds = new Set(candidates.map((item) => Number(item.id)));

    if (candidateIds.size > 1) {
      console.warn('牛台帳のクラウド取り込みで候補が複数見つかったため、このレコードをスキップしました。', cloudRecord.id);
      continue;
    }

    const localRecord = candidates[0];
    if (localRecord && (
      (identificationNumber && String(localRecord.identificationNumber ?? '').trim() &&
        identificationNumber !== String(localRecord.identificationNumber).trim()) ||
      (localRecord.syncId && String(localRecord.syncId) !== String(cloudRecord.id))
    )) {
      console.warn('牛台帳の個体識別番号または同期IDが矛盾するため、取り込みを中止しました。', cloudRecord.id);
      continue;
    }

    if (cloudRecord.deletedAt) {
      if (!localRecord) continue;
      if (!cloudDeletionIsNewer(cloudRecord, localRecord)) continue;
      await deleteRecord('cattle', Number(localRecord.id));
      localRecords.splice(localRecords.indexOf(localRecord), 1);
      applied += 1;
      continue;
    }

    if (localRecord && !syncedRecordIsNewer(cloudRecord, localRecord)) continue;

    const localId = localRecord ? Number(localRecord.id) : nextId++;
    const incoming = toLocalCattle(cloudRecord, localId);
    // A sourceCalfId belongs to the sending device. Resolve only by a unique
    // individual identifier on this device, never by the remote numeric ID.
    if (cloudRecord.sourceCalfId !== undefined || localRecord?.sourceCalfId !== undefined) {
      const calves = identificationNumber ? localCalves.filter(calf =>
        String(calf.identificationNumber ?? '').trim() === identificationNumber
      ) : [];
      incoming.sourceCalfId = calves.length === 1 ? Number(calves[0].id) : undefined;
    }
    const saved = await saveRecordPreservingTimestamps<StoredCattle>(
      'cattle',
      incoming,
    );
    if (localRecord) localRecords[localRecords.indexOf(localRecord)] = saved;
    else localRecords.push(saved);
    applied += 1;
  }

  return applied;
}

export async function deleteCattle(id: number) {
  const existing = await getRecordById<StoredCattle>('cattle', id);
  if (!existing) throw new Error('削除対象の牛が見つかりません。');

  if (shouldUseCloudSync()) {
    await deleteCattleRecordFromSyncStore(existing);
  }

  await deleteRecord('cattle', id);
}
