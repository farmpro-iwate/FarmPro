import {
  getAllRecords,
  getRecordById,
  saveManyRecords,
  saveRecord,
} from '../storage/repository';
import { Calf } from '../types/calf';
import { Treatment, TreatmentInput } from '../types/treatment';
import { saveTreatmentWithMedicineSource, deleteTreatmentWithMedicineSource } from './treatmentInventoryLink';
import { markLocalChangePending } from './deviceSync';
import { formatTemporaryCalfNumber, isTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { hasPendingSupplyLinkedRecord } from './supplyInventoryLinkedSync';
import { openFarmProDatabase } from '../storage/db';

const STORE_NAME = 'treatments' as const;

type SyncedTreatment = Treatment & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
};

type CloudTreatment = Omit<Partial<SyncedTreatment>, 'id'> & {
  id: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

type TreatmentSyncContext = {
  farmId: string | null;
  userId: string | null;
  token: string | null;
  cloudEnabled: boolean;
  planId: string;
};
const pendingTreatmentSync = new Map<string, Promise<void>>();

function treatmentSyncContext(): TreatmentSyncContext {
  const user = getStoredAuthUser();
  const planId = getCurrentFarmProPlanId();
  return {
    farmId: user?.farmId ?? null, userId: user?.id ?? null,
    token: getAuthToken(), cloudEnabled: getFarmProPlan(planId).multiDeviceSync, planId,
  };
}

function assertTreatmentSyncContext(expected: TreatmentSyncContext): void {
  const current = treatmentSyncContext();
  if (current.farmId !== expected.farmId || current.userId !== expected.userId ||
      current.token !== expected.token || current.cloudEnabled !== expected.cloudEnabled ||
      current.planId !== expected.planId) {
    throw new Error('ログインまたは農場の情報が変わったため、治療記録の処理を中止しました。');
  }
}

export class TreatmentSyncConflictError extends Error {
  constructor(message = '治療記録が変更されたため、古い保存結果は反映していません。最新の内容を確認してください。') {
    super(message);
    this.name = 'TreatmentSyncConflictError';
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
}

// Pending metadata is part of the original: an old ACK must not clear a newer operation.
function sameTreatmentRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

async function changeMatchingTreatment(
  context: TreatmentSyncContext,
  id: number,
  expected: SyncedTreatment | undefined,
  next: SyncedTreatment | undefined,
  protectDeletionConflict = false,
): Promise<boolean> {
  assertTreatmentSyncContext(context);
  const database = await openFarmProDatabase();
  assertTreatmentSyncContext(context);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    let changed = false;
    let failure: unknown;
    transaction.oncomplete = () => {
      try { assertTreatmentSyncContext(context); resolve(changed); }
      catch (error) { reject(error); }
    };
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('治療記録の処理を中止しました。'));
    transaction.onerror = () => { failure ??= transaction.error; };
    const read = store.get(id);
    read.onsuccess = () => {
      try {
        assertTreatmentSyncContext(context);
        const current = read.result as SyncedTreatment | undefined;
        if (!sameTreatmentRecord(current, expected)) {
          // The cloud deletion has completed. Keep even a legacy writer's edit
          // protected from a later tombstone GET without changing its contents.
          if (protectDeletionConflict && current) store.put({ ...current, cloudSyncPending: true });
          return;
        }
        if (next) {
          if (next.id !== id) throw new Error('更新対象の治療記録が一致しません。');
          store.put(next);
        } else store.delete(id);
        changed = true;
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
  });
}

// Keep delayed GET/PUT responses from restoring a successfully deleted row.
async function withTreatmentSync<T>(action: (context: TreatmentSyncContext) => Promise<T>): Promise<T> {
  const context = treatmentSyncContext();
  const key = `farmpro:treatment-record-sync:${encodeURIComponent(context.farmId || 'anonymous')}`;
  const run = () => { assertTreatmentSyncContext(context); return action(context); };
  if (navigator.locks?.request) return navigator.locks.request(key, run);
  const previous = pendingTreatmentSync.get(key) ?? Promise.resolve();
  const work = previous.then(run);
  const settled = work.then(() => undefined, () => undefined);
  pendingTreatmentSync.set(key, settled);
  try { return await work; }
  finally { if (pendingTreatmentSync.get(key) === settled) pendingTreatmentSync.delete(key); }
}

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function cloudRecordIsNewer(cloud: CloudTreatment, local: SyncedTreatment) {
  const cloudTime = parseTimestamp(cloud.cloudUpdatedAt);
  const localCloudTime = parseTimestamp(local.cloudUpdatedAt);
  if (Number.isNaN(cloudTime)) return false;
  if (Number.isNaN(localCloudTime)) return true;
  return cloudTime > localCloudTime;
}

async function normalizeTemporaryTargetNumber(targetNumber: string) {
  const normalized = targetNumber.trim();
  if (!isTemporaryCalfNumber(normalized)) return normalized;

  const calves = await getAllRecords<Calf>('calves');
  const calf = calves.find((item) =>
    item.calfNumber === normalized || item.temporaryCalfNumber === normalized,
  );

  return formatTemporaryCalfNumber(normalized, calf?.birthday);
}

async function presentTreatment(record: Treatment): Promise<Treatment> {
  return {
    ...record,
    targetNumber: await normalizeTemporaryTargetNumber(record.targetNumber),
  };
}

async function normalizeTreatmentInput(input: TreatmentInput): Promise<TreatmentInput> {
  return {
    ...input,
    targetNumber: await normalizeTemporaryTargetNumber(input.targetNumber),
    nextScheduledDate: input.progress === '回復' ? '' : input.nextScheduledDate,
  };
}

async function readSyncError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `治療・投薬記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `治療・投薬記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function requestTreatmentSync<T>(
  url: string, init: RequestInit, context: TreatmentSyncContext, read: (response: Response) => Promise<T>,
): Promise<T> {
  assertTreatmentSyncContext(context);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('治療記録の通信が時間切れになりました。端末の記録は保持しています。'));
    }, 12000);
  });
  const work = async () => {
    const response = await fetch(url, { ...init, signal: controller.signal });
    assertTreatmentSyncContext(context);
    if (!response.ok) throw new Error(await readSyncError(response));
    const result = await read(response);
    assertTreatmentSyncContext(context);
    return result;
  };
  try { return await Promise.race([work(), timeout]); }
  finally { clearTimeout(timer!); }
}

