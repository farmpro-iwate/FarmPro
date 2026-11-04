import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import { openFarmProDatabase } from '../storage/db';
import { getAuthToken } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import type { CalfRecordForSync } from './calfRecordSync';
import { prepareCalfSyncRecord, syncSavedCalfIfEnabled } from './calfApi';
import { assertAnimalSyncContext, sameAnimalSyncRecord, withAnimalSync } from './animalRecordSyncSafety';
import {
  assertCalvingSyncContext,
  calvingSyncContext,
  pullNewerCalvingRecordsFromCloud as pullCalvingRecordsFromCloud,
  withCalvingSync,
  withCalvingSyncRequest,
  type CalvingSyncContext,
} from './calvingRecordSync';
import type { StoredRecord } from '../storage/types';

export type CalvingRecord = {
  id?: string;
  cowId?: string;
  cattleId?: string;
  cowName?: string;
  expectedCalvingDate?: string;
  actualCalvingDate?: string;
  calfName?: string;
  calfSex?: string;
  birthWeightKg?: number | string;
  calvingResult?: string;
  colostrumStatus?: string;
  memo?: string;
  registeredToCalfLedger?: boolean;
  calfId?: string;
  calfRecoveryDismissedAt?: string;
  breedingId?: string;
  breedingLinked?: boolean;
  breedingLinkedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  daysFromExpected?: number | null;
  calvingSyncFreeEditPending?: boolean;
};

type StoredCalvingRecord = CalvingRecord & { id: string; deletedAt?: string };

type StoredBreedingRecord = StoredRecord & {
  id: string | number;
  recordKind?: string;
  cowEarTag?: string;
  cowId?: string;
  cowName?: string;
  pregnancyResult?: string;
  breedingStatus?: string;
  status?: string;
  breedingMethod?: string;
  expectedCalvingDate?: string;
  bullName?: string;
  donorCowName?: string;
  donorCowEarTag?: string;
  embryoSireName?: string;
  note?: string;
  calvingId?: string;
  calvedAt?: string;
};

type StoredCalfRecord = CalfRecordForSync & {
  id: number;
  name?: string;
  calfNumber?: string;
  earTag?: string;
  sex?: string;
  birthday?: string;
  birthDate?: string;
  birthWeightKg?: number;
  startWeight?: number;
  currentWeight?: number;
  motherCowId?: string;
  motherName?: string;
  motherCowName?: string;
  recipientCowId?: string;
  recipientCowName?: string;
  geneticMotherCowId?: string;
  geneticMotherCowName?: string;
  sireName?: string;
  breedingMethod?: string;
  breedingId?: string;
  calvingId?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
};

export type RegisterCalfResponse = {
  ok: boolean;
  calf: StoredCalfRecord;
  calving: CalvingRecord;
};

export type CalfRecoveryCandidate = {
  calvingId: string;
  calfId?: string;
  calfName: string;
  calfSex: string;
  actualCalvingDate: string;
  cowName: string;
};

export async function getCalfRecoveryCandidates(): Promise<CalfRecoveryCandidate[]> {
  const [calvings, calves] = await Promise.all([
    getAllRecords<StoredCalvingRecord>('calvings'),
    getAllRecords<StoredCalfRecord>('calves'),
  ]);

  const existingCalvingIds = new Set(
    calves
      .map((calf) => String(calf.calvingId || '').trim())
      .filter(Boolean),
  );

  return calvings
    .filter((record) =>
      Boolean(record.id) &&
      !record.deletedAt &&
      Boolean(record.registeredToCalfLedger) &&
      !record.calfRecoveryDismissedAt &&
      normalizeCalvingResult(record.calvingResult) !== '死産' &&
      Boolean(record.actualCalvingDate) &&
      !existingCalvingIds.has(String(record.id)),
    )
    .map((record) => ({
      calvingId: String(record.id),
      calfId: record.calfId || '',
      calfName: String(record.calfName || '').trim(),
      calfSex: String(record.calfSex || '不明'),
      actualCalvingDate: String(record.actualCalvingDate || ''),
      cowName: String(record.cowName || '').trim(),
    }))
    .sort((a, b) => b.actualCalvingDate.localeCompare(a.actualCalvingDate));
}

