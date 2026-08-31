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


type StoredCattle = Cattle & StoredRecord;

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
  return saveRecord<StoredCattle>('cattle', { id: nextId, ...normalized });
}

export async function updateCattle(id: string, input: CattleInput) {
  const numericId = Number(id);
  const existing = await getRecordById<StoredCattle>('cattle', numericId);
  if (!existing) throw new Error('更新対象の牛が見つかりません。');

  const normalized = normalizeInput(input);
  await validateCattleUniqueness(normalized, numericId);
  return saveRecord<StoredCattle>('cattle', { ...existing, ...normalized, id: numericId });
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
  const cloudCattle = await fetchCloudCattle();
  const localCattle = await getAllRecords<StoredCattle>('cattle');
  const localById = new Map(localCattle.map((item) => [Number(item.id), item]));
  let applied = 0;

  for (const cloudRecord of cloudCattle) {
    const localRecord = localById.get(Number(cloudRecord.id));
    if (!isCloudRecordNewer(cloudRecord, localRecord)) continue;
    await saveRecordPreservingTimestamps<StoredCattle>('cattle', cloudRecord);
    applied += 1;
  }

  return applied;
}

export async function deleteCattle(id: number) {
  await deleteRecord('cattle', id);
}
