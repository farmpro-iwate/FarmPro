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
  breedingId?: string;
  breedingLinked?: boolean;
  breedingLinkedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  daysFromExpected?: number | null;
};

type StoredCalvingRecord = CalvingRecord & { id: string };

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

type StoredCalfRecord = {
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
};

export type RegisterCalfResponse = {
  ok: boolean;
  calf: StoredCalfRecord;
  calving: CalvingRecord;
};

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

async function syncCalvingRecordToCloud(record: StoredCalvingRecord) {
  const token = getAuthToken();
  if (!token) throw new Error('ログイン情報がないため分娩記録を同期できません。');

  const response = await fetch(`/api/calvings/record-sync/${encodeURIComponent(record.id)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(record),
  });

  if (!response.ok) {
    throw new Error(await readSyncApiError(response));
  }
}

async function syncSavedCalvingIfEnabled(record: StoredCalvingRecord) {
  if (!shouldUseCloudSync()) return;
  try {
    await syncCalvingRecordToCloud(record);
  } catch (error) {
    console.warn('分娩記録は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
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

export async function fetchCalvings() {
  const records = await getAllRecords<StoredCalvingRecord>('calvings');
  const calves = await getAllRecords<StoredCalfRecord>('calves');
  let changed = false;

  for (const record of records) {
    const linkedCalfExists = calves.some((calf) => String(calf.calvingId || '') === record.id);
    const canCreateCalf = Boolean(
      record.id &&
      normalizeCalvingResult(record.calvingResult) !== '死産' &&
      record.actualCalvingDate
    );
    const shouldAutoCreateCalf = canCreateCalf && !record.registeredToCalfLedger;
    const shouldRepairMissingCalf = canCreateCalf && Boolean(record.registeredToCalfLedger) && !linkedCalfExists;

    if (!shouldAutoCreateCalf && !shouldRepairMissingCalf) continue;

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

  return latestRecords.map(withComputedFields);
}

export async function fetchCalving(id: string) {
  const record = await getRecordById<StoredCalvingRecord>('calvings', id);
  if (!record) throw new Error('分娩記録が見つかりません。');
  return withComputedFields(record);
}

export async function createCalving(record: CalvingRecord) {
  const normalized = normalizeRecord(record);
  if (!record.breedingId) {
    const saved = await saveRecord('calvings', normalized);
    await syncSavedCalvingIfEnabled(saved);
    return withComputedFields(saved);
  }

  const database = await openFarmProDatabase();
  const transaction = database.transaction(['calvings', 'breedings'], 'readwrite');
  const calvingsStore = transaction.objectStore('calvings');
  const breedingsStore = transaction.objectStore('breedings');
  const breeding = await waitForRequest(
    breedingsStore.get(record.breedingId) as IDBRequest<StoredBreedingRecord | undefined>,
  );

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
  await syncSavedCalvingIfEnabled(linkedCalving);
  return withComputedFields(linkedCalving);
}

export async function updateCalving(id: string, record: CalvingRecord) {
  const existing = await getRecordById<StoredCalvingRecord>('calvings', id);
  if (!existing) throw new Error('分娩記録が見つかりません。');
  const saved = await saveRecord('calvings', normalizeRecord({ ...record, id }, existing));
  await syncSavedCalvingIfEnabled(saved);
  return withComputedFields(saved);
}

export async function deleteCalving(id: string) {
  const existing = await getRecordById<StoredCalvingRecord>('calvings', id);
  if (!existing) throw new Error('分娩記録が見つかりません。');

  if (existing.breedingId) {
    const breeding = await getRecordById<StoredBreedingRecord>(
      'breedings',
      existing.breedingId,
    );

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
    }
  }

  await deleteRecord('calvings', id);
  return { ok: true };
}

export async function registerCalvingToCalfLedger(id: string): Promise<RegisterCalfResponse> {
  const record = await getRecordById<StoredCalvingRecord>('calvings', id);
  if (!record) throw new Error('分娩記録が見つかりません。');
  if (normalizeCalvingResult(record.calvingResult) === '死産') throw new Error('死産の記録は子牛台帳へ登録しません。');
  if (!record.actualCalvingDate) throw new Error('実分娩日がないため、子牛台帳へ登録できません。');

  const calves = await getAllRecords<StoredCalfRecord>('calves');
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
  const calfDisplayName = calfEarTag || '耳標未装着';
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

  const calf: StoredCalfRecord = {
    id: calfId,
    name: calfDisplayName,
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
  };

  const updatedCalving: StoredCalvingRecord = {
    ...record,
    registeredToCalfLedger: true,
    calfId: String(calf.id),
    updatedAt: now,
  };

  const database = await openFarmProDatabase();
  const transaction = database.transaction(['calves', 'calvings'], 'readwrite');
  await Promise.all([
    waitForRequest(transaction.objectStore('calves').put(calf)),
    waitForRequest(transaction.objectStore('calvings').put(updatedCalving)),
  ]);
  await waitForTransaction(transaction);
  return { ok: true, calf, calving: withComputedFields(updatedCalving) };
}