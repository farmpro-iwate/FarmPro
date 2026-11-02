import {
  getAllRecords,
  getRecordById,
} from '../storage/repository';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { Vaccine, VaccineInput } from '../types/vaccine';
import { deleteExpense, getExpensesList, type ExpenseRecord } from './expensesApi';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { openFarmProDatabase } from '../storage/db';

const STORE_NAME = 'vaccines' as const;

type SyncedVaccine = Vaccine & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
  vaccineSyncOrigin?: { version: 1; farmId: string; userId: string; ownerId: string };
  vaccineSyncBase?: { version: 1; record: CloudVaccineRecord | null; cloudUpdatedAt?: string };
  vaccineSyncAttempt?: { version: 1; record: CloudVaccineRecord };
  vaccineSyncAcknowledged?: { version: 1; record: CloudVaccineRecord };
  vaccineSyncBlocked?: boolean;
  vaccineSyncDeletePending?: boolean;
  vaccineSyncLocalOnly?: boolean;
  syncWarning?: string;
};

type CloudVaccineRecord = Omit<Partial<Vaccine>, 'id'> & {
  id: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

export type VaccineSyncContext = {
  farmId: string | null;
  userId: string | null;
  token: string | null;
  cloudEnabled: boolean;
  planId: string;
};
const pendingVaccineSync = new Map<string, Promise<void>>();
export const VACCINE_SYNC_STATUS_EVENT = 'farmpro:vaccine-sync-status';

export function getVaccineSyncContext(): VaccineSyncContext {
  const user = getStoredAuthUser();
  const planId = getCurrentFarmProPlanId();
  return {
    farmId: user?.farmId ?? null, userId: user?.id ?? null,
    token: getAuthToken(), cloudEnabled: getFarmProPlan(planId).multiDeviceSync, planId,
  };
}

export function assertVaccineSyncContext(expected: VaccineSyncContext): void {
  const current = getVaccineSyncContext();
  if (current.farmId !== expected.farmId || current.userId !== expected.userId ||
      current.token !== expected.token || current.cloudEnabled !== expected.cloudEnabled ||
      current.planId !== expected.planId) {
    throw new Error('ログインまたは農場の情報が変わったため、ワクチン記録の処理を中止しました。');
  }
}

export function canRetryVaccineSyncOnPage(pathname: string): boolean {
  return pathname === '/' || /^\/vaccines(?:\/|$)/.test(pathname);
}

export function getVaccineSyncStatus(record: Vaccine): { pending: boolean; warning?: string } {
  const saved = record as SyncedVaccine;
  if (!getVaccineSyncContext().cloudEnabled) return { pending: false };
  if (saved.vaccineSyncDeletePending) return {
    pending: false, warning: '削除の完了を確認できていません。通信状態を確認し、もう一度削除してください。',
  };
  if (!saved.cloudSyncPending) return { pending: false };
  return { pending: true, ...(saved.syncWarning ? { warning: saved.syncWarning } : {}) };
}

function vaccineSyncOwner(farmId: string, create = false): string | null {
  try {
    const key = `farmpro.vaccineSyncOwner.${encodeURIComponent(farmId)}`;
    let owner = window.localStorage.getItem(key);
    if (!owner && create) {
      owner = crypto.randomUUID();
      window.localStorage.setItem(key, owner);
    }
    return owner || null;
  } catch { return null; }
}

function newVaccineSyncOrigin(context: VaccineSyncContext): SyncedVaccine['vaccineSyncOrigin'] {
  assertVaccineSyncContext(context);
  if (!context.cloudEnabled || !context.token || !context.farmId || !context.userId) return;
  const ownerId = vaccineSyncOwner(context.farmId, true);
  return ownerId ? { version: 1, farmId: context.farmId, userId: context.userId, ownerId } : undefined;
}

function isOwnedVaccineSyncPending(record: SyncedVaccine, context: VaccineSyncContext): boolean {
  const origin = record.vaccineSyncOrigin;
  return record.cloudSyncPending === true && !record.deletedAt && !record.vaccineSyncLocalOnly &&
    context.cloudEnabled && !!context.token && !!context.farmId && !!context.userId &&
    origin?.version === 1 && origin.farmId === context.farmId && origin.userId === context.userId &&
    origin.ownerId === vaccineSyncOwner(context.farmId);
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
}

// Include pending/base/attempt metadata so a late response cannot acknowledge a newer save.
function sameVaccineRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function withoutLocalSyncState(record: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) =>
    key !== 'syncRecordId' && key !== 'syncWarning' && key !== 'cloudUpdatedAt' &&
    !key.startsWith('cloudSync') && !key.startsWith('vaccineSync')));
}