async function syncTreatmentRecordToCloud(record: SyncedTreatment, context: TreatmentSyncContext): Promise<CloudTreatment | null> {
  if (!context.cloudEnabled || !context.token) return null;

  const syncRecordId = record.syncRecordId || `treatment:${record.id}`;
  return requestTreatmentSync(`/api/treatments/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${context.token}`,
    },
    body: JSON.stringify({ ...record, id: syncRecordId, syncRecordId }),
  }, context, response => response.json() as Promise<CloudTreatment>);
}

async function syncTreatmentAfterLocalSave(record: SyncedTreatment, context: TreatmentSyncContext) {
  try {
    await withTreatmentSync(async () => {
      assertTreatmentSyncContext(context);
      const current = await getRecordById<SyncedTreatment>(STORE_NAME, record.id);
      assertTreatmentSyncContext(context);
      if (!sameTreatmentRecord(current, record)) throw new TreatmentSyncConflictError();
      const synced = await syncTreatmentRecordToCloud(record, context);
      assertTreatmentSyncContext(context);
      if (synced?.deletedAt) {
        await changeMatchingTreatment(context, record.id, record, { ...record, cloudSyncPending: true }, true);
        throw new TreatmentSyncConflictError('この治療記録はクラウドで削除済みです。端末の編集内容を保持しています。記録と関連経費を確認してください。');
      }
      if (synced && synced.id !== (record.syncRecordId || `treatment:${record.id}`)) {
        throw new TreatmentSyncConflictError('クラウドの保存結果が対象の治療記録と一致しません。端末の編集内容を保持しています。');
      }
      if (!synced?.cloudUpdatedAt) return;

      const applied = await changeMatchingTreatment(context, record.id, record, {
        ...record,
        syncRecordId: synced.id || record.syncRecordId || `treatment:${record.id}`,
        cloudUpdatedAt: synced.cloudUpdatedAt,
        cloudSyncPending: false,
      });
      if (!applied) throw new TreatmentSyncConflictError();
    });
  } catch (error) {
    assertTreatmentSyncContext(context);
    if (error instanceof TreatmentSyncConflictError) throw error;
    console.warn('治療・投薬記録は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

async function syncTreatmentDeletionToCloud(syncRecordId: string, context: TreatmentSyncContext) {
  if (!context.cloudEnabled) return;
  if (!context.token) throw new Error('治療記録の削除を確認するため、ログインして通信できる状態で削除してください。');
  assertTreatmentSyncContext(context);

  await requestTreatmentSync(`/api/treatments/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${context.token}` },
  }, context, async () => undefined);
}

function normalizeCloudTreatment(record: CloudTreatment, localId: number): SyncedTreatment {
  return {
    id: localId,
    recordType: String(record.recordType || '治療'),
    breedingTreatmentType: (record.breedingTreatmentType || '') as Treatment['breedingTreatmentType'],
    targetNumber: String(record.targetNumber || ''),
    targetName: String(record.targetName || ''),
    symptom: String(record.symptom || ''),
    diagnosis: String(record.diagnosis || ''),
    diseaseMasterId: record.diseaseMasterId,
    treatmentProcedure: String(record.treatmentProcedure || ''),
    treatmentProcedureMasterId: record.treatmentProcedureMasterId,
    hoofAbnormality: String(record.hoofAbnormality || ''),
    nextScheduledDate: String(record.nextScheduledDate || ''),
    treatmentCourseId: record.treatmentCourseId,
    treatmentDate: String(record.treatmentDate || ''),
    medicine: String(record.medicine || ''),
    dosage: String(record.dosage || ''),
    medicineSource: record.medicineSource,
    medicineInventoryMovementId: record.medicineInventoryMovementId,
    medicineInventoryBatchKey: record.medicineInventoryBatchKey,
    medicineInventoryQuantity: record.medicineInventoryQuantity,
    medicineCost: String(record.medicineCost || ''),
    medicalFee: String(record.medicalFee || ''),
    withdrawalEndDate: String(record.withdrawalEndDate || ''),
    veterinarian: String(record.veterinarian || ''),
    progress: String(record.progress || ''),
    note: String(record.note || ''),
    sourceScheduleId: record.sourceScheduleId,
    synchronizationProgramId: record.synchronizationProgramId,
    synchronizationProgramName: record.synchronizationProgramName,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    syncRecordId: String(record.id),
    cloudUpdatedAt: record.cloudUpdatedAt,
    cloudSyncPending: false,
    deletedAt: record.deletedAt,
  };
}

async function pullTreatmentChangesFromCloud(context: TreatmentSyncContext) {
  if (!context.cloudEnabled || !context.token) return 0;
  assertTreatmentSyncContext(context);

  const localRecords = await getAllRecords<SyncedTreatment>(STORE_NAME);
  assertTreatmentSyncContext(context);
  const cloudRecords = await requestTreatmentSync('/api/treatments/record-sync', {
    headers: { Authorization: `Bearer ${context.token}` },
    cache: 'no-store',
  }, context, response => response.json() as Promise<CloudTreatment[]>);
  assertTreatmentSyncContext(context);
  if (!Array.isArray(cloudRecords) || cloudRecords.some(record => !record || typeof record.id !== 'string')) {
    throw new Error('治療記録のクラウド確認結果が不正です。端末の記録は保持しています。');
  }
  const localBySyncId = new Map<string, SyncedTreatment>();
  for (const item of localRecords) {
    localBySyncId.set(item.syncRecordId || `treatment:${item.id}`, item);
  }

  let nextId = localRecords.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
  let applied = 0;

  for (const cloud of cloudRecords) {
    const syncId = String(cloud.id || '').trim();
    if (!syncId) continue;
    if (await hasPendingSupplyLinkedRecord('treatments', syncId)) continue;
    assertTreatmentSyncContext(context);

    const local = localBySyncId.get(syncId);

    if (cloud.deletedAt) {
      if (!local) continue;
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      if (!await changeMatchingTreatment(context, local.id, local, undefined)) continue;
      localBySyncId.delete(syncId);
      applied += 1;
      continue;
    }

    if (local) {
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      const saved = normalizeCloudTreatment(cloud, local.id);
      if (!await changeMatchingTreatment(context, local.id, local, saved)) continue;
      localBySyncId.set(syncId, saved);
      applied += 1;
      continue;
    }

    const saved = normalizeCloudTreatment(cloud, nextId++);
    if (!await changeMatchingTreatment(context, saved.id, undefined, saved)) continue;
    localBySyncId.set(syncId, saved);
    applied += 1;
  }

  return applied;
}

export async function getTreatmentList(): Promise<Treatment[]> {
  return withTreatmentSync(async (context) => {
    try {
      await pullTreatmentChangesFromCloud(context);
    } catch (error) {
      console.warn('治療・投薬記録のクラウド取り込みをスキップしました。', error);
    }

    assertTreatmentSyncContext(context);
    const records = await getAllRecords<Treatment>(STORE_NAME);
    assertTreatmentSyncContext(context);
    const presented = await Promise.all(records.map((record) => presentTreatment(record)));
    assertTreatmentSyncContext(context);
    return presented.sort((a, b) => b.treatmentDate.localeCompare(a.treatmentDate));
  });
}

export async function getTreatment(id: string | number): Promise<Treatment> {
  const record = await getRecordById<Treatment>(STORE_NAME, Number(id));

  if (!record) {
    throw new Error('指定された治療記録が見つかりません。');
  }

  return presentTreatment(record);
}

export async function createTreatment(
  input: TreatmentInput,
): Promise<Treatment> {
  const context = treatmentSyncContext();
  const normalizedInput = await normalizeTreatmentInput(input);
  assertTreatmentSyncContext(context);
  if (normalizedInput.medicineSource === 'farm_stock') {
    const saved = await saveTreatmentWithMedicineSource(normalizedInput, {
      source: 'farm_stock',
      batchKey: normalizedInput.medicineInventoryBatchKey || '',
      quantity: normalizedInput.medicineInventoryQuantity || 0,
    }, undefined, { cloudSyncPending: shouldUseCloudSync() });
    markLocalChangePending();
    return await getRecordById<Treatment>(STORE_NAME, saved.id) ?? saved;
  }
  const now = new Date().toISOString();
  const id = Date.now();
  const saved = await saveRecord<SyncedTreatment>(STORE_NAME, {
    ...normalizedInput,
    id,
    syncRecordId: `treatment:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    createdAt: now,
    updatedAt: now,
  });

  await syncTreatmentAfterLocalSave(saved, context);
  return saved;
}

export async function createManyTreatments(
  inputs: TreatmentInput[],
): Promise<Treatment[]> {
  const context = treatmentSyncContext();
  const normalizedInputs = await Promise.all(inputs.map((input) => normalizeTreatmentInput(input)));
  assertTreatmentSyncContext(context);
  const now = new Date().toISOString();
  const baseId = Date.now();
  const records: SyncedTreatment[] = normalizedInputs.map((input, index) => {
    const id = baseId + index;
    return {
      ...input,
      id,
      syncRecordId: `treatment:${id}`,
      cloudSyncPending: shouldUseCloudSync(),
      createdAt: now,
      updatedAt: now,
    };
  });

  const saved = await saveManyRecords<SyncedTreatment>(STORE_NAME, records);
  await Promise.all(saved.map((record) => syncTreatmentAfterLocalSave(record, context)));
  return saved;
}

export async function updateTreatment(
  id: string | number,
  input: TreatmentInput,
): Promise<Treatment> {
  const context = treatmentSyncContext();
  const current = await getRecordById<SyncedTreatment>(STORE_NAME, Number(id));
  assertTreatmentSyncContext(context);
  if (!current) {
    throw new Error('指定された治療記録が見つかりません。');
  }

  const normalizedInput = await normalizeTreatmentInput(input);
  assertTreatmentSyncContext(context);
  if (normalizedInput.medicineSource === 'farm_stock' || current.medicineInventoryMovementId ||
      await hasPendingSupplyLinkedRecord('treatments', current.syncRecordId || `treatment:${current.id}`)) {
    const saved = await saveTreatmentWithMedicineSource(normalizedInput, {
      source: normalizedInput.medicineSource || '',
      batchKey: normalizedInput.medicineInventoryBatchKey || '',
      quantity: normalizedInput.medicineInventoryQuantity || 0,
    }, Number(id), { cloudSyncPending: shouldUseCloudSync() });
    markLocalChangePending();
    return await getRecordById<Treatment>(STORE_NAME, saved.id) ?? saved;
  }
  const saved = await saveRecord<SyncedTreatment>(STORE_NAME, {
    ...current,
    ...normalizedInput,
    id: Number(id),
    syncRecordId: current.syncRecordId || `treatment:${current.id}`,
    cloudSyncPending: shouldUseCloudSync(),
    updatedAt: new Date().toISOString(),
  });

  await syncTreatmentAfterLocalSave(saved, context);
  return saved;
}

export async function deleteTreatment(id: number): Promise<void> {
  return withTreatmentSync(async (context) => {
    const existing = await getRecordById<SyncedTreatment>(STORE_NAME, id);
    assertTreatmentSyncContext(context);
    if (!existing) return;
    const syncRecordId = existing.syncRecordId || `treatment:${id}`;

    const inventoryLinked = existing.medicineInventoryMovementId ||
      await hasPendingSupplyLinkedRecord('treatments', syncRecordId);
    assertTreatmentSyncContext(context);
    if (inventoryLinked) {
      await deleteTreatmentWithMedicineSource(id, (current) => {
        assertTreatmentSyncContext(context);
        if (!sameTreatmentRecord(current, existing)) {
          throw new TreatmentSyncConflictError('削除の処理中に治療記録が変更されたため、治療・在庫・関連経費を保持しました。最新の内容を確認してください。');
        }
      });
      assertTreatmentSyncContext(context);
      markLocalChangePending();
      return;
    }

    // Recheck after the outbox lookup, then guard the final deletion in one
    // transaction. A legacy tab can save outside this operation's Web Lock.
    if (!await changeMatchingTreatment(context, id, existing, existing, true)) {
      throw new TreatmentSyncConflictError('削除の処理中に治療記録が変更されたため、端末の新しい内容を保持しました。記録と関連経費を確認してください。');
    }
    try {
      await syncTreatmentDeletionToCloud(syncRecordId, context);
    } catch (error) {
      assertTreatmentSyncContext(context);
      // The server may have deleted it before its response was lost. Keep the
      // row until a repeated deletion can also finish the linked expense flow.
      await changeMatchingTreatment(context, id, existing, { ...existing, cloudSyncPending: true }, true);
      throw error;
    }
    assertTreatmentSyncContext(context);
    if (!await changeMatchingTreatment(context, id, existing, undefined, true)) {
      throw new TreatmentSyncConflictError('削除の処理中に治療記録が変更されたため、端末の新しい内容を保持しました。記録と関連経費を確認してください。');
    }
  });
}
