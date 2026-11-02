import { getAllRecords } from '../storage/repository';
import { openFarmProDatabase } from '../storage/db';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { sameAnimalSyncRecord } from './animalRecordSyncSafety';
import type { CalvingRecord } from './calvingsApi';

type StoredCalvingRecord = Omit<CalvingRecord, 'id'> & { id: string | number; deletedAt?: string };

export function calvingSyncContext() {
  const user = getStoredAuthUser();
  return {
    farmId: user?.farmId ?? null,
    userId: user?.id ?? null,
    token: getAuthToken(),
    plan: getCurrentFarmProPlanId(),
  };
}

export type CalvingSyncContext = ReturnType<typeof calvingSyncContext>;

export function assertCalvingSyncContext(expected: CalvingSyncContext): void {
  const current = calvingSyncContext();
  if (current.farmId !== expected.farmId || current.userId !== expected.userId ||
      current.token !== expected.token || current.plan !== expected.plan) {
    throw new Error('ログインまたは農場の情報が変わったため、分娩記録の処理を中止しました。');
  }
}

const pendingCalvingSync = new Map<string, Promise<void>>();

export async function withCalvingSync<T>(action: (context: CalvingSyncContext) => Promise<T>): Promise<T> {
  const context = calvingSyncContext();
  const key = `farmpro:calving-record-sync:${encodeURIComponent(context.farmId || 'anonymous')}`;
  const run = () => { assertCalvingSyncContext(context); return action(context); };
  if (navigator.locks?.request) return navigator.locks.request(key, run);
  const previous = pendingCalvingSync.get(key) ?? Promise.resolve();
  const work = previous.then(run);
  const settled = work.then(() => undefined, () => undefined);
  pendingCalvingSync.set(key, settled);
  try { return await work; }
  finally { if (pendingCalvingSync.get(key) === settled) pendingCalvingSync.delete(key); }
}

export async function withCalvingSyncRequest<T>(read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try { return await read(controller.signal); }
  catch (error) {
    if (controller.signal.aborted) throw new Error('分娩記録のクラウド通信が時間切れになりました。再接続してからお試しください。');
    throw error;
  } finally { clearTimeout(timeout); }
}

function isCloudRecordNewer(cloud: StoredCalvingRecord, local?: StoredCalvingRecord) {
  if (!local) return true;

  const cloudUpdatedAt = typeof cloud.updatedAt === 'string'
    ? Date.parse(cloud.updatedAt)
    : Number.NaN;
  const localUpdatedAt = typeof local.updatedAt === 'string'
    ? Date.parse(local.updatedAt)
    : Number.NaN;

  if (Number.isNaN(cloudUpdatedAt)) return false;
  if (Number.isNaN(localUpdatedAt)) return true;
  return cloudUpdatedAt > localUpdatedAt;
}

function isSameDeletion(cloud: StoredCalvingRecord, local: StoredCalvingRecord) {
  if (!cloud.deletedAt || !local.deletedAt) return false;
  const deletedAt = Date.parse(cloud.deletedAt);
  const updatedAt = Date.parse(cloud.updatedAt || '');
  return Number.isFinite(deletedAt) && Number.isFinite(updatedAt) &&
    deletedAt === Date.parse(local.deletedAt) && updatedAt === Date.parse(local.updatedAt || '');
}

async function applyCloudDeletion(
  cloud: StoredCalvingRecord,
  localId: string | number,
  context: CalvingSyncContext,
): Promise<boolean> {
  assertCalvingSyncContext(context);
  const database = await openFarmProDatabase();
  assertCalvingSyncContext(context);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('calvings', 'readwrite');
    const store = transaction.objectStore('calvings');
    const request = store.get(localId) as IDBRequest<StoredCalvingRecord | undefined>;
    let deleted = false;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        assertCalvingSyncContext(context);
        const current = request.result;
        if (!current || current.calvingSyncFreeEditPending ||
            (!isCloudRecordNewer(cloud, current) && !isSameDeletion(cloud, current))) return;
        // Read and delete in one transaction: a newer local save must survive.
        // Keep the actual local key type; legacy records can use numeric IDs.
        store.delete(localId);
        deleted = true;
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    transaction.onabort = transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('分娩記録の削除反映に失敗しました。'));
    transaction.oncomplete = () => {
      try { assertCalvingSyncContext(context); resolve(deleted); }
      catch (error) { reject(error); }
    };
  });
}