function toCloudVaccine(record: SyncedVaccine): CloudVaccineRecord {
  return { ...withoutLocalSyncState(record), id: record.syncRecordId || `vaccine:${record.id}` };
}

// Normalize only documented defaults. Keep costs, timestamps and unknown business fields.
function sameVaccineContent(left: CloudVaccineRecord, right: CloudVaccineRecord): boolean {
  const comparable = (record: CloudVaccineRecord) => {
    const { deletedAt: _deleted, ...content } = withoutLocalSyncState(record);
    return {
      ...content, targetType: record.targetType ?? '成牛', targetNumber: record.targetNumber ?? '',
      targetName: record.targetName ?? '', vaccineName: record.vaccineName ?? '',
      vaccineCost: record.vaccineCost ?? '', vaccinationDate: record.vaccinationDate ?? '',
      nextDueDate: record.nextDueDate ?? '', status: record.status ?? '未接種', note: record.note ?? '',
    };
  };
  return sameVaccineRecord(comparable(left), comparable(right));
}

// Serialize the complete local save, request and acknowledgement, including deletes.
async function withVaccineSync<T>(action: (context: VaccineSyncContext) => Promise<T>): Promise<T> {
  const context = getVaccineSyncContext();
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
    transaction.oncomplete = () => {
      try { assertVaccineSyncContext(context); resolve(changed); }
      catch (error) { reject(error); }
    };
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('ワクチン記録の保存を中止しました。'));
    transaction.onerror = () => { failure ??= transaction.error; };
    const request = store.get(id);
    request.onsuccess = () => {
      try {
        assertVaccineSyncContext(context);
        const current = request.result as SyncedVaccine | undefined;
        if (!sameVaccineRecord(current, expected)) return;
        if (next) {
          if (next.id !== id) throw new Error('更新対象のワクチン記録が一致しません。');
          store.put(next);
        }
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

function validCloudRevision(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function hasUnconfirmedVaccineChanges(record: SyncedVaccine): boolean {
  if (record.cloudSyncPending || record.vaccineSyncLocalOnly || record.vaccineSyncDeletePending) return true;
  // A confirmed payload remains confirmed even when the device clock is ahead.
  // Comparing the payload also detects legacy writers that retained this marker.
  if (record.vaccineSyncAcknowledged?.version === 1) {
    return !sameVaccineContent(toCloudVaccine(record), record.vaccineSyncAcknowledged.record);
  }
  // Older Free clients did not leave pending metadata. Keep their local edits.
  const receipt = parseTimestamp(record.cloudUpdatedAt);
  if (!Number.isFinite(receipt)) return true;
  return [record.updatedAt, record.createdAt].some(value => parseTimestamp(value) > receipt);
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

async function requestVaccineSync<T>(
  url: string,
  init: RequestInit,
  context: VaccineSyncContext,
  read: (response: Response) => Promise<T>,
  allowNotFound = false,
): Promise<T> {
  assertVaccineSyncContext(context);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('ワクチン記録の通信が時間切れになりました。端末の記録は保持しています。'));
    }, 12000);
  });
  const request = async () => {
    const response = await fetch(url, { ...init, signal: controller.signal });
    assertVaccineSyncContext(context);
    if (!response.ok && !(allowNotFound && response.status === 404)) {
      const message = await readSyncError(response);
      if (response.status === 409 || response.status === 412) throw new VaccineSyncConflictError(message);
      throw new Error(message);
    }
    const result = await read(response);
    assertVaccineSyncContext(context);
    return result;
  };
  try {
    // Bound body parsing too; abort alone does not release a stalled JSON reader.
    return await Promise.race([request(), timeout]);
  } finally { clearTimeout(timer!); }
}

