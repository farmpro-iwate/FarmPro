import {
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { Vaccine, VaccineInput } from '../types/vaccine';
import { deleteExpense, getExpensesList, type ExpenseRecord } from './expensesApi';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { openFarmProDatabase } from '../storage/db';
import { areSyncRecordsEquivalent } from './deviceSync';

const STORE_NAME = 'vaccines' as const;

type SyncedVaccine = Vaccine & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
};

type CloudVaccineRecord = Omit<Partial<SyncedVaccine>, 'id'> & {
  id: string;
  cloudUpdatedAt?: string;
};

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

type VaccineSyncContext = {
  farmId: string | null;
  userId: string | null;
  token: string | null;
  cloudEnabled: boolean;
};
const pendingVaccineSync = new Map<string, Promise<void>>();

function vaccineSyncContext(): VaccineSyncContext {
  const user = getStoredAuthUser();
  return {
    farmId: user?.farmId ?? null, userId: user?.id ?? null,
    token: getAuthToken(), cloudEnabled: shouldUseCloudSync(),
  };
}

function assertVaccineSyncContext(expected: VaccineSyncContext): void {
  const current = vaccineSyncContext();
  if (current.farmId !== expected.farmId || current.userId !== expected.userId ||
      current.token !== expected.token || current.cloudEnabled !== expected.cloudEnabled) {
    throw new Error('ログインまたは農場の情報が変わったため、ワクチン記録の処理を中止しました。');
  }
}

// Serialize the complete local save, request and acknowledgement, including deletes.
async function withVaccineSync<T>(action: (context: VaccineSyncContext) => Promise<T>): Promise<T> {
  const context = vaccineSyncContext();
  const key = `farmpro:vaccine-record-sync:${encodeURIComponent(context.farmId || 'anonymous')}`;
  const run = () => { assertVaccineSyncContext(context); return action(context); };
  if (navigator.locks?.request) return navigator.locks.request(key, run);
  const previous = pendingVaccineSync.get(key) ?? Promise.resolve();
  const work = previous.then(run);
  const settled = work.then(() => undefined, () => undefined);
  pendingVaccineSync.set(key, settled);
  try { return await work; }
  finally { if (pendingVaccineSync.get(key) === settled) pendingVaccineSync.delete(key); }
}

// A backup import or another local writer may bypass the operation lock. Check
// the original and apply the response within the same IndexedDB transaction.
async function changeMatchingVaccine(
  context: VaccineSyncContext,
  id: number,
  expected: SyncedVaccine | undefined,
  next: SyncedVaccine | undefined,
): Promise<boolean> {
  const database = await openFarmProDatabase();
  assertVaccineSyncContext(context);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    let changed = false;
    let failure: unknown;
    transaction.oncomplete = () => resolve(changed);
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('ワクチン記録の保存を中止しました。'));
    transaction.onerror = () => { failure ??= transaction.error; };
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        assertVaccineSyncContext(context);
        const current = request.result as SyncedVaccine | undefined;
        if (expected ? !current || !areSyncRecordsEquivalent(current, expected) : current !== undefined) return;
        if (next) store.put(next);
        else store.delete(id);
        changed = true;
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
  });
}

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function cloudRecordIsNewer(
  cloud: CloudVaccineRecord,
  local: SyncedVaccine,
) {
  const cloudTime = parseTimestamp(cloud.cloudUpdatedAt);
  const localCloudTime = parseTimestamp(local.cloudUpdatedAt);
  if (Number.isNaN(cloudTime)) return false;
  if (Number.isNaN(localCloudTime)) return true;
  return cloudTime > localCloudTime;
}

async function readSyncError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `ワクチン記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `ワクチン記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function requestVaccineSync<T>(url: string, init: RequestInit, read: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(await readSyncError(response));
    return await read(response);
  } finally { clearTimeout(timeout); }
}

async function syncVaccineRecordToCloud(
  record: SyncedVaccine,
  context: VaccineSyncContext,
): Promise<CloudVaccineRecord | null> {
  if (!context.cloudEnabled || !context.token) return null;
  assertVaccineSyncContext(context);

  const syncRecordId = record.syncRecordId || `vaccine:${record.id}`;
  return requestVaccineSync(`/api/vaccines/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${context.token}`,
    },
    body: JSON.stringify({ ...record, id: syncRecordId, syncRecordId }),
  }, response => response.json() as Promise<CloudVaccineRecord>);
}

async function syncVaccineDeletionToCloud(syncRecordId: string, context: VaccineSyncContext) {
  if (!context.cloudEnabled) return;
  if (!context.token) throw new Error('ワクチン記録の削除を確認するため、ログインして通信できる状態で削除してください。');
  assertVaccineSyncContext(context);

  await requestVaccineSync(`/api/vaccines/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${context.token}` },
  }, async () => undefined);
  assertVaccineSyncContext(context);
}

