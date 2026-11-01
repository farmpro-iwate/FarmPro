import { Calf, CalfInput } from '../types/calf';
import { Cattle, CattleSex } from '../types/cattle';
import { createCattle } from './api';
import { calfRecordForCloud, syncCalfCreatedFromCalving, type CalfRecordForSync } from './calfRecordSync';
import { getRetainedCalfProductionCost } from './cattleAcquisitionCost';
import {
  getAllRecords,
  getRecordById,
} from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import {
  assertAnimalSyncContext, canRetryAnimalSyncOnPage, changeMatchingAnimal,
  getAnimalSyncContext, isOwnedAnimalSyncPending, newAnimalSyncOrigin, sameAnimalSyncRecord,
  withAnimalSync, withAnimalSyncRequest, type AnimalSyncContext, type AnimalSyncOrigin,
} from './animalRecordSyncSafety';

type CalfSyncBase = { record: Record<string, unknown>; cloudUpdatedAt?: string };
type CalfSyncMetadata = {
  cloudSyncPending?: boolean;
  animalSyncOrigin?: AnimalSyncOrigin;
  animalSyncBase?: CalfSyncBase | null;
  animalSyncAttempt?: Record<string, unknown>;
  syncWarning?: string | null;
};

export type StoredCalf = Calf & StoredRecord & CalfSyncMetadata & {
  calvingId?: string;
  birthDate?: string;
  earTag?: string;
  motherCowName?: string;
  recipientCowId?: string;
  recipientCowName?: string;
  geneticMotherCowId?: string;
  memo?: string;
  cloudUpdatedAt?: string;
  syncRecordId?: string;
  deletedAt?: string;
};