async function fetchCloudVaccine(syncId: string, context: VaccineSyncContext): Promise<CloudVaccineRecord | null> {
  const record = await requestVaccineSync(`/api/vaccines/record-sync/${encodeURIComponent(syncId)}`, {
    headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store',
  }, context, response => response.status === 404 ? Promise.resolve(null) : response.json() as Promise<CloudVaccineRecord>, true);
  if (record !== null && (!record || record.id !== syncId)) throw new VaccineSyncConflictError('クラウドの確認結果が対象のワクチン記録と一致しません。端末の記録は保持しています。');
  return record;
}

async function pushCloudVaccine(
  record: CloudVaccineRecord, context: VaccineSyncContext, revision?: string,
): Promise<CloudVaccineRecord> {
  return requestVaccineSync(`/api/vaccines/record-sync/${encodeURIComponent(record.id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`,
      ...(revision ? { 'If-Match': JSON.stringify(revision) } : { 'If-None-Match': '*' }),
    },
    body: JSON.stringify(record),
  }, context, response => response.json() as Promise<CloudVaccineRecord>);
}

export class VaccineSyncConflictError extends Error {
  constructor(message = 'ワクチン記録が変更されたため、保存結果を反映していません。最新の記録を確認してください。') {
    super(message);
    this.name = 'VaccineSyncConflictError';
  }
}

class VaccineSyncDeferredError extends Error {}

async function assertCurrentVaccine(record: SyncedVaccine, context: VaccineSyncContext, automatic: boolean) {
  const assertCanSend = () => {
    assertVaccineSyncContext(context);
    if (!isOwnedVaccineSyncPending(record, context) ||
        (automatic && (record.vaccineSyncBlocked || record.vaccineSyncDeletePending || !canRetryVaccineSyncOnPage(window.location.pathname) || navigator.onLine === false || document.visibilityState === 'hidden'))) {
      throw new VaccineSyncDeferredError();
    }
  };
  assertCanSend();
  const current = await getRecordById<SyncedVaccine>(STORE_NAME, record.id);
  assertCanSend();
  if (!sameVaccineRecord(current, record)) throw new VaccineSyncConflictError();
}

