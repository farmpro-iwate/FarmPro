import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import { openFarmProDatabase } from '../storage/db';
import type { StoredRecord } from '../storage/types';

export type CalvingRecord = {
  id?: string;
  cowId?: string;
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
  recordKind?: 'standard';
  cowEarTag?: string;
  cowName?: string;
  pregnancyResult?: string;
  breedingStatus?: string;
  expectedCalvingDate?: string;
  note?: string;
  calvingId?: string;
  calvedAt?: string;
};

type StoredCalfRecord = {
  id: string;
  name?: string;
  earTag?: string;
  sex?: string;
  birthDate?: string;
  birthWeightKg?: number | string;
  motherCowId?: string;
  motherCowName?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type RegisterCalfResponse = {
  ok: boolean;
  calf: StoredCalfRecord;
  calving: CalvingRecord;
};

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
      ((Boolean(motherCowId) && String(calf.motherCowId || '').trim() === motherCowId) ||
       (Boolean(motherCowName) && String(calf.motherCowName || '').trim() === motherCowName));
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
  return records.map(withComputedFields);
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
    return withComputedFields(saved);
  }

  const database = await openFarmProDatabase();
  const transaction = database.transaction(['calvings', 'breedings'], 'readwrite');
  const calvingsStore = transaction.objectStore('calvings');
  const breedingsStore = transaction.objectStore('breedings');
  const breeding = await waitForRequest(
    breedingsStore.get(record.breedingId) as IDBRequest<StoredBreedingRecord | undefined>,
  );

  if (!breeding || breeding.recordKind === 'advanced') {
    transaction.abort();
    throw new Error('連携する繁殖記録が見つかりません。');
  }
  if (breeding.calvingId) {
    transaction.abort();
    throw new Error('この繁殖記録はすでに分娩記録へ連携済みです。');
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
    breedingStatus: '分娩済み',
    calvingId: linkedCalving.id,
    calvedAt: record.actualCalvingDate || now,
    updatedAt: now,
  };

  await Promise.all([
    waitForRequest(calvingsStore.put(linkedCalving)),
    waitForRequest(breedingsStore.put(updatedBreeding)),
  ]);
  await waitForTransaction(transaction);
  return withComputedFields(linkedCalving);
}

export async function updateCalving(id: string, record: CalvingRecord) {
  const existing = await getRecordById<StoredCalvingRecord>('calvings', id);
  if (!existing) throw new Error('分娩記録が見つかりません。');
  const saved = await saveRecord('calvings', normalizeRecord({ ...record, id }, existing));
  return withComputedFields(saved);
}

export async function deleteCalving(id: string) {
  const existing = await getRecordById<StoredCalvingRecord>('calvings', id);
  if (!existing) throw new Error('分娩記録が見つかりません。');
  await deleteRecord('calvings', id);
  return { ok: true };
}

export async function registerCalvingToCalfLedger(id: string): Promise<RegisterCalfResponse> {
  const record = await getRecordById<StoredCalvingRecord>('calvings', id);
  if (!record) throw new Error('分娩記録が見つかりません。');
  if (record.registeredToCalfLedger) throw new Error('この分娩記録はすでに子牛台帳へ登録済みです。');
  if (normalizeCalvingResult(record.calvingResult) === '死産') throw new Error('死産の記録は子牛台帳へ登録しません。');
  if (!record.calfName) throw new Error('子牛耳標番号がないため、子牛台帳へ登録できません。');
  if (!record.actualCalvingDate) throw new Error('実分娩日がないため、子牛台帳へ登録できません。');

  const calves = await getAllRecords<StoredCalfRecord>('calves');
  if (isDuplicateCalf(calves, record)) {
    throw new Error('同じ子牛耳標番号、または同じ母牛・生年月日の子牛がすでに子牛台帳にある可能性があります。重複を確認してください。');
  }

  const now = new Date().toISOString();
  const calfId = record.calfId || createId('calf');
  const memoLines = [
    record.memo || '',
    `分娩記録ID: ${record.id}`,
    record.breedingId ? `繁殖記録ID: ${record.breedingId}` : '',
    record.calvingResult ? `分娩結果: ${normalizeCalvingResult(record.calvingResult)}` : '',
    record.colostrumStatus ? `初乳確認: ${record.colostrumStatus}` : '',
  ].filter(Boolean);

  const calf: StoredCalfRecord = {
    id: calfId,
    name: record.calfName,
    earTag: record.calfName,
    sex: record.calfSex || '不明',
    birthDate: record.actualCalvingDate,
    birthWeightKg: record.birthWeightKg === undefined ? '' : record.birthWeightKg,
    motherCowId: record.cowId || '',
    motherCowName: record.cowName || '',
    memo: memoLines.join('\n'),
    createdAt: now,
    updatedAt: now,
  };

  const updatedCalving: StoredCalvingRecord = {
    ...record,
    registeredToCalfLedger: true,
    calfId: calf.id,
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