export async function dismissCalfRecoveryCandidate(calvingId: string) {
  const context = calvingSyncContext();
  const existing = await getRecordById<StoredCalvingRecord>('calvings', calvingId);
  assertCalvingSyncContext(context);
  if (!existing || existing.deletedAt) throw new Error('分娩記録が見つかりません。');

  const saved = await saveRecord<StoredCalvingRecord>('calvings', protectFreeCalvingEdit({
    ...existing,
    calfRecoveryDismissedAt: new Date().toISOString(),
  }, getFarmProPlan(context.plan).multiDeviceSync));
  assertCalvingSyncContext(context);
  return withComputedFields(await syncSavedCalvingIfEnabled(saved, context));
}

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

async function readSyncApiError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `分娩記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `分娩記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

function protectFreeCalvingEdit(
  record: StoredCalvingRecord, cloudEnabled: boolean, existing?: StoredCalvingRecord,
): StoredCalvingRecord {
  return !cloudEnabled || existing?.calvingSyncFreeEditPending || record.calvingSyncFreeEditPending
    ? { ...record, calvingSyncFreeEditPending: true } : record;
}

function calvingRecordForCloud(record: StoredCalvingRecord): StoredCalvingRecord {
  const { calvingSyncFreeEditPending: _pending, ...business } = record;
  return business;
}

async function acknowledgeFreeCalvingEdit(record: StoredCalvingRecord, context: CalvingSyncContext): Promise<StoredCalvingRecord> {
  assertCalvingSyncContext(context);
  const database = await openFarmProDatabase();
  assertCalvingSyncContext(context);
  const acknowledged = calvingRecordForCloud(record);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('calvings', 'readwrite');
    const store = transaction.objectStore('calvings');
    const request = store.get(record.id);
    let accepted = false;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        assertCalvingSyncContext(context);
        // Metadata is part of the original. An ACK must not clear another
        // Free edit or recreate a row removed by a restore or concurrent writer.
        if (!sameAnimalSyncRecord(request.result, record)) return;
        store.put(acknowledged);
        accepted = true;
      } catch (error) { failure = error; transaction.abort(); }
    };
    transaction.onabort = transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('分娩記録の保存確認に失敗しました。'));
    transaction.oncomplete = () => {
      try { assertCalvingSyncContext(context); resolve(accepted ? acknowledged : record); }
      catch (error) { reject(error); }
    };
  });
}