async function syncVaccineAfterLocalSave(
  initial: SyncedVaccine, context: VaccineSyncContext, automatic = false,
): Promise<SyncedVaccine> {
  if (!context.cloudEnabled) return initial;
  let record = initial;
  const hold = async (message?: string, blocked = false): Promise<SyncedVaccine> => {
    const { syncWarning: _warning, ...content } = record;
    const pending = { ...content, ...(message ? { syncWarning: message } : {}), ...(blocked ? { vaccineSyncBlocked: true } : {}) };
    if (!await changeMatchingVaccine(context, record.id, record, pending)) {
      throw new VaccineSyncConflictError();
    }
    assertVaccineSyncContext(context);
    return pending;
  };
  if (!isOwnedVaccineSyncPending(record, context)) {
    return automatic ? record : hold('この端末には保存しました。ログイン・同期元の情報を確認できないため、クラウド同期を保留しています。');
  }
  try {
    await assertCurrentVaccine(record, context, automatic);
    const wire = toCloudVaccine(record);
    const remote = await fetchCloudVaccine(wire.id, context);
    await assertCurrentVaccine(record, context, automatic);
    const base = record.vaccineSyncBase;
    const attempt = record.vaccineSyncAttempt;
    if (!base || base.version !== 1) throw new VaccineSyncConflictError('変更前のワクチン記録を確認できないため、端末の変更を保持して同期を保留しました。');
    if (remote?.deletedAt) throw new VaccineSyncConflictError('このワクチン記録はクラウドで削除済みです。端末の変更を保持して同期を保留しました。');

    let synced = remote;
    if (!remote || !sameVaccineContent(wire, remote)) {
      let revision: string | undefined;
      if (remote) {
        const reachedAttempt = attempt?.version === 1 && sameVaccineContent(attempt.record, remote);
        const knownBase = validCloudRevision(base.cloudUpdatedAt) && base.cloudUpdatedAt === remote.cloudUpdatedAt;
        // Old releases reported read-time revisions. Exact base content can still establish a safe CAS.
        const sameBase = base.record && sameVaccineContent(base.record, remote);
        if ((!reachedAttempt && !knownBase && !sameBase) || !validCloudRevision(remote.cloudUpdatedAt)) {
          throw new VaccineSyncConflictError('別の端末でワクチン記録が変更されています。この端末の変更を保持して同期を保留しました。最新の内容を確認してください。');
        }
        revision = remote.cloudUpdatedAt;
      } else if (base.record !== null || base.cloudUpdatedAt) {
        throw new VaccineSyncConflictError('変更前のワクチン記録をクラウドで確認できないため、端末の変更を保持して同期を保留しました。');
      }
      await assertCurrentVaccine(record, context, automatic);
      const staged: SyncedVaccine = {
        ...record,
        // A previous attempt may already be committed. Keep that confirmed base
        // before replacing the attempt, so a later network failure can be retried.
        vaccineSyncBase: {
          version: 1, record: remote,
          ...(revision ? { cloudUpdatedAt: revision } : {}),
        },
        vaccineSyncAttempt: { version: 1, record: wire },
      };
      if (!await changeMatchingVaccine(context, record.id, record, staged)) throw new VaccineSyncConflictError();
      record = staged;
      await assertCurrentVaccine(record, context, automatic);
      synced = await pushCloudVaccine(wire, context, revision);
    }
    await assertCurrentVaccine(record, context, automatic);
    if (!synced || synced.id !== wire.id || synced.deletedAt || !validCloudRevision(synced.cloudUpdatedAt) || !sameVaccineContent(wire, synced)) {
      throw new VaccineSyncConflictError('クラウドの保存結果がワクチン記録の内容と一致しないため、端末の変更を保持して同期を保留しました。');
    }
    const { vaccineSyncOrigin: _origin, vaccineSyncBase: _base, vaccineSyncAttempt: _attempt,
      vaccineSyncLocalOnly: _local, vaccineSyncBlocked: _blocked, syncWarning: _warning, ...content } = record;
    const acknowledged = {
      ...content, syncRecordId: synced.id, cloudUpdatedAt: synced.cloudUpdatedAt, cloudSyncPending: false,
      vaccineSyncAcknowledged: { version: 1 as const, record: wire },
    };
    if (!await changeMatchingVaccine(context, record.id, record, acknowledged)) throw new VaccineSyncConflictError();
    return acknowledged;
  } catch (error) {
    assertVaccineSyncContext(context);
    if (error instanceof VaccineSyncDeferredError) return record;
    const manualConflict = !automatic && error instanceof VaccineSyncConflictError;
    // A rejected formal save stopped before linked expenses. Do not later mark
    // it complete in the background; another formal save must finish that flow.
    const pending = await hold(error instanceof VaccineSyncConflictError ? error.message : undefined, manualConflict);
    // Formal save conflicts must stop the form before it changes linked expenses.
    if (!automatic && error instanceof VaccineSyncConflictError) throw error;
    return pending;
  }
}