async function applyCloudRecord(
  cloud: StoredCalvingRecord,
  original: StoredCalvingRecord | undefined,
  context: CalvingSyncContext,
): Promise<boolean> {
  assertCalvingSyncContext(context);
  const database = await openFarmProDatabase();
  assertCalvingSyncContext(context);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('calvings', 'readwrite');
    const store = transaction.objectStore('calvings');
    // New cloud IDs must also remain absent under a legacy numeric key.
    const request = original ? store.get(original.id) : store.getAll();
    let applied = false;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        assertCalvingSyncContext(context);
        if (original) {
          if ((request.result as StoredCalvingRecord | undefined)?.calvingSyncFreeEditPending) return;
          if (!sameAnimalSyncRecord(request.result, original)) return;
          if (cloud.id !== original.id) throw new Error('受信した分娩記録の対象が一致しません。');
        } else if ((request.result as StoredCalvingRecord[]).some(record => String(record.id) === String(cloud.id))) {
          return;
        }
        // Registration holds the calf lock, and a restore can bypass both
        // service locks. Compare the full original and put in this same tx.
        store.put(cloud);
        applied = true;
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    transaction.onabort = transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('分娩記録の受信反映に失敗しました。'));
    transaction.oncomplete = () => {
      try { assertCalvingSyncContext(context); resolve(applied); }
      catch (error) { reject(error); }
    };
  });
}

async function readApiError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `分娩記録の取得に失敗しました（${response.status}）`;
  } catch {
    return `分娩記録の取得に失敗しました（${response.status}）`;
  }
}

async function receiveCalvingRecords(context: CalvingSyncContext) {
  if (!getFarmProPlan(context.plan).multiDeviceSync) return { applied: 0 };

  const token = context.token;
  if (!token) return { applied: 0 };

  const cloudRecords = await withCalvingSyncRequest(async (signal) => {
    const response = await fetch('/api/calvings/record-sync', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal,
    });
    assertCalvingSyncContext(context);
    if (!response.ok) throw new Error(await readApiError(response));
    const records = await response.json() as StoredCalvingRecord[];
    assertCalvingSyncContext(context);
    return records;
  });
  if (!Array.isArray(cloudRecords)) return { applied: 0 };

  const localRecords = await getAllRecords<StoredCalvingRecord>('calvings');
  assertCalvingSyncContext(context);
  const localById = new Map(localRecords.map((record) => [String(record.id), record]));
  let applied = 0;

  for (const cloudRecord of cloudRecords) {
    if (!cloudRecord || !cloudRecord.id) continue;

    const id = String(cloudRecord.id);
    const localRecord = localById.get(id);
    // A Free edit is awaiting an explicit paid save, regardless of business
    // timestamps. Neither a newer live row nor a tombstone can acknowledge it.
    if (localRecord?.calvingSyncFreeEditPending) continue;
    const { calvingSyncFreeEditPending: _remotePending, ...cloudBusiness } = cloudRecord;
    const normalizedCloudRecord: StoredCalvingRecord = {
      ...cloudBusiness,
      id: localRecord?.id ?? id,
    };

    if (normalizedCloudRecord.deletedAt) {
      if (!localRecord) continue;
      if (!await applyCloudDeletion(normalizedCloudRecord, localRecord.id, context)) continue;
      localById.delete(id);
      applied += 1;
      continue;
    }

    if (!isCloudRecordNewer(normalizedCloudRecord, localRecord)) continue;

    const now = new Date().toISOString();
    const saved: StoredCalvingRecord = {
      ...normalizedCloudRecord,
      createdAt: normalizedCloudRecord.createdAt ?? now,
      updatedAt: normalizedCloudRecord.updatedAt ?? now,
    };
    if (!await applyCloudRecord(saved, localRecord, context)) continue;
    localById.set(id, saved);
    applied += 1;
  }

  assertCalvingSyncContext(context);
  return { applied };
}

export function pullNewerCalvingRecordsFromCloud() {
  // Hold the same lock as deleteCalving through HTTP and local application.
  return withCalvingSync(receiveCalvingRecords);
}