type CloudCalfRecord = Omit<Partial<Calf>, 'id'> & {
  [key: string]: unknown;
  id: string;
  birthDate?: string;
  earTag?: string;
  memo?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

function normalizeInput(input: CalfInput): CalfInput {
  return {
    ...input,
    calfNumber: String(input.calfNumber || '').trim(),
    identificationNumber: String(input.identificationNumber || '').trim(),
    name: String(input.name || '').trim(),
    motherName: String(input.motherName || '').trim(),
    motherCowId: String(input.motherCowId || '').trim(),
    motherCowName: String(input.motherCowName || '').trim(),
    breedingMethod: String(input.breedingMethod || '').trim(),
    breedingId: String(input.breedingId || '').trim(),
    recipientCowId: String(input.recipientCowId || '').trim(),
    recipientCowName: String(input.recipientCowName || '').trim(),
    geneticMotherCowId: String(input.geneticMotherCowId || '').trim(),
    geneticMotherCowName: String(input.geneticMotherCowName || '').trim(),
    sireName: String(input.sireName || '').trim(),
    note: String(input.note || '').trim(),
  };
}

function normalizeCattleSex(sex?: string): CattleSex {
  if (sex === '雄' || sex === 'オス') return '雄';
  if (sex === '去勢') return '去勢';
  return '雌';
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

function calfSyncId(record: Pick<StoredCalf, 'id' | 'calvingId' | 'syncRecordId'>) {
  if (record.syncRecordId) return record.syncRecordId;
  return record.calvingId ? `calving:${record.calvingId}` : undefined;
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

const CALF_SYNC_PENDING = 'この端末に保存済みですが、クラウド同期を保留しています。';

/** Prepare the queue alongside the source row; callers save both in the same transaction. */
export function prepareCalfSyncRecord<T extends CalfRecordForSync>(
  next: T, previous: T | undefined, context: AnimalSyncContext,
): T & CalfSyncMetadata {
  assertAnimalSyncContext(context);
  const prior = previous as (T & CalfSyncMetadata) | undefined;
  if (!context.cloudEnabled) return { ...next, syncWarning: undefined };
  const ownsPrior = prior && isOwnedAnimalSyncPending(prior, context);
  return {
    ...next,
    cloudSyncPending: true,
    animalSyncOrigin: ownsPrior ? prior.animalSyncOrigin : newAnimalSyncOrigin(context),
    animalSyncBase: ownsPrior ? prior.animalSyncBase : previous ? {
      record: calfRecordForCloud(previous),
      cloudUpdatedAt: typeof previous.cloudUpdatedAt === 'string' ? previous.cloudUpdatedAt : undefined,
    } : null,
    animalSyncAttempt: ownsPrior ? prior.animalSyncAttempt : undefined,
    syncWarning: undefined,
  };
}

/** Compare the server's defaults and legacy aliases, without device-local IDs or queue fields. */
function calfContent(record: Record<string, unknown>, includeUpdatedAt: boolean) {
  const fields = Object.fromEntries(Object.entries(record).filter(([key]) =>
    !['id', 'syncRecordId', 'cloudUpdatedAt', 'cloudSyncPending', 'syncWarning',
      'promotedCattleId'].includes(key) &&
    !key.startsWith('animalSync') && (includeUpdatedAt || key !== 'updatedAt'),
  ));
  const stringFields = ['calvingId', 'calfNumber', 'temporaryCalfNumber', 'identificationNumber',
    'name', 'birthday', 'sex', 'motherName', 'motherCowId', 'motherCowName', 'breedingMethod',
    'breedingId', 'geneticMotherCowId', 'geneticMotherCowName', 'recipientCowId', 'recipientCowName',
    'sireName', 'weaningPlannedDate', 'weaningDate', 'milkEndDate', 'promotedAt', 'note'];
  for (const key of stringFields) fields[key] = record[key] ?? '';
  fields.birthday = record.birthday || record.birthDate || '';
  fields.calfNumber = record.calfNumber || record.earTag || '';
  fields.note = record.note ?? record.memo ?? '';
  for (const [alias, canonical] of [['birthDate', 'birthday'], ['earTag', 'calfNumber'], ['memo', 'note']]) {
    if (record[alias] === undefined || record[alias] === fields[canonical]) delete fields[alias];
  }
  for (const key of ['startWeight', 'currentWeight', 'elapsedDays', 'milkAmount', 'starterAmount',
    'weaningWeight', 'weaningStarterAmount']) fields[key] = Number(record[key] ?? 0);
  fields.feedingMethod = record.feedingMethod ?? '人工哺育';
  fields.weaningStatus = record.weaningStatus ?? '離乳前';
  fields.managementStatus = record.managementStatus ?? '育成中';
  if (!fields.deletedAt) delete fields.deletedAt;
  return fields;
}

function sameCalfContent(left: Record<string, unknown>, right: Record<string, unknown>, exactSave = false) {
  return sameAnimalSyncRecord(calfContent(left, exactSave), calfContent(right, exactSave));
}

async function readCloudSyncError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `子牛台帳のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `子牛台帳のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function fetchCloudCalves(context: AnimalSyncContext): Promise<CloudCalfRecord[]> {
  assertAnimalSyncContext(context);
  if (!context.token || !context.farmId || !context.userId) {
    throw new Error('ログイン情報がないため、子牛台帳の同期を保留しています。');
  }
  return withAnimalSyncRequest(async (signal) => {
    const response = await fetch('/api/calves/record-sync', {
      headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store', signal,
    });
    if (!response.ok) throw new Error(await readCloudSyncError(response));
    const records = await response.json() as CloudCalfRecord[];
    assertAnimalSyncContext(context);
    if (!Array.isArray(records) || records.some(record => !record || typeof record.id !== 'string' || !record.id)) {
      throw new Error('子牛台帳のクラウド応答を確認できませんでした。');
    }
    return records;
  });
}

function assertRetryPage(retrying: boolean) {
  if (retrying && !canRetryAnimalSyncOnPage(window.location.pathname)) {
    throw new Error(CALF_SYNC_PENDING);
  }
}

async function acknowledgeCalf(
  record: StoredCalf, remote: CloudCalfRecord, context: AnimalSyncContext, retrying: boolean,
): Promise<boolean> {
  assertAnimalSyncContext(context);
  assertRetryPage(retrying);
  if (remote.id !== calfSyncId(record) || remote.deletedAt ||
      !Number.isFinite(parseTimestamp(remote.cloudUpdatedAt)) ||
      !sameCalfContent(remote, calfRecordForCloud(record), true)) {
    throw new Error('子牛台帳の送信結果が一致しないため、端末の記録を保持しています。');
  }
  return changeMatchingAnimal('calves', context, record.id, record, {
    ...record, cloudUpdatedAt: remote.cloudUpdatedAt, cloudSyncPending: false,
    animalSyncOrigin: undefined, animalSyncBase: undefined, animalSyncAttempt: undefined,
    syncWarning: undefined,
  });
}

/** Runs inside the calves lock. A failed response never replaces the original local edit. */
async function sendSavedCalf(
  input: StoredCalf, context: AnimalSyncContext, remoteRecords?: CloudCalfRecord[], retrying = false,
): Promise<boolean> {
  assertAnimalSyncContext(context);
  assertRetryPage(retrying);
  let record = input;
  if (!isOwnedAnimalSyncPending(record, context)) return false;
  if (!sameAnimalSyncRecord(await getRecordById<StoredCalf>('calves', record.id), record)) return false;
  assertAnimalSyncContext(context);
  let stableId = calfSyncId(record);
  let createOnly = record.animalSyncBase === null;
  let ifMatch = record.animalSyncBase?.cloudUpdatedAt;
  const needsRead = remoteRecords !== undefined || Boolean(record.animalSyncAttempt) || !stableId ||
    (!createOnly && !ifMatch);
  if (needsRead) {
    const records = remoteRecords ?? await fetchCloudCalves(context);
    assertAnimalSyncContext(context);
    assertRetryPage(retrying);
    let matches = stableId ? records.filter(remote => remote.id === stableId) : [];
    if (!stableId && record.animalSyncBase) {
      matches = records.filter(remote => !remote.deletedAt && sameCalfContent(remote, record.animalSyncBase!.record));
      if (matches.length === 1) {
        stableId = matches[0].id;
        const identified = { ...record, syncRecordId: stableId };
        if (!await changeMatchingAnimal('calves', context, record.id, record, identified)) return false;
        record = identified;
      }
    }
    if (!stableId || matches.length > 1) return false;
    const remote = matches[0];
    if (remote?.deletedAt) return false;
    if (remote && sameCalfContent(remote, calfRecordForCloud(record), true)) {
      return acknowledgeCalf(record, remote, context, retrying);
    }
    if (!remote) {
      if (!createOnly) return false;
    } else {
      if (!Number.isFinite(parseTimestamp(remote.cloudUpdatedAt))) return false;
      const previousAttemptArrived = record.animalSyncAttempt && sameCalfContent(remote, record.animalSyncAttempt, true);
      const baselineMatches = record.animalSyncBase && (
        record.animalSyncBase.cloudUpdatedAt
          ? remote.cloudUpdatedAt === record.animalSyncBase.cloudUpdatedAt
          : sameCalfContent(remote, record.animalSyncBase.record)
      );
      if (!previousAttemptArrived && !baselineMatches) return false;
      ifMatch = remote.cloudUpdatedAt;
      createOnly = false;
    }
  }
  if (!stableId || (!createOnly && !ifMatch)) return false;
  assertAnimalSyncContext(context);
  assertRetryPage(retrying);
  const sending: StoredCalf = { ...record, animalSyncAttempt: calfRecordForCloud(record) };
  if (!await changeMatchingAnimal('calves', context, record.id, record, sending)) return false;
  assertAnimalSyncContext(context);
  assertRetryPage(retrying);
  const remote = await syncCalfCreatedFromCalving(sending, { context, createOnly, ifMatch }) as CloudCalfRecord;
  return acknowledgeCalf(sending, remote, context, retrying);
}

/** Send a row already committed by a formal save, without saving it again or changing its date. */
export async function syncSavedCalfIfEnabled(
  record: CalfRecordForSync, context?: AnimalSyncContext,
): Promise<string | null> {
  const sync = async (captured: AnimalSyncContext) => {
    if (!captured.cloudEnabled) return null;
    try {
      return await sendSavedCalf(record as StoredCalf, captured) ? null : CALF_SYNC_PENDING;
    } catch (error) {
      assertAnimalSyncContext(captured);
      console.warn('子牛台帳は端末内に保存しましたが、クラウド同期を保留しています。', error);
      return error instanceof Error ? error.message : CALF_SYNC_PENDING;
    }
  };
  return context ? sync(context) : withAnimalSync('calves', sync);
}

export async function retryPendingCalfSync(): Promise<number> {
  if (!canRetryAnimalSyncOnPage(window.location.pathname)) return 0;
  return withAnimalSync('calves', async context => {
    if (!context.cloudEnabled || !context.token || !canRetryAnimalSyncOnPage(window.location.pathname)) return 0;
    const pending = (await getAllRecords<StoredCalf>('calves')).filter(record => isOwnedAnimalSyncPending(record, context));
    assertAnimalSyncContext(context);
    if (!pending.length) return 0;
    const records = await fetchCloudCalves(context);
    assertRetryPage(true);
    let acknowledged = 0;
    for (const record of pending) {
      assertAnimalSyncContext(context);
      assertRetryPage(true);
      try { if (await sendSavedCalf(record, context, records, true)) acknowledged += 1; }
      catch (error) {
        assertAnimalSyncContext(context);
        assertRetryPage(true);
        console.warn('子牛台帳の再送を保留しています。', error);
      }
    }
    return acknowledged;
  });
}

async function syncCalfDeletionToCloud(record: StoredCalf, context: AnimalSyncContext) {
  const stableId = calfSyncId(record);
  if (!stableId) throw new Error('同期先の子牛を特定できないため、削除を保留しました。端末の記録は保持されています。');
  const records = await fetchCloudCalves(context);
  const matches = records.filter(remote => remote.id === stableId);
  if (matches.length > 1) throw new Error('同期先の子牛が複数あるため、削除を保留しました。');
  const remote = matches[0];
  if (remote?.deletedAt) return;
  let ifMatch: string | undefined;
  if (remote) {
    ifMatch = remote.cloudUpdatedAt;
    if (!Number.isFinite(parseTimestamp(ifMatch))) throw new Error('同期先の更新状態を確認できないため、削除を保留しました。');
    const base = record.animalSyncBase;
    const knownRevision = record.cloudUpdatedAt || base?.cloudUpdatedAt;
    const matchesKnown = knownRevision ? knownRevision === ifMatch : sameCalfContent(remote, record);
    const ownAttempt = isOwnedAnimalSyncPending(record, context) && record.animalSyncAttempt &&
      sameCalfContent(remote, record.animalSyncAttempt, true);
    if (!matchesKnown && !ownAttempt) throw new Error('別の端末で子牛が更新されているため、削除を保留しました。');
  }
  assertAnimalSyncContext(context);
  await withAnimalSyncRequest(async signal => {
    const headers: Record<string, string> = { Authorization: `Bearer ${context.token}` };
    if (ifMatch) headers['If-Match'] = JSON.stringify(ifMatch);
    const response = await fetch(`/api/calves/record-sync/${encodeURIComponent(stableId)}`, {
      method: 'DELETE', headers, signal,
    });
    if (!response.ok) throw new Error(await readCloudSyncError(response));
    const deleted = await response.json() as CloudCalfRecord;
    if (deleted?.id !== stableId || !Number.isFinite(parseTimestamp(deleted.deletedAt))) throw new Error('子牛の削除結果を確認できないため、端末の記録を保持しています。');
    assertAnimalSyncContext(context);
  });
}

function normalizeCloudCalf(record: CloudCalfRecord, id: number, local?: StoredCalf): StoredCalf {
  const birthday = String(record.birthday || record.birthDate || '');
  const motherName = String(record.motherName || record.motherCowName || '');
  const note = record.note !== undefined
    ? String(record.note)
    : String(record.memo || '');

  return {
    ...record,
    id,
    syncRecordId: String(record.id || ''),
    calfNumber: String(record.calfNumber || record.earTag || ''),
    temporaryCalfNumber: record.temporaryCalfNumber,
    identificationNumber: String(record.identificationNumber || ''),
    name: String(record.name || '耳標未装着'),
    birthday,
    birthDate: birthday,
    sex: String(record.sex || '不明'),
    motherName,
    motherCowId: record.motherCowId,
    motherCowName: record.motherCowName,
    breedingMethod: record.breedingMethod,
    geneticMotherCowId: record.geneticMotherCowId,
    geneticMotherCowName: record.geneticMotherCowName,
    recipientCowId: record.recipientCowId,
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
    // Destination cattle IDs differ across devices. Preserve only this device's verified link.
    promotedCattleId: local?.promotedCattleId,
    promotedAt: record.promotedAt,
    note,
    memo: note,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    cloudUpdatedAt: record.cloudUpdatedAt,
    calvingId: record.calvingId,
    cloudSyncPending: false,
    animalSyncOrigin: undefined, animalSyncBase: undefined, animalSyncAttempt: undefined, syncWarning: undefined,
  };
}

function fallbackKey(record: { birthday?: string; birthDate?: string; motherName?: string; motherCowName?: string; sex?: string }) {
  return `${record.birthday || record.birthDate || ''}|${record.motherName || record.motherCowName || ''}|${record.sex || ''}`;
}

function calfIdentificationConflicts(local: Partial<StoredCalf>, cloud: CloudCalfRecord) {
  const left = String(local.identificationNumber || '').trim();
  const right = String(cloud.identificationNumber || '').trim();
  return Boolean(left && right && left !== right);
}

function sameFormalCalfNumber(local: Partial<StoredCalf>, cloud: CloudCalfRecord) {
  const localNumber = String(local.calfNumber || local.earTag || '').trim();
  return Boolean(localNumber && !localNumber.startsWith('TEMP-') &&
    localNumber === String(cloud.calfNumber || cloud.earTag || '').trim());
}

function sameStrongCalfIdentity(local: Partial<StoredCalf>, cloud: CloudCalfRecord) {
  if (calfIdentificationConflicts(local, cloud)) return false;
  const localCalving = String(local.calvingId || '');
  const identification = String(local.identificationNumber || '').trim();
  return Boolean((localCalving && localCalving === String(cloud.calvingId || '')) ||
    (identification && identification === String(cloud.identificationNumber || '').trim()) ||
    sameFormalCalfNumber(local, cloud));
}

async function pullCalfChangesFromCloud(context: AnimalSyncContext): Promise<number> {
  if (!context.cloudEnabled || !context.token) return 0;
  const cloudRecords = await fetchCloudCalves(context);
  let localRecords = await getAllRecords<StoredCalf>('calves');
  assertAnimalSyncContext(context);
  let nextId = localRecords.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  let applied = 0;

  for (const remote of cloudRecords) {
    assertAnimalSyncContext(context);
    if (cloudRecords.filter(item => item.id === remote.id).length !== 1) continue;
    const exactMatches = localRecords.filter(item => calfSyncId(item) === remote.id);
    if (exactMatches.length > 1) continue;
    let local = exactMatches[0];
    if (!local && !remote.deletedAt) {
      // An old ear tag alone must not attach another animal's stable ID. Do not
      // insert a second row either: list deduplication would hide this conflict.
      if (localRecords.some(item => !calfSyncId(item) && sameFormalCalfNumber(item, remote) &&
          calfIdentificationConflicts(item, remote))) continue;
      const legacy = localRecords.filter(item => !calfSyncId(item) && sameStrongCalfIdentity(item, remote));
      if (legacy.length > 1) continue;
      local = legacy[0];
    }
    // Pending records, including copied queues, are never overwritten by a read.
    if (local?.cloudSyncPending) continue;
    if (remote.deletedAt) {
      if (!local) continue;
      const deletedTime = parseTimestamp(remote.deletedAt || remote.updatedAt);
      const localTime = parseTimestamp(local.updatedAt);
      const remoteRevision = parseTimestamp(remote.cloudUpdatedAt);
      const localRevision = parseTimestamp(local.cloudUpdatedAt);
      if (!Number.isFinite(deletedTime) || (Number.isFinite(localTime) && localTime > deletedTime) ||
          (Number.isFinite(localRevision) && (!Number.isFinite(remoteRevision) || remoteRevision < localRevision))) continue;
      if (await changeMatchingAnimal('calves', context, local.id, local, undefined)) {
        localRecords = localRecords.filter(item => item.id !== local.id);
        applied += 1;
      }
      continue;
    }
    if (local) {
      const localTime = parseTimestamp(local.updatedAt);
      const remoteTime = parseTimestamp(remote.updatedAt);
      if (Number.isFinite(localTime) && Number.isFinite(remoteTime) && localTime > remoteTime) continue;
      if (!cloudRecordIsNewer(remote, local)) {
        if (!local.syncRecordId && sameCalfContent(local, remote)) {
          const identified = { ...local, syncRecordId: remote.id };
          if (await changeMatchingAnimal('calves', context, local.id, local, identified)) {
            localRecords = localRecords.map(item => item.id === local.id ? identified : item);
          }
        }
        continue;
      }
    }
    const imported = normalizeCloudCalf(remote, local?.id ?? nextId++, local);
    if (await changeMatchingAnimal('calves', context, imported.id, local, imported)) {
      localRecords = local ? localRecords.map(item => item.id === local.id ? imported : item) : [...localRecords, imported];
      applied += 1;
    }
  }
  return applied;
}

async function validateCalfUniqueness(input: CalfInput, currentId?: number) {
  const calves = await getAllRecords<StoredCalf>('calves');

  const duplicateEarTag = calves.find(
    (item) =>
      item.id !== currentId &&
      String(item.calfNumber || '').trim() === input.calfNumber,
  );
  if (duplicateEarTag) {
    throw new Error(`耳標番号「${input.calfNumber}」はすでに子牛台帳へ登録されています。`);
  }

  if (input.identificationNumber) {
    const duplicateIdentificationNumber = calves.find(
      (item) =>
        item.id !== currentId &&
        String(item.identificationNumber ?? '').trim() === input.identificationNumber,
    );
    if (duplicateIdentificationNumber) {
      throw new Error(
        `個体識別番号「${input.identificationNumber}」はすでに子牛台帳へ登録されています。`,
      );
    }
  }
}

function dedupeLocalCalfList(records: StoredCalf[]): StoredCalf[] {
  const groups: StoredCalf[][] = [];

  const strongIdentity = (record: StoredCalf) => {
    const calvingId = String(record.calvingId || '').trim();
    const identificationNumber = String(record.identificationNumber || '').trim();
    const calfNumber = String(record.calfNumber || record.earTag || '').trim();
    return {
      calvingId,
      identificationNumber,
      calfNumber: calfNumber && !calfNumber.startsWith('TEMP-') ? calfNumber : '',
    };
  };

  const sameCalf = (a: StoredCalf, b: StoredCalf) => {
    const left = strongIdentity(a);
    const right = strongIdentity(b);
    return Boolean(
      (left.calvingId && left.calvingId === right.calvingId) ||
      (left.identificationNumber && left.identificationNumber === right.identificationNumber) ||
      (left.calfNumber && left.calfNumber === right.calfNumber),
    );
  };

  for (const record of records) {
    const matchingIndexes = groups
      .map((group, index) => group.some((item) => sameCalf(item, record)) ? index : -1)
      .filter((index) => index >= 0);

    if (matchingIndexes.length === 0) {
      groups.push([record]);
      continue;
    }

    const firstIndex = matchingIndexes[0];
    groups[firstIndex].push(record);

    for (let i = matchingIndexes.length - 1; i >= 1; i -= 1) {
      const mergeIndex = matchingIndexes[i];
      groups[firstIndex].push(...groups[mergeIndex]);
      groups.splice(mergeIndex, 1);
    }
  }

  return groups.flatMap((group) => group.some(record => record.cloudSyncPending)
    ? group.filter(record => record.cloudSyncPending)
    : [group.reduce((latest, record) => {
      const recordUpdatedAt = parseTimestamp(record.updatedAt);
      const latestUpdatedAt = parseTimestamp(latest.updatedAt);
      if (Number.isNaN(latestUpdatedAt)) return record;
      if (Number.isNaN(recordUpdatedAt)) return latest;
      return recordUpdatedAt > latestUpdatedAt ? record : latest;
    })],
  );
}

export async function getCalfList() {
  return withAnimalSync('calves', async context => {
    try { await pullCalfChangesFromCloud(context); }
    catch (error) {
      assertAnimalSyncContext(context);
      console.warn('子牛台帳のクラウド取り込みをスキップしました', error);
    }
    const records = await getAllRecords<StoredCalf>('calves');
    assertAnimalSyncContext(context);
    return dedupeLocalCalfList(records);
  });
}

export async function getCalfListForHomeSummary(): Promise<Calf[]> {
  return withAnimalSync('calves', async context => {
  const local = await getAllRecords<StoredCalf>('calves');
  assertAnimalSyncContext(context);
  if (!context.cloudEnabled || !context.token) return dedupeLocalCalfList(local);
  try {
    const cloudRecords = await fetchCloudCalves(context);
    const pending = local.filter(record => record.cloudSyncPending);
    const activeCloudRecords = cloudRecords.filter((record) => !record.deletedAt);
    const groups: CloudCalfRecord[][] = [];

    const identityValues = (record: CloudCalfRecord) => {
      const calvingId = String(record.calvingId || '').trim();
      const identificationNumber = String(record.identificationNumber || '').trim();
      const calfNumber = String(record.calfNumber || record.earTag || '').trim();
      const fallback = fallbackKey(record);
      return {
        calvingId,
        identificationNumber,
        calfNumber: calfNumber && !calfNumber.startsWith('TEMP-') ? calfNumber : '',
        fallback,
      };
    };

    const sameCalf = (a: CloudCalfRecord, b: CloudCalfRecord) => {
      const left = identityValues(a);
      const right = identityValues(b);
      return Boolean(
        (left.calvingId && left.calvingId === right.calvingId) ||
        (left.identificationNumber && left.identificationNumber === right.identificationNumber) ||
        (left.calfNumber && left.calfNumber === right.calfNumber) ||
        (left.fallback && left.fallback === right.fallback),
      );
    };

    for (const record of activeCloudRecords) {
      const matchingIndexes = groups
        .map((group, index) => group.some((item) => sameCalf(item, record)) ? index : -1)
        .filter((index) => index >= 0);

      if (matchingIndexes.length === 0) {
        groups.push([record]);
        continue;
      }

      const firstIndex = matchingIndexes[0];
      groups[firstIndex].push(record);

      for (let i = matchingIndexes.length - 1; i >= 1; i -= 1) {
        const mergeIndex = matchingIndexes[i];
        groups[firstIndex].push(...groups[mergeIndex]);
        groups.splice(mergeIndex, 1);
      }
    }

    const visibleCloud = groups
      .map((group) => group.reduce((latest, record) =>
        cloudRecordIsNewer(record, normalizeCloudCalf(latest, 1)) ? record : latest
      ))
      .filter(record => !pending.some(item => calfSyncId(item) === record.id ||
        (!calfSyncId(item) && sameStrongCalfIdentity(item, record))))
      .map((record, index) => normalizeCloudCalf(record, index + 1));
    assertAnimalSyncContext(context);
    return [...visibleCloud, ...pending];
  } catch (error) {
    assertAnimalSyncContext(context);
    console.warn('ホームの子牛集計は端末内データへフォールバックしました', error);
    return dedupeLocalCalfList(local);
  }
  });
}

export async function getCalf(id: string) {
  const context = getAnimalSyncContext();
  const numericId = parseCalfId(id);
  const calf = await getRecordById<StoredCalf>('calves', numericId);
  assertAnimalSyncContext(context);
  if (!calf) throw new Error('指定された子牛が見つかりません。');
  return calf;
}

async function saveAndSyncCalf(next: StoredCalf, previous: StoredCalf | undefined, context: AnimalSyncContext) {
  assertAnimalSyncContext(context);
  const now = new Date().toISOString();
  const saved = prepareCalfSyncRecord({
    ...next, createdAt: previous?.createdAt || next.createdAt || now, updatedAt: now,
  }, previous, context);
  if (!await changeMatchingAnimal('calves', context, saved.id, previous, saved)) {
    throw new Error('子牛の記録が変更されたため、保存を中止しました。画面を開き直してください。');
  }
  const syncWarning = await syncSavedCalfIfEnabled(saved, context);
  const current = await getRecordById<StoredCalf>('calves', saved.id);
  assertAnimalSyncContext(context);
  return { ...(current ?? saved), syncWarning };
}

export async function createCalf(input: CalfInput) {
  return withAnimalSync('calves', async context => {
    const normalized = normalizeInput(input);
    const calves = await getAllRecords<StoredCalf>('calves');
    assertAnimalSyncContext(context);
    const nextId = calves.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const temporaryCalfNumber = normalized.calfNumber ? undefined : `TEMP-MANUAL-${nextId}`;
    const prepared: CalfInput = {
      ...normalized, calfNumber: normalized.calfNumber || temporaryCalfNumber || '',
      name: normalized.name || '耳標未装着',
    };
    await validateCalfUniqueness(prepared);
    return saveAndSyncCalf({
      id: nextId, ...prepared, temporaryCalfNumber, syncRecordId: `manual-calf:${crypto.randomUUID()}`,
    }, undefined, context);
  });
}

async function editCalf(id: string, edit: (existing: StoredCalf) => Promise<StoredCalf>) {
  return withAnimalSync('calves', async context => {
    const numericId = parseCalfId(id);
    const existing = await getRecordById<StoredCalf>('calves', numericId);
    assertAnimalSyncContext(context);
    if (!existing) throw new Error('更新対象の子牛が見つかりません。');
    const next = await edit(existing);
    assertAnimalSyncContext(context);
    if (next === existing) return existing;
    return saveAndSyncCalf(next, existing, context);
  });
}

export async function updateCalf(id: string, input: CalfInput) {
  return editCalf(id, async existing => {
    const normalized = normalizeInput(input);
    await validateCalfUniqueness(normalized, existing.id);
    return { ...existing, ...normalized, memo: normalized.note, id: existing.id };
  });
}

export async function markCalfSold(id: string): Promise<Calf> {
  return editCalf(id, async existing => ({ ...existing, managementStatus: '販売済み' }));
}

export async function resetCalfSoldStatus(id: string): Promise<Calf> {
  return editCalf(id, async existing => existing.managementStatus !== '販売済み' ? existing :
    { ...existing, managementStatus: '育成中' });
}

export async function registerCalfEarTag(id: string, earTag: string): Promise<Calf> {
  return editCalf(id, async existing => {
    const normalizedEarTag = earTag.trim();
    if (!normalizedEarTag) throw new Error('正式な耳標番号を入力してください。');
    if (normalizedEarTag.startsWith('TEMP-')) throw new Error('仮管理番号ではなく、正式な耳標番号を入力してください。');
    const calves = await getAllRecords<StoredCalf>('calves');
    if (calves.some(item => item.id !== existing.id && String(item.calfNumber || '').trim() === normalizedEarTag)) {
      throw new Error(`耳標番号「${normalizedEarTag}」はすでに子牛台帳へ登録されています。`);
    }
    return {
      ...existing, calfNumber: normalizedEarTag,
      temporaryCalfNumber: existing.temporaryCalfNumber ||
        (String(existing.calfNumber || '').startsWith('TEMP-') ? existing.calfNumber : undefined),
    };
  });
}

export async function registerCalfName(id: string, name: string): Promise<Calf> {
  return editCalf(id, async existing => {
    const normalizedName = name.trim();
    if (!normalizedName) throw new Error('名号を入力してください。');
    return { ...existing, name: normalizedName };
  });
}

export async function promoteCalf(id: string): Promise<Cattle> {
  return withAnimalSync('calves', async context => {
    const calf = await getRecordById<StoredCalf>('calves', parseCalfId(id));
    assertAnimalSyncContext(context);
    if (!calf) throw new Error('指定された子牛が見つかりません。');
    if (calf.promotedCattleId) throw new Error('この子牛はすでに牛台帳へ移行済みです。');
    if (!calf.calfNumber || calf.calfNumber.startsWith('TEMP-')) {
      throw new Error('牛台帳へ移行する前に、正式な耳標番号を登録してください。');
    }
    const retainedAt = new Date().toISOString();
    const acquisitionCost = await getRetainedCalfProductionCost(calf.id);
    assertAnimalSyncContext(context);
    const cattle = await createCattle({
      earTag: calf.calfNumber, identificationNumber: calf.identificationNumber ?? '', name: calf.name,
      birthday: calf.birthday, sex: normalizeCattleSex(calf.sex), sire: calf.sireName || '',
      dam: calf.geneticMotherCowName || calf.motherName, parity: 0, blvStatus: '未検査', stage: '育成牛',
      sourceCalfId: calf.id, acquisitionMethod: 'retained', acquisitionDate: retainedAt.slice(0, 10),
      acquisitionCost, note: calf.note,
    });
    assertAnimalSyncContext(context);
    await saveAndSyncCalf({
      ...calf, managementStatus: '牛台帳へ移行済み', promotedCattleId: cattle.id, promotedAt: retainedAt,
    }, calf, context);
    return cattle;
  });
}

export async function deleteCalf(id: number) {
  return withAnimalSync('calves', async context => {
    const existing = await getRecordById<StoredCalf>('calves', id);
    assertAnimalSyncContext(context);
    if (!existing) return;
    if (context.cloudEnabled) await syncCalfDeletionToCloud(existing, context);
    if (!await changeMatchingAnimal('calves', context, id, existing, undefined)) {
      throw new Error('子牛が変更されたため、端末内の記録を保持しています。画面を開き直してください。');
    }
  });
}