function localIdFromSyncId(syncId: string) {
  const rawId = syncId.startsWith('vaccine:')
    ? syncId.slice('vaccine:'.length)
    : syncId;
  const parsed = Number(rawId);
  return rawId.trim() && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeCloudVaccine(
  record: CloudVaccineRecord,
  localId: number,
): SyncedVaccine {
  const { deletedAt: _deleted, ...content } = withoutLocalSyncState(record);
  const saved: SyncedVaccine = {
    ...content,
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
  saved.vaccineSyncAcknowledged = { version: 1, record: toCloudVaccine(saved) };
  return saved;
}

async function pullVaccineChangesFromCloud(context: VaccineSyncContext) {
  if (!context.cloudEnabled || !context.token) return 0;
  assertVaccineSyncContext(context);

  // Snapshot before the request; another writer may edit/delete while GET is pending.
  const localRecords = await getAllRecords<SyncedVaccine>(STORE_NAME);
  assertVaccineSyncContext(context);
  const cloudRecords = await requestVaccineSync('/api/vaccines/record-sync', {
    headers: { Authorization: `Bearer ${context.token}` },
    cache: 'no-store',
  }, context, response => response.json() as Promise<CloudVaccineRecord[]>);
  assertVaccineSyncContext(context);
  if (!Array.isArray(cloudRecords) || cloudRecords.some(record => !record || typeof record.id !== 'string')) {
    throw new Error('ワクチン記録の確認結果が不正です。');
  }
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
      if (hasUnconfirmedVaccineChanges(local)) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      if (!await changeMatchingVaccine(context, Number(local.id), local, undefined)) continue;
      localBySyncId.delete(syncId);
      applied += 1;
      continue;
    }

    if (local) {
      if (hasUnconfirmedVaccineChanges(local)) continue;
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
  const context = getVaccineSyncContext();
  const record = await getRecordById<Vaccine>(STORE_NAME, Number(id));
  assertVaccineSyncContext(context);

  if (!record) {
    throw new Error('指定されたワクチン記録が見つかりません。');
  }

  return record;
}

function prepareVaccineSave(
  input: VaccineInput, id: number, existing: SyncedVaccine | undefined, context: VaccineSyncContext,
): SyncedVaccine {
  const now = new Date().toISOString();
  const { vaccineSyncOrigin: _origin, vaccineSyncBase: _base, vaccineSyncAttempt: _attempt,
    vaccineSyncLocalOnly: _local, vaccineSyncBlocked: _blocked, vaccineSyncDeletePending: _deleting,
    syncWarning: _warning, ...before } = existing ?? {};
  const saved: SyncedVaccine = {
    ...before, ...input, id, syncRecordId: existing?.syncRecordId || `vaccine:${id}`,
    createdAt: existing?.createdAt ?? now, updatedAt: now,
    cloudSyncPending: context.cloudEnabled,
    ...(!context.cloudEnabled ? { vaccineSyncLocalOnly: true } : {}),
  };
  if (context.cloudEnabled) {
    const owned = existing && isOwnedVaccineSyncPending(existing, context);
    saved.vaccineSyncOrigin = newVaccineSyncOrigin(context);
    saved.vaccineSyncBase = owned && existing.vaccineSyncBase ? existing.vaccineSyncBase : {
      version: 1, record: existing ? toCloudVaccine(existing) : null,
      ...(existing && !hasUnconfirmedVaccineChanges(existing) && validCloudRevision(existing.cloudUpdatedAt)
        ? { cloudUpdatedAt: existing.cloudUpdatedAt } : {}),
    };
    if (owned && existing.vaccineSyncAttempt) saved.vaccineSyncAttempt = existing.vaccineSyncAttempt;
  }
  return saved;
}

export async function createVaccine(input: VaccineInput): Promise<Vaccine> {
  return withVaccineSync(async (context) => {
    let id = Date.now();
    while (await getRecordById<SyncedVaccine>(STORE_NAME, id)) {
      assertVaccineSyncContext(context);
      id += 1;
    }
    const saved = prepareVaccineSave(input, id, undefined, context);
    if (!await changeMatchingVaccine(context, id, undefined, saved)) throw new VaccineSyncConflictError();
    const result = await syncVaccineAfterLocalSave(saved, context);
    assertVaccineSyncContext(context);
    return result;
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

    const saved = prepareVaccineSave(input, Number(id), current, context);
    if (!await changeMatchingVaccine(context, Number(id), current, saved)) {
      throw new Error('ワクチン記録が変更されたため、更新を中止しました。最新の記録を確認してください。');
    }
    const result = await syncVaccineAfterLocalSave(saved, context);
    assertVaccineSyncContext(context);
    return result;
  });
}

/** Only formal saves owned by this browser, farm and user may be retried automatically. */
export async function retryPendingVaccineSync(): Promise<number> {
  if (!canRetryVaccineSyncOnPage(window.location.pathname)) return 0;
  return withVaccineSync(async context => {
    if (!context.cloudEnabled || !context.token || !canRetryVaccineSyncOnPage(window.location.pathname)) return 0;
    const records = await getAllRecords<SyncedVaccine>(STORE_NAME);
    assertVaccineSyncContext(context);
    let changed = 0;
    for (const record of records) {
      if (!canRetryVaccineSyncOnPage(window.location.pathname) || navigator.onLine === false || document.visibilityState === 'hidden') break;
      if (!isOwnedVaccineSyncPending(record, context) || record.vaccineSyncBlocked || record.vaccineSyncDeletePending) continue;
      try {
        const result = await syncVaccineAfterLocalSave(record, context, true);
        if (!sameVaccineRecord(result, record)) changed += 1;
      } catch (error) {
        assertVaccineSyncContext(context);
        console.warn('ワクチン記録の未送信の変更を保持し、再送を保留しました。', error);
      }
    }
    return changed;
  });
}

function isRelatedExpense(record: ExpenseRecord, sourceId: string): boolean {
  return record.sourceType === 'vaccine' && String(record.sourceId || '') === sourceId &&
    record.category === '医薬品費' && !(record.sourceDetail?.trim() || '');
}

async function deleteCloudVaccine(record: SyncedVaccine, context: VaccineSyncContext): Promise<SyncedVaccine> {
  const syncId = record.syncRecordId || `vaccine:${record.id}`;
  const remote = await fetchCloudVaccine(syncId, context);
  if (remote && !remote.deletedAt) {
    const owned = isOwnedVaccineSyncPending(record, context);
    const base = record.vaccineSyncBase;
    const ownAttempt = owned && record.vaccineSyncAttempt?.version === 1 &&
      sameVaccineContent(record.vaccineSyncAttempt.record, remote);
    const sameBase = owned && base?.version === 1 && base.record && sameVaccineContent(base.record, remote);
    const knownRevision = validCloudRevision(record.cloudUpdatedAt) && record.cloudUpdatedAt === remote.cloudUpdatedAt;
    if ((!knownRevision && !ownAttempt && !sameBase && !sameVaccineContent(toCloudVaccine(record), remote)) ||
        !validCloudRevision(remote.cloudUpdatedAt)) {
      throw new VaccineSyncConflictError('クラウドのワクチン記録に変更があります。記録と関連経費を保持して削除を中止しました。最新の内容を確認してください。');
    }
  }
  const latest = await getRecordById<SyncedVaccine>(STORE_NAME, record.id);
  assertVaccineSyncContext(context);
  if (!sameVaccineRecord(latest, record)) throw new VaccineSyncConflictError();
  // Keep the locally requested deletion visible until its outcome is confirmed.
  // Otherwise a later tombstone GET could hide the row before linked expenses
  // have been cleaned up after a lost DELETE acknowledgement.
  const deleting = { ...record, vaccineSyncDeletePending: true };
  if (!await changeMatchingVaccine(context, record.id, record, deleting)) throw new VaccineSyncConflictError();
  const revision = remote?.cloudUpdatedAt;
  const deleted = await requestVaccineSync(`/api/vaccines/record-sync/${encodeURIComponent(syncId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${context.token}`,
      ...(validCloudRevision(revision) ? { 'If-Match': JSON.stringify(revision) } : { 'If-None-Match': '*' }),
    },
  }, context, response => response.json() as Promise<CloudVaccineRecord>);
  if (!deleted || deleted.id !== syncId || !deleted.deletedAt) {
    throw new Error('クラウドでワクチン記録の削除を確認できませんでした。端末の記録と関連経費は保持しています。');
  }
  return deleting;
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
    if (!sameVaccineRecord(latest, current)) {
      throw new Error('ワクチン記録が変更されたため、削除を中止しました。最新の記録を確認してください。');
    }
    let confirmed = current;
    if (context.cloudEnabled) {
      const origin = current.vaccineSyncOrigin;
      if (origin && (origin.farmId !== context.farmId || origin.userId !== context.userId)) {
        throw new VaccineSyncConflictError('このワクチン記録の同期元が現在の農場・利用者と一致しないため、削除を中止しました。');
      }
      confirmed = await deleteCloudVaccine(current, context);
    }
    if (!await changeMatchingVaccine(context, id, confirmed, undefined)) {
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
