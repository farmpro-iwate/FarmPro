import { Cattle, CattleInput } from '../types/cattle';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { canRegisterBreedingFemale, getFarmProPlan } from '../plans/policy';
import {
  getAllRecords,
  getRecordById,
} from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import { getAuthToken } from './authClient';
import {
  deleteCattleRecordFromSyncStore,
  fetchSyncedCattleRecords,
  pushCattleRecordToSyncStore,
  makeCattleSyncId,
  sameCattleSyncContent,
  toSyncedCattleRecord,
  type SyncedCattleRecord,
} from './cattleRecordSyncApi';
import {
  assertAnimalSyncContext, canRetryAnimalSyncOnPage, changeMatchingAnimal,
  isOwnedAnimalSyncPending, newAnimalSyncOrigin, sameAnimalSyncRecord, withAnimalSync,
  type AnimalSyncContext, type AnimalSyncOrigin,
} from './animalRecordSyncSafety';


type StoredCattle = Cattle & StoredRecord & {
  syncId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  animalSyncOrigin?: AnimalSyncOrigin;
  animalSyncBase?: { version: 1; record: SyncedCattleRecord | null; cloudUpdatedAt?: string };
  animalSyncAttempt?: { version: 1; record: SyncedCattleRecord };
  syncWarning?: string;
  deletedAt?: string;
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

function parseTimestamp(value?: unknown) {
  if (typeof value !== 'string' || !value) return Number.NaN;
  return Date.parse(value);
}

function hasUnconfirmedCattleChanges(record: StoredCattle) {
  if (typeof record.cloudSyncPending === 'boolean') return record.cloudSyncPending;
  // Older saves did not persist a pending flag. A missing acknowledgement or
  // an edit after that acknowledgement is not safe to replace on receive.
  const confirmedAt = parseTimestamp(record.cloudUpdatedAt);
  const editedAt = parseTimestamp(record.updatedAt);
  return !Number.isFinite(confirmedAt) || !Number.isFinite(editedAt) || editedAt > confirmedAt;
}

function syncedRecordIsNewer(cloud: SyncedCattleRecord, local?: StoredCattle) {
  if (!local) return true;
  if (hasUnconfirmedCattleChanges(local)) return false;

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
  if (hasUnconfirmedCattleChanges(local)) return false;
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

function toLocalCattle(cloud: SyncedCattleRecord, localId: number, existing?: StoredCattle): StoredCattle {
  // Numeric calf IDs are local to each device. Never import a remote ID as a local reference.
  const {
    id: syncId, legacyId: _legacyId, deletedAt: _deletedAt, sourceCalfId: _remoteCalfId,
    cloudSyncPending: _pending, animalSyncOrigin: _origin, animalSyncBase: _base,
    animalSyncAttempt: _attempt, syncWarning: _warning, ...record
  } = cloud;
  return {
    ...record,
    id: localId,
    syncId,
    ...(existing?.sourceCalfId !== undefined ? { sourceCalfId: existing.sourceCalfId } : {}),
    earTag: String(cloud.earTag || ''),
    identificationNumber: String(cloud.identificationNumber || ''),
    name: String(cloud.name || ''),
    birthday: String(cloud.birthday || ''),
    cloudUpdatedAt: cloud.cloudUpdatedAt,
    cloudSyncPending: false,
  } as StoredCattle;
}

class CattleLocalSyncConflictError extends Error {
  constructor() {
    super('牛台帳が処理中に変更されたため、古い保存結果は反映していません。最新の内容を確認してください。');
    this.name = 'CattleLocalSyncConflictError';
  }
}

class CattleSyncDeferredError extends Error {}

function validCloudRevision(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function prepareCattleSave(input: CattleInput, id: number, existing: StoredCattle | undefined, context: AnimalSyncContext): StoredCattle {
  const now = new Date().toISOString();
  const { animalSyncOrigin: _origin, animalSyncBase: _base, animalSyncAttempt: _attempt, syncWarning: _warning, ...before } = existing ?? {};
  const saved: StoredCattle = {
    ...before, ...input, id, createdAt: existing?.createdAt ?? now, updatedAt: now,
    // Free edits still need receive protection after a later plan change.
    // Ownership/base/attempt are removed above and recreated only for paid saves.
    cloudSyncPending: true,
  };
  saved.syncId = makeCattleSyncId(existing ?? saved);
  if (context.cloudEnabled) {
    const owned = existing && isOwnedAnimalSyncPending(existing, context);
    saved.animalSyncOrigin = newAnimalSyncOrigin(context);
    saved.animalSyncBase = owned && existing.animalSyncBase ? existing.animalSyncBase : {
      version: 1, record: existing ? toSyncedCattleRecord(existing) : null,
      ...(!existing?.cloudSyncPending && validCloudRevision(existing?.cloudUpdatedAt)
        ? { cloudUpdatedAt: existing.cloudUpdatedAt } : {}),
    };
    if (owned && existing.animalSyncAttempt) saved.animalSyncAttempt = existing.animalSyncAttempt;
  }
  return saved;
}

function matchingCloudCattle(record: StoredCattle, cloud: SyncedCattleRecord[]): SyncedCattleRecord | undefined {
  const syncId = makeCattleSyncId(record);
  const identification = String(record.identificationNumber ?? '').trim();
  const earTag = record.earTag.trim();
  const matches = cloud.filter(item => item.id === syncId ||
    (identification && String(item.identificationNumber ?? '').trim() === identification) ||
    (earTag && String(item.earTag ?? '').trim() === earTag));
  if (matches.length > 1 || matches.some(item => item.id !== syncId)) {
    throw new Error('クラウドに同じ牛の異なる記録があります。端末の記録を保持し、同期を保留しました。');
  }
  return matches[0];
}

async function assertCurrentCattle(record: StoredCattle, context: AnimalSyncContext, automatic: boolean): Promise<void> {
  assertAnimalSyncContext(context);
  if (automatic && !canRetryAnimalSyncOnPage(window.location.pathname)) throw new CattleSyncDeferredError();
  if (!isOwnedAnimalSyncPending(record, context)) throw new CattleSyncDeferredError();
  const current = await getRecordById<StoredCattle>('cattle', record.id);
  assertAnimalSyncContext(context);
  if (automatic && !canRetryAnimalSyncOnPage(window.location.pathname)) throw new CattleSyncDeferredError();
  if (!isOwnedAnimalSyncPending(record, context)) throw new CattleSyncDeferredError();
  if (!sameAnimalSyncRecord(current, record)) throw new CattleLocalSyncConflictError();
}

async function syncExistingCattleIfEnabled(initial: StoredCattle, context: AnimalSyncContext, automatic = false): Promise<StoredCattle> {
  if (!context.cloudEnabled) return initial;
  let record = initial;
  const hold = async (message: string): Promise<StoredCattle> => {
    assertAnimalSyncContext(context);
    const pending = { ...record, syncWarning: message };
    if (!await changeMatchingAnimal('cattle', context, record.id, record, pending)) throw new CattleLocalSyncConflictError();
    return pending;
  };
  if (!isOwnedAnimalSyncPending(record, context)) {
    return automatic ? record : hold('この端末には保存しました。ログイン・同期元の情報を確認できないため、クラウド同期を保留しています。');
  }
  try {
    await assertCurrentCattle(record, context, automatic);
    const cloud = await fetchSyncedCattleRecords(context);
    await assertCurrentCattle(record, context, automatic);
    const remote = matchingCloudCattle(record, cloud);
    const wire = toSyncedCattleRecord(record);
    const base = record.animalSyncBase;
    const attempt = record.animalSyncAttempt;
    if (!base || base.version !== 1) throw new Error('変更前の保存内容を確認できないため、端末の記録を保持して同期を保留しました。');
    if (remote?.deletedAt) throw new Error('この牛はクラウドで削除済みです。端末の変更を保持し、同期を保留しました。');
    let synced = remote;
    if (!remote || !sameCattleSyncContent(wire, remote)) {
      let ifMatch: string | undefined;
      if (remote) {
        const reachedAttempt = attempt?.version === 1 && sameCattleSyncContent(attempt.record, remote);
        const knownBase = validCloudRevision(base.cloudUpdatedAt) && base.cloudUpdatedAt === remote.cloudUpdatedAt;
        const unknownBase = !base.cloudUpdatedAt && base.record && sameCattleSyncContent(base.record, remote);
        if ((!reachedAttempt && !knownBase && !unknownBase) || !validCloudRevision(remote.cloudUpdatedAt)) {
          throw new Error('端末とクラウドの牛台帳に未確認の違いがあります。端末の変更を保持し、同期を保留しました。');
        }
        ifMatch = remote.cloudUpdatedAt;
      } else if (base.record !== null || base.cloudUpdatedAt) {
        throw new Error('変更前の牛をクラウドで確認できないため、端末の変更を保持して同期を保留しました。');
      }

      await assertCurrentCattle(record, context, automatic);
      const staged: StoredCattle = { ...record, animalSyncAttempt: { version: 1, record: wire } };
      if (!await changeMatchingAnimal('cattle', context, record.id, record, staged)) throw new CattleLocalSyncConflictError();
      record = staged;
      await assertCurrentCattle(record, context, automatic);
      synced = await pushCattleRecordToSyncStore(record, { context, ifMatch, ifNoneMatch: !remote });
    }
    await assertCurrentCattle(record, context, automatic);
    if (!synced || synced.id !== wire.id || synced.deletedAt || !validCloudRevision(synced.cloudUpdatedAt) || !sameCattleSyncContent(wire, synced)) {
      throw new Error('クラウドの保存内容と一致を確認できないため、端末の変更を保持して同期を保留しました。');
    }
    const { animalSyncOrigin: _origin, animalSyncBase: _base, animalSyncAttempt: _attempt, syncWarning: _warning, ...content } = record;
    const acknowledged = { ...content, syncId: synced.id, cloudUpdatedAt: synced.cloudUpdatedAt, cloudSyncPending: false };
    if (!await changeMatchingAnimal('cattle', context, record.id, record, acknowledged)) throw new CattleLocalSyncConflictError();
    return acknowledged;
  } catch (error) {
    assertAnimalSyncContext(context);
    if (error instanceof CattleLocalSyncConflictError) throw error;
    if (error instanceof CattleSyncDeferredError) return record;
    return hold(error instanceof Error ? `クラウド同期は完了していません。${error.message}` : 'クラウド同期は完了していません。端末の記録は保持しています。');
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
  return withAnimalSync('cattle', async context => {
    const records = await getAllRecords<StoredCattle>('cattle');
    assertAnimalSyncContext(context);
    return records;
  });
}

export async function getCattle(id: string) {
  return withAnimalSync('cattle', async context => {
    const cattle = await getRecordById<StoredCattle>('cattle', Number(id));
    assertAnimalSyncContext(context);
    if (!cattle) throw new Error('指定された牛が見つかりません。');
    return cattle;
  });
}

export async function createCattle(input: CattleInput) {
  return withAnimalSync('cattle', async context => {
    const normalized = normalizeInput(input);
    await validateCattleUniqueness(normalized);
    assertAnimalSyncContext(context);
    await validateBreedingFemalePlanLimit(normalized);
    assertAnimalSyncContext(context);
    const cattle = await getAllRecords<StoredCattle>('cattle');
    assertAnimalSyncContext(context);
    const nextId = cattle.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const saved = prepareCattleSave(normalized, nextId, undefined, context);
    if (!await changeMatchingAnimal('cattle', context, nextId, undefined, saved)) throw new CattleLocalSyncConflictError();
    return syncExistingCattleIfEnabled(saved, context);
  });
}

export async function updateCattle(id: string, input: CattleInput) {
  return withAnimalSync('cattle', async context => {
    const numericId = Number(id);
    const existing = await getRecordById<StoredCattle>('cattle', numericId);
    assertAnimalSyncContext(context);
    if (!existing) throw new Error('更新対象の牛が見つかりません。');
    const normalized = normalizeInput(input);
    await validateCattleUniqueness(normalized, numericId);
    assertAnimalSyncContext(context);
    const saved = prepareCattleSave(normalized, numericId, existing, context);
    if (!await changeMatchingAnimal('cattle', context, numericId, existing, saved)) throw new CattleLocalSyncConflictError();
    return syncExistingCattleIfEnabled(saved, context);
  });
}

/** Retry this browser's formal saves only. Reading a list never uploads records. */
export async function retryPendingCattleSync(): Promise<number> {
  if (!canRetryAnimalSyncOnPage(window.location.pathname)) return 0;
  return withAnimalSync('cattle', async context => {
    if (!context.cloudEnabled || !context.token || !canRetryAnimalSyncOnPage(window.location.pathname)) return 0;
    const records = await getAllRecords<StoredCattle>('cattle');
    assertAnimalSyncContext(context);
    let acknowledged = 0;
    for (const record of records) {
      if (!canRetryAnimalSyncOnPage(window.location.pathname)) break;
      if (!isOwnedAnimalSyncPending(record, context)) continue;
      try {
        const result = await syncExistingCattleIfEnabled(record, context, true);
        if (!result.cloudSyncPending) acknowledged += 1;
      } catch (error) {
        assertAnimalSyncContext(context);
        console.warn('牛台帳の未送信記録を保持し、再送を保留しました。', error);
      }
    }
    return acknowledged;
  });
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
  return withAnimalSync('cattle', async context => {
  if (!context.cloudEnabled || !context.token) return 0;
  // Compare against the pre-request row. A deletion by an older tab or restore
  // during GET must not be interpreted as a previously unseen remote animal.
  const localRecords = await getAllRecords<StoredCattle>('cattle');
  assertAnimalSyncContext(context);
  const cloudRecords = await fetchSyncedCattleRecords(context);
  const localCalves = await getAllRecords<{ id: number; identificationNumber?: string; managementStatus?: string }>('calves');
  assertAnimalSyncContext(context);
  const localBySyncId = new Map(
    localRecords
      .filter((item) => item.syncId)
      .map((item) => [String(item.syncId), item]),
  );
  const localByIdentificationNumber = new Map(
    localRecords
      .filter((item) => String(item.identificationNumber ?? '').trim())
      .map((item) => [String(item.identificationNumber ?? '').trim(), item]),
  );
  const localByEarTag = new Map(
    localRecords
      .filter((item) => String(item.earTag ?? '').trim())
      .map((item) => [String(item.earTag ?? '').trim(), item]),
  );
  let nextId = localRecords.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  let applied = 0;

  for (const cloudRecord of cloudRecords) {
    const identificationNumber = String(cloudRecord.identificationNumber ?? '').trim();
    const earTag = String(cloudRecord.earTag ?? '').trim();
    const bySyncId = localBySyncId.get(String(cloudRecord.id));
    const byIdentificationNumber = identificationNumber
      ? localByIdentificationNumber.get(identificationNumber)
      : undefined;
    const byEarTag = earTag ? localByEarTag.get(earTag) : undefined;
    const candidates = [bySyncId, byIdentificationNumber, byEarTag].filter(Boolean) as StoredCattle[];
    const candidateIds = new Set(candidates.map((item) => Number(item.id)));

    if (candidateIds.size > 1) {
      console.warn('牛台帳のクラウド取り込みで候補が複数見つかったため、このレコードをスキップしました。', cloudRecord.id);
      continue;
    }

    const localRecord = candidates[0];

    // A matching label cannot replace a confirmed identity or a different national ID.
    // Corrections to ear/national IDs remain valid when the stable sync ID itself matches.
    if (localRecord && !bySyncId) {
      const localSyncId = String(localRecord.syncId ?? '').trim();
      const localIdentification = String(localRecord.identificationNumber ?? '').trim();
      if ((localSyncId && localSyncId !== String(cloudRecord.id)) ||
          (localIdentification && identificationNumber && localIdentification !== identificationNumber)) {
        console.warn('牛台帳の識別情報が一致しないため、既存記録を保持してクラウド取り込みを保留しました。', cloudRecord.id);
        continue;
      }
    }

    if (cloudRecord.deletedAt) {
      if (!localRecord) continue;
      if (!cloudDeletionIsNewer(cloudRecord, localRecord)) continue;
      if (!await changeMatchingAnimal('cattle', context, Number(localRecord.id), localRecord, undefined)) continue;
      localBySyncId.delete(String(cloudRecord.id));
      const localIdentificationNumber = String(localRecord.identificationNumber ?? '').trim();
      const localEarTag = String(localRecord.earTag ?? '').trim();
      if (localIdentificationNumber) localByIdentificationNumber.delete(localIdentificationNumber);
      if (localEarTag) localByEarTag.delete(localEarTag);
      applied += 1;
      continue;
    }

    if (localRecord && !syncedRecordIsNewer(cloudRecord, localRecord)) continue;

    const localId = localRecord ? Number(localRecord.id) : nextId++;
    // Remote numeric calf IDs are never trusted. Match only an unambiguous,
    // locally promoted calf by its identification number.
    const matchingCalves = identificationNumber
      ? localCalves.filter(c => String(c.identificationNumber ?? '').trim() === identificationNumber)
      : [];
    const localSourceCalfId = matchingCalves.length === 1 &&
      matchingCalves[0].managementStatus === '牛台帳へ移行済み'
      ? Number(matchingCalves[0].id) : undefined;
    const saved = { ...toLocalCattle(cloudRecord, localId, localRecord),
      ...(localRecord?.sourceCalfId === undefined && localSourceCalfId !== undefined ? { sourceCalfId: localSourceCalfId } : {}) };
    if (!await changeMatchingAnimal('cattle', context, localId, localRecord, saved)) continue;
    localBySyncId.set(String(cloudRecord.id), saved);
    if (String(saved.identificationNumber ?? '').trim()) {
      localByIdentificationNumber.set(String(saved.identificationNumber ?? '').trim(), saved);
    }
    if (String(saved.earTag ?? '').trim()) {
      localByEarTag.set(String(saved.earTag ?? '').trim(), saved);
    }
    applied += 1;
  }

  assertAnimalSyncContext(context);
  return applied;
  });
}

export async function deleteCattle(id: number) {
  return withAnimalSync('cattle', async context => {
    const existing = await getRecordById<StoredCattle>('cattle', id);
    assertAnimalSyncContext(context);
    if (!existing) return;
    if (context.cloudEnabled) {
      if (!context.token) throw new Error('牛台帳の削除を確認するため、ログインして通信できる状態で削除してください。');
      const cloud = await fetchSyncedCattleRecords(context);
      const remote = matchingCloudCattle(existing, cloud);
      let ifMatch: string | undefined;
      if (remote && !remote.deletedAt) {
        const base = existing.animalSyncBase;
        const owned = isOwnedAnimalSyncPending(existing, context);
        const ownAttempt = owned && existing.animalSyncAttempt?.record && sameCattleSyncContent(existing.animalSyncAttempt.record, remote);
        const knownBase = validCloudRevision(existing.cloudUpdatedAt) && existing.cloudUpdatedAt === remote.cloudUpdatedAt;
        const sameBefore = sameCattleSyncContent(toSyncedCattleRecord(existing), remote) ||
          (owned && base?.record && sameCattleSyncContent(base.record, remote));
        if ((!knownBase && !ownAttempt && !sameBefore) || !validCloudRevision(remote.cloudUpdatedAt)) {
          throw new Error('クラウドの牛台帳に変更があります。記録を保持して削除を中止しました。最新の内容を確認してください。');
        }
        ifMatch = remote.cloudUpdatedAt;
      }
      const current = await getRecordById<StoredCattle>('cattle', id);
      assertAnimalSyncContext(context);
      if (!sameAnimalSyncRecord(current, existing)) throw new CattleLocalSyncConflictError();
      const deleted = await deleteCattleRecordFromSyncStore(existing, { context, ifMatch });
      if (deleted.id !== makeCattleSyncId(existing) || !deleted.deletedAt) throw new Error('クラウドで牛の削除を確認できませんでした。端末の記録は保持しています。');
    }
    if (!await changeMatchingAnimal('cattle', context, id, existing, undefined)) throw new CattleLocalSyncConflictError();
  });
}