export class VaccineSyncConflictError extends Error {
  constructor(message = 'ワクチン記録が変更されたため、保存結果を反映していません。最新の記録を確認してください。') {
    super(message);
    this.name = 'VaccineSyncConflictError';
  }
}

async function syncVaccineAfterLocalSave(record: SyncedVaccine, context: VaccineSyncContext) {
  try {
    const current = await getRecordById<SyncedVaccine>(STORE_NAME, record.id);
    assertVaccineSyncContext(context);
    if (!current || !areSyncRecordsEquivalent(current, record)) throw new VaccineSyncConflictError();
    const synced = await syncVaccineRecordToCloud(record, context);
    assertVaccineSyncContext(context);
    if (synced?.deletedAt) {
      throw new VaccineSyncConflictError('このワクチン記録はクラウドで削除済みのため、保存を完了できませんでした。最新の記録を確認してください。');
    }
    if (!synced?.cloudUpdatedAt) return;

    const applied = await changeMatchingVaccine(context, record.id, record, {
      ...record,
      syncRecordId: synced.id || record.syncRecordId || `vaccine:${record.id}`,
      cloudUpdatedAt: synced.cloudUpdatedAt,
      cloudSyncPending: false,
    });
    if (!applied) throw new VaccineSyncConflictError();
  } catch (error) {
    if (error instanceof VaccineSyncConflictError) throw error;
    console.warn('ワクチン記録は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

function localIdFromSyncId(syncId: string) {
  const rawId = syncId.startsWith('vaccine:')
    ? syncId.slice('vaccine:'.length)
    : syncId;
  const parsed = Number(rawId);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCloudVaccine(
  record: CloudVaccineRecord,
  localId: number,
): SyncedVaccine {
  return {
    id: localId,
    targetType: String(record.targetType || '成牛'),
    targetNumber: String(record.targetNumber || ''),
    targetName: String(record.targetName || ''),
    vaccineName: String(record.vaccineName || ''),
    vaccineCost: String(record.vaccineCost || ''),
    vaccinationDate: String(record.vaccinationDate || ''),
    nextDueDate: String(record.nextDueDate || ''),
    status: String(record.status || '未接種'),
    note: String(record.note || ''),
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || ''),
    syncRecordId: String(record.id),
    cloudUpdatedAt: record.cloudUpdatedAt,
    cloudSyncPending: false,
  };
}

async function pullVaccineChangesFromCloud(context: VaccineSyncContext) {
  if (!context.cloudEnabled || !context.token) return 0;
  assertVaccineSyncContext(context);

  const cloudRecords = await requestVaccineSync('/api/vaccines/record-sync', {
    headers: { Authorization: `Bearer ${context.token}` },
    cache: 'no-store',
  }, response => response.json() as Promise<CloudVaccineRecord[]>);
  assertVaccineSyncContext(context);
  if (!Array.isArray(cloudRecords)) throw new Error('ワクチン記録の確認結果が不正です。');
  const localRecords = await getAllRecords<SyncedVaccine>(STORE_NAME);
  assertVaccineSyncContext(context);
  const localBySyncId = new Map<string, SyncedVaccine>();

  for (const item of localRecords) {
    localBySyncId.set(item.syncRecordId || `vaccine:${item.id}`, item);
  }

  let applied = 0;

  for (const cloud of cloudRecords) {
    const syncId = String(cloud.id || '').trim();
    if (!syncId) continue;

    const local = localBySyncId.get(syncId);

    if (cloud.deletedAt) {
      if (!local) continue;
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      if (!await changeMatchingVaccine(context, Number(local.id), local, undefined)) continue;
      localBySyncId.delete(syncId);
      applied += 1;
      continue;
    }

    if (local) {
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      const saved = normalizeCloudVaccine(cloud, Number(local.id));
      if (!await changeMatchingVaccine(context, Number(local.id), local, saved)) continue;
      localBySyncId.set(syncId, saved);
      applied += 1;
      continue;
    }

    const localId = localIdFromSyncId(syncId);
    if (localId === null) continue;

    const saved = normalizeCloudVaccine(cloud, localId);
    if (!await changeMatchingVaccine(context, localId, undefined, saved)) continue;
    localBySyncId.set(syncId, saved);
    applied += 1;
  }

  return applied;
}

export async function getVaccineList(): Promise<Vaccine[]> {
  return withVaccineSync(async (context) => {
    try {
      await pullVaccineChangesFromCloud(context);
    } catch (error) {
      console.warn('ワクチン記録のクラウド取り込みをスキップしました。', error);
    }

    assertVaccineSyncContext(context);
    const records = await getAllRecords<Vaccine>(STORE_NAME);
    assertVaccineSyncContext(context);
    return records.sort((a, b) => b.vaccinationDate.localeCompare(a.vaccinationDate));
  });
}

export async function getVaccine(id: string | number): Promise<Vaccine> {
  const context = vaccineSyncContext();
  const record = await getRecordById<Vaccine>(STORE_NAME, Number(id));
  assertVaccineSyncContext(context);

  if (!record) {
    throw new Error('指定されたワクチン記録が見つかりません。');
  }

  return record;
}

export async function createVaccine(input: VaccineInput): Promise<Vaccine> {
  return withVaccineSync(async (context) => {
    const now = new Date().toISOString();
    const id = Date.now();
    const saved = await saveRecord<SyncedVaccine>(STORE_NAME, {
      ...input, id, syncRecordId: `vaccine:${id}`,
      cloudSyncPending: context.cloudEnabled, createdAt: now, updatedAt: now,
    });

    await syncVaccineAfterLocalSave(saved, context);
    assertVaccineSyncContext(context);
    return saved;
  });
}

export async function updateVaccine(
  id: string | number,
  input: VaccineInput,
): Promise<Vaccine> {
  return withVaccineSync(async (context) => {
    const current = await getRecordById<SyncedVaccine>(STORE_NAME, Number(id));
    assertVaccineSyncContext(context);
    if (!current) throw new Error('指定されたワクチン記録が見つかりません。');

    const saved: SyncedVaccine = {
      ...current, ...input, id: Number(id),
      syncRecordId: current.syncRecordId || `vaccine:${Number(id)}`,
      cloudSyncPending: context.cloudEnabled,
      updatedAt: new Date().toISOString(),
    };
    if (!await changeMatchingVaccine(context, Number(id), current, saved)) {
      throw new Error('ワクチン記録が変更されたため、更新を中止しました。最新の記録を確認してください。');
    }
    await syncVaccineAfterLocalSave(saved, context);
    assertVaccineSyncContext(context);
    return saved;
  });
}

function isRelatedExpense(record: ExpenseRecord, sourceId: string): boolean {
  return record.sourceType === 'vaccine' && String(record.sourceId || '') === sourceId &&
    record.category === '医薬品費' && !(record.sourceDetail?.trim() || '');
}

async function checkRelatedExpenses(sourceId: string, context: VaccineSyncContext): Promise<void> {
  const local = await getAllRecords<ExpenseRecord>('expenses');
  assertVaccineSyncContext(context);
  const rejectSettled = (records: ExpenseRecord[]) => {
    if (records.some(record => isRelatedExpense(record, sourceId) && record.settlementSaleId)) {
      throw new Error('精算確定済みの関連経費があるため、ワクチン記録は削除できません。販売精算の内容を確認してください。');
    }
  };
  rejectSettled(local);
  if (!context.cloudEnabled) return;
  let cloud: ExpenseRecord[];
  try {
    cloud = await getExpensesList({ requireCloudSync: true });
    if (!Array.isArray(cloud) || cloud.some(record => !record || typeof record !== 'object')) throw new Error();
  } catch {
    assertVaccineSyncContext(context);
    throw new Error('関連経費の精算状況を確認できませんでした。ワクチン記録は削除していません。通信状態を確認してください。');
  }
  assertVaccineSyncContext(context);
  rejectSettled(cloud);
}

export class VaccineExpenseCleanupError extends Error {
  constructor() {
    super('ワクチン記録の削除は完了しましたが、関連経費の削除を完了できませんでした。経費管理で残った経費を確認してください。');
    this.name = 'VaccineExpenseCleanupError';
  }
}

export async function deleteVaccine(id: number): Promise<void> {
  return withVaccineSync(async (context) => {
    const current = await getRecordById<SyncedVaccine>(STORE_NAME, id);
    assertVaccineSyncContext(context);
    if (!current) return;
    if (context.cloudEnabled && !context.token) {
      throw new Error('ワクチン記録の削除を確認するため、ログインして通信できる状態で削除してください。');
    }
    await checkRelatedExpenses(String(id), context);
    const latest = await getRecordById<SyncedVaccine>(STORE_NAME, id);
    assertVaccineSyncContext(context);
    if (!latest || !areSyncRecordsEquivalent(latest, current)) {
      throw new Error('ワクチン記録が変更されたため、削除を中止しました。最新の記録を確認してください。');
    }
    await syncVaccineDeletionToCloud(current.syncRecordId || `vaccine:${id}`, context);
    if (!await changeMatchingVaccine(context, id, current, undefined)) {
      throw new Error('削除の処理中にワクチン記録が変更されたため、端末の記録を保持しました。最新の内容を確認してください。');
    }

    try {
      const expenses = await getAllRecords<ExpenseRecord>('expenses');
      assertVaccineSyncContext(context);
      for (const expense of expenses.filter(record => isRelatedExpense(record, String(id)))) {
        await deleteExpense(expense.id);
        assertVaccineSyncContext(context);
      }
    } catch { throw new VaccineExpenseCleanupError(); }
  });
}