async function syncCalvingRecordToCloud(record: StoredCalvingRecord, context: CalvingSyncContext) {
  assertCalvingSyncContext(context);
  const token = context.token;
  if (!token) throw new Error('ログイン情報がないため分娩記録を同期できません。');
  const wire = calvingRecordForCloud(record);

  const send = async (signal: AbortSignal) => {
    const response = await fetch(`/api/calvings/record-sync/${encodeURIComponent(record.id)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(wire),
      signal,
    });
    assertCalvingSyncContext(context);
    if (!response.ok) throw new Error(await readSyncApiError(response));
    if (record.calvingSyncFreeEditPending) {
      const acknowledged = await response.json() as Record<string, unknown> | null;
      assertCalvingSyncContext(context);
      // A legacy server can return a tombstone with HTTP 200. Only a matching
      // live acknowledgement may release the locally protected Free edit.
      if (!acknowledged || Array.isArray(acknowledged) || acknowledged.deletedAt ||
          String(acknowledged.id) !== String(record.id) || Object.entries(wire).some(([key, value]) =>
            key !== 'id' && value !== undefined && !sameAnimalSyncRecord(acknowledged[key], value))) {
        throw new Error('分娩記録の保存結果を確認できません。端末の編集内容を保持しています。');
      }
    }
  };
  await withCalvingSyncRequest(send);
}

async function syncSavedCalvingIfEnabled(record: StoredCalvingRecord, context: CalvingSyncContext): Promise<StoredCalvingRecord> {
  assertCalvingSyncContext(context);
  if (!getFarmProPlan(context.plan).multiDeviceSync) return record;
  try {
    await syncCalvingRecordToCloud(record, context);
    if (record.calvingSyncFreeEditPending) return await acknowledgeFreeCalvingEdit(record, context);
  } catch (error) {
    console.warn('分娩記録は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
  return record;
}

export async function pullNewerCalvingRecordsFromCloud(): Promise<number> {
  if (!shouldUseCloudSync()) return 0;
  if (!getAuthToken()) throw new Error('ログイン情報がないため分娩記録を同期できません。');
  // Plan readers and the calving list must apply the same deletion rules.
  return (await pullCalvingRecordsFromCloud()).applied;
}

async function syncCalvingDeletionToCloud(id: string, context: CalvingSyncContext) {
  assertCalvingSyncContext(context);
  if (!getFarmProPlan(context.plan).multiDeviceSync) return;

  const token = context.token;
  if (!token) throw new Error('ログイン情報がないため分娩記録を削除できません。');

  await withCalvingSyncRequest(async (signal) => {
    const response = await fetch(`/api/calvings/record-sync/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    assertCalvingSyncContext(context);
    if (!response.ok) throw new Error(await readSyncApiError(response));
  });
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCalvingResult(result?: string) {
  if (!result) return '自然分娩';
  if (result === '正常') return '自然分娩';
  if (result === '介助分娩' || result === '要確認') return '難産';
  if (result === '中止') return '死産';
  return result;
}

function daysDifference(actual?: string, expected?: string) {
  if (!actual || !expected) return null;
  const actualDate = new Date(`${actual}T00:00:00`);
  const expectedDate = new Date(`${expected}T00:00:00`);
  if (Number.isNaN(actualDate.getTime()) || Number.isNaN(expectedDate.getTime())) return null;
  return Math.round((actualDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeRecord(input: CalvingRecord, existing?: StoredCalvingRecord): StoredCalvingRecord {
  const birthWeight = input.birthWeightKg === '' || input.birthWeightKg === undefined || input.birthWeightKg === null
    ? ''
    : Number(input.birthWeightKg);

  return {
    ...existing,
    ...input,
    id: existing?.id || input.id || createId('calving'),
    cowId: input.cowId || '',
    cowName: input.cowName || '',
    expectedCalvingDate: input.expectedCalvingDate || '',
    actualCalvingDate: input.actualCalvingDate || '',
    calfName: input.calfName || '',
    calfSex: input.calfSex || '不明',
    birthWeightKg: Number.isNaN(birthWeight) ? '' : birthWeight,
    calvingResult: normalizeCalvingResult(input.calvingResult),
    colostrumStatus: input.colostrumStatus || '未確認',
    memo: input.memo || '',
    registeredToCalfLedger: Boolean(input.registeredToCalfLedger ?? existing?.registeredToCalfLedger),
    calfId: input.calfId || existing?.calfId || '',
    calfRecoveryDismissedAt: input.calfRecoveryDismissedAt || existing?.calfRecoveryDismissedAt || '',
    breedingId: input.breedingId || existing?.breedingId || '',
    breedingLinked: Boolean(input.breedingLinked ?? existing?.breedingLinked),
    breedingLinkedAt: input.breedingLinkedAt || existing?.breedingLinkedAt || '',
  };
}

function withComputedFields(record: StoredCalvingRecord): CalvingRecord {
  return {
    ...record,
    calvingResult: normalizeCalvingResult(record.calvingResult),
    daysFromExpected: daysDifference(record.actualCalvingDate, record.expectedCalvingDate),
  };
}

function isDuplicateCalf(calves: StoredCalfRecord[], record: StoredCalvingRecord) {
  const calfName = (record.calfName || '').trim();
  const birthDate = (record.actualCalvingDate || '').trim();
  const motherCowId = (record.cowId || '').trim();
  const motherCowName = (record.cowName || '').trim();

  return calves.some((calf) => {
    const sameName = Boolean(calfName) && [calf.name, calf.earTag].some((v) => String(v || '').trim() === calfName);
    const sameBirthMother = Boolean(birthDate) && String(calf.birthDate || '').trim() === birthDate &&
      ((Boolean(motherCowId) && String(calf.recipientCowId || calf.motherCowId || '').trim() === motherCowId) ||
       (Boolean(motherCowName) && String(calf.recipientCowName || calf.motherCowName || '').trim() === motherCowName));
    return sameName || sameBirthMother;
  });
}

function waitForRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('データ処理に失敗しました。'));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('保存処理に失敗しました。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('保存処理が中断されました。'));
  });
}

/** List readers must never register a calf or update a mother-cattle link. */
export async function fetchCalvingsReadOnly(): Promise<CalvingRecord[]> {
  const records = await getAllRecords<StoredCalvingRecord>('calvings');
  return records.filter(record => !record.deletedAt).map(withComputedFields);
}

export async function fetchCalvings() {
  const records = (await getAllRecords<StoredCalvingRecord>('calvings'))
    .filter((record) => !record.deletedAt);
  let changed = false;

  for (const record of records) {
    const canCreateCalf = Boolean(
      record.id &&
      normalizeCalvingResult(record.calvingResult) !== '死産' &&
      record.actualCalvingDate
    );
    const shouldAutoCreateCalf = canCreateCalf && !record.registeredToCalfLedger;

    // Once a calving has been registered to the calf ledger, do not recreate the calf automatically
    // if the linked calf is later missing. The user may have intentionally deleted that calf.
    // Recreating it here caused deleted calves to return when Home loaded fetchCalvings().
    if (!shouldAutoCreateCalf) continue;

    try {
      await registerCalvingToCalfLedger(record.id);
      changed = true;
    } catch {
      // If an older record needs manual reconciliation (for example because a duplicate already exists),
      // leave it untouched rather than blocking the rest of the calving list.
    }
  }

  const latestRecords = changed
    ? await getAllRecords<StoredCalvingRecord>('calvings')
    : records;

  return latestRecords.filter((record) => !record.deletedAt).map(withComputedFields);
}

export async function fetchCalving(id: string) {
  const record = await getRecordById<StoredCalvingRecord>('calvings', id);
  if (!record || record.deletedAt) throw new Error('分娩記録が見つかりません。');
  return withComputedFields(record);
}

export async function createCalving(record: CalvingRecord) {
  const context = calvingSyncContext();
  const normalized = protectFreeCalvingEdit(normalizeRecord(record), getFarmProPlan(context.plan).multiDeviceSync);
  if (!record.breedingId) {
    const saved = await saveRecord('calvings', normalized);
    return withComputedFields(await syncSavedCalvingIfEnabled(saved, context));
  }

  const database = await openFarmProDatabase();
  const transaction = database.transaction(['calvings', 'breedings'], 'readwrite');
  const calvingsStore = transaction.objectStore('calvings');
  const breedingsStore = transaction.objectStore('breedings');
  let breeding = await waitForRequest(
    breedingsStore.get(record.breedingId) as IDBRequest<StoredBreedingRecord | undefined>,
  );

  if (!breeding && /^\d+$/.test(String(record.breedingId))) {
    breeding = await waitForRequest(
      breedingsStore.get(Number(record.breedingId)) as IDBRequest<StoredBreedingRecord | undefined>,
    );
  }

  if (!breeding) {
    transaction.abort();
    throw new Error('連携する繁殖記録が見つかりません。');
  }
  if (breeding.calvingId) {
    const linkedRecord = await waitForRequest(
      calvingsStore.get(String(breeding.calvingId)) as IDBRequest<StoredCalvingRecord | undefined>,
    );
    if (linkedRecord) {
      transaction.abort();
      throw new Error('この繁殖記録はすでに分娩記録へ連携済みです。');
    }
  }

  const now = new Date().toISOString();
  const linkedCalving: StoredCalvingRecord = {
    ...normalized,
    breedingId: String(breeding.id),
    breedingLinked: true,
    breedingLinkedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const updatedBreeding: StoredBreedingRecord = {
    ...breeding,
    ...(breeding.recordKind === 'advanced'
      ? { status: '分娩済み' }
      : { breedingStatus: '分娩済み' }),
    calvingId: linkedCalving.id,
    calvedAt: record.actualCalvingDate || now,
    updatedAt: now,
  };

  await Promise.all([
    waitForRequest(calvingsStore.put(linkedCalving)),
    waitForRequest(breedingsStore.put(updatedBreeding)),
  ]);
  await waitForTransaction(transaction);
  return withComputedFields(await syncSavedCalvingIfEnabled(linkedCalving, context));
}

export async function updateCalving(id: string, record: CalvingRecord) {
  return withCalvingSync(async (context) => {
    const existing = await getRecordById<StoredCalvingRecord>('calvings', id);
    assertCalvingSyncContext(context);
    if (!existing || existing.deletedAt) throw new Error('分娩記録が見つかりません。');
    const saved = await saveRecord('calvings', protectFreeCalvingEdit(
      normalizeRecord({ ...record, id }, existing), getFarmProPlan(context.plan).multiDeviceSync, existing,
    ));
    assertCalvingSyncContext(context);
    const acknowledged = await syncSavedCalvingIfEnabled(saved, context);
    assertCalvingSyncContext(context);
    return withComputedFields(acknowledged);
  });
}

export async function deleteCalving(id: string) {
  return withCalvingSync(async (context) => {
    const existing = await getRecordById<StoredCalvingRecord>('calvings', id);
    assertCalvingSyncContext(context);
    if (!existing || existing.deletedAt) throw new Error('分娩記録が見つかりません。');

    await syncCalvingDeletionToCloud(id, context);
    assertCalvingSyncContext(context);

    if (existing.breedingId) {
      const breeding = await getRecordById<StoredBreedingRecord>(
        'breedings',
        existing.breedingId,
      );
      assertCalvingSyncContext(context);

      if (breeding && String(breeding.calvingId || '') === id) {
        await saveRecord('breedings', {
          ...breeding,
          ...(breeding.recordKind === 'advanced'
            ? { status: '受胎' }
            : { breedingStatus: '受胎' }),
          calvingId: '',
          calvedAt: '',
          updatedAt: new Date().toISOString(),
        });
        assertCalvingSyncContext(context);
      }
    }

    await deleteRecord('calvings', id);
    assertCalvingSyncContext(context);
    return { ok: true };
  });
}

export async function registerCalvingToCalfLedger(id: string): Promise<RegisterCalfResponse> {
  return withAnimalSync('calves', async context => {
    const record = await getRecordById<StoredCalvingRecord>('calvings', id);
    assertAnimalSyncContext(context);
    if (!record || record.deletedAt) throw new Error('分娩記録が見つかりません。');
    if (normalizeCalvingResult(record.calvingResult) === '死産') throw new Error('死産の記録は子牛台帳へ登録しません。');
    if (!record.actualCalvingDate) throw new Error('実分娩日がないため、子牛台帳へ登録できません。');

    const calves = await getAllRecords<StoredCalfRecord>('calves');
    assertAnimalSyncContext(context);
    const linkedCalf = calves.find((calf) => String(calf.calvingId || '') === record.id);
    if (record.registeredToCalfLedger && linkedCalf) {
      throw new Error('この分娩記録はすでに子牛台帳へ登録済みです。');
    }
    if (isDuplicateCalf(calves, record)) {
      throw new Error('同じ子牛耳標番号、または同じ分娩母・生年月日の子牛がすでに子牛台帳にある可能性があります。重複を確認してください。');
    }

    const breeding = record.breedingId
      ? await getRecordById<StoredBreedingRecord>('breedings', record.breedingId)
      : undefined;
    assertAnimalSyncContext(context);
    const isEt = breeding?.breedingMethod === '受精卵移植';
    const geneticMotherCowId = isEt ? breeding?.donorCowEarTag || '' : record.cowId || '';
    const geneticMotherCowName = isEt ? breeding?.donorCowName || '' : record.cowName || '';
    const sireName = isEt ? breeding?.embryoSireName || '' : breeding?.bullName || '';

    const now = new Date().toISOString();
    const nextCalfId = calves.reduce((max, calf) => Math.max(max, Number(calf.id) || 0), 0) + 1;
    const existingCalfId = Number(record.calfId);
    const preferredCalfIdAvailable = Number.isInteger(existingCalfId) && existingCalfId > 0 &&
      !calves.some((calf) => Number(calf.id) === existingCalfId);
    const calfId = preferredCalfIdAvailable ? existingCalfId : nextCalfId;
    const calfEarTag = (record.calfName || '').trim();
    const temporaryCalfNumber = `TEMP-${record.id}`;
    const birthWeight = typeof record.birthWeightKg === 'number' && Number.isFinite(record.birthWeightKg)
      ? record.birthWeightKg
      : 0;
    const memoLines = [
      record.memo || '',
      `分娩記録ID: ${record.id}`,
      record.breedingId ? `繁殖記録ID: ${record.breedingId}` : '',
      isEt ? '繁殖方法: 受精卵移植' : breeding?.breedingMethod ? `繁殖方法: ${breeding.breedingMethod}` : '',
      isEt ? `分娩母・受卵牛: ${record.cowId || '-'} ${record.cowName || ''}`.trim() : '',
      geneticMotherCowName || geneticMotherCowId
        ? `遺伝的母牛: ${geneticMotherCowId || '-'} ${geneticMotherCowName || ''}`.trim()
        : '',
      sireName ? `父牛: ${sireName}` : '',
      record.calvingResult ? `分娩結果: ${normalizeCalvingResult(record.calvingResult)}` : '',
      record.colostrumStatus ? `初乳確認: ${record.colostrumStatus}` : '',
    ].filter(Boolean);

    const calf = prepareCalfSyncRecord<StoredCalfRecord>({
      id: calfId,
      // The calving form's calfName field contains the ear tag, not the name.
      name: '',
      calfNumber: calfEarTag || temporaryCalfNumber,
      earTag: calfEarTag,
      sex: record.calfSex || '不明',
      birthday: record.actualCalvingDate,
      birthDate: record.actualCalvingDate,
      birthWeightKg: birthWeight,
      startWeight: birthWeight,
      currentWeight: birthWeight,
      motherCowId: geneticMotherCowId,
      motherName: geneticMotherCowName,
      motherCowName: geneticMotherCowName,
      recipientCowId: record.cowId || '',
      recipientCowName: record.cowName || '',
      geneticMotherCowId,
      geneticMotherCowName,
      sireName,
      breedingMethod: breeding?.breedingMethod || '',
      breedingId: record.breedingId || '',
      calvingId: record.id,
      memo: memoLines.join('\n'),
      createdAt: now,
      updatedAt: now,
    }, undefined, context);

    const updatedCalving = protectFreeCalvingEdit({
      ...record,
      registeredToCalfLedger: true,
      calfId: String(calf.id),
      updatedAt: now,
    }, context.cloudEnabled);

    const database = await openFarmProDatabase();
    assertAnimalSyncContext(context);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['calves', 'calvings'], 'readwrite');
      const calfStore = transaction.objectStore('calves');
      const calvingStore = transaction.objectStore('calvings');
      const currentCalf = calfStore.get(calf.id);
      const currentCalving = calvingStore.get(id);
      let remaining = 2;
      let failure: unknown;
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => { failure ??= transaction.error; };
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('子牛台帳への登録を中止しました。'));
      const commit = () => {
        if (--remaining !== 0) return;
        try {
          assertAnimalSyncContext(context);
          if (currentCalf.result !== undefined || !sameAnimalSyncRecord(currentCalving.result, record)) {
            throw new Error('登録対象の記録が変更されました。子牛台帳と分娩記録を確認してください。');
          }
          calfStore.put(calf);
          calvingStore.put(updatedCalving);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      currentCalf.onsuccess = commit;
      currentCalving.onsuccess = commit;
    });
    assertAnimalSyncContext(context);
    await syncSavedCalfIfEnabled(calf, context);
    const savedCalf = await getRecordById<StoredCalfRecord>('calves', calf.id);
    assertAnimalSyncContext(context);
    return { ok: true, calf: savedCalf ?? calf, calving: withComputedFields(updatedCalving) };
  });
}
