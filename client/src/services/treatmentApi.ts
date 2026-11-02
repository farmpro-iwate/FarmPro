import {
  getAllRecords,
  getRecordById,
} from '../storage/repository';
import { Calf } from '../types/calf';
import { Treatment, TreatmentInput } from '../types/treatment';
import { saveTreatmentWithMedicineSource, deleteTreatmentWithMedicineSource } from './treatmentInventoryLink';
import { markLocalChangePending } from './deviceSync';
import { formatTemporaryCalfNumber, isTemporaryCalfNumber } from '../utils/temporaryCalfNumber';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { getPendingTreatmentDeleteState, hasPendingSupplyLinkedRecord } from './supplyInventoryLinkedSync';
import { openFarmProDatabase } from '../storage/db';
import type { StoredRecord } from '../storage/types';
import {
  sameTreatmentContent, toCloudTreatment, treatmentConditionHeaders, validTreatmentRevision,
  type CloudTreatmentRecord, type TreatmentSyncAttempt, type TreatmentSyncBase,
} from './treatmentSyncProtocol';
import {
  assertRecordSyncRetryPage, canRetryRecordSyncOnPage, createRecordSyncRetryOrigin,
  getRecordSyncRetryOrigin, isOwnedRecordSyncRetryOrigin, RecordSyncRetryPausedError,
  type RecordSyncRetryOrigin,
} from './recordSyncRetry';

const STORE_NAME = 'treatments' as const;

type SyncedTreatment = Treatment & StoredRecord & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
  treatmentSyncDeletePending?: boolean;
  treatmentSyncBase?: TreatmentSyncBase;
  treatmentSyncAttempt?: TreatmentSyncAttempt;
  treatmentSyncOrigin?: RecordSyncRetryOrigin;
  treatmentSyncWarning?: string;
  treatmentSyncBlocked?: boolean;
};

type CloudTreatment = CloudTreatmentRecord & Omit<Partial<SyncedTreatment>, 'id'>;

type TreatmentSyncContext = {
  farmId: string | null;
  userId: string | null;
  token: string | null;
  cloudEnabled: boolean;
  planId: string;
  retryGuard?: () => void;
  retryChanged?: () => void;
};
const pendingTreatmentSync = new Map<string, Promise<void>>();
export const TREATMENT_SYNC_STATUS_EVENT = 'farmpro:treatment-sync-status';

export function getTreatmentSyncContext(): TreatmentSyncContext {
  const user = getStoredAuthUser();
  const planId = getCurrentFarmProPlanId();
  return {
    farmId: user?.farmId ?? null, userId: user?.id ?? null,
    token: getAuthToken(), cloudEnabled: getFarmProPlan(planId).multiDeviceSync, planId,
  };
}

export function assertTreatmentSyncContext(expected: TreatmentSyncContext): void {
  const current = getTreatmentSyncContext();
  if (current.farmId !== expected.farmId || current.userId !== expected.userId ||
      current.token !== expected.token || current.cloudEnabled !== expected.cloudEnabled ||
      current.planId !== expected.planId) {
    throw new Error('ログインまたは農場の情報が変わったため、治療記録の処理を中止しました。');
  }
  expected.retryGuard?.();
}

export function getTreatmentSyncStatus(record: Treatment): { pending: boolean; warning?: string } {
  const context = getTreatmentSyncContext();
  const saved = record as SyncedTreatment;
  if (!context.cloudEnabled) return { pending: false };
  if (saved.treatmentSyncDeletePending || saved.deletedAt) return {
    pending: false, warning: '削除の完了を確認できていません。内容を確認し、もう一度削除してください。',
  };
  if (!saved.cloudSyncPending) return { pending: false };
  if (saved.medicineSource === 'farm_stock' || saved.medicineInventoryMovementId) return {
    pending: true, warning: '在庫に関連する記録の同期が完了していません。在庫と記録の内容を確認してください。',
  };
  if (!isOwnedRecordSyncRetryOrigin('treatments', saved.treatmentSyncOrigin, context)) return {
    pending: true, warning: 'この記録の送信元を確認できません。内容を開いて確認し、保存してください。',
  };
  if (saved.treatmentSyncWarning) return { pending: true, warning: saved.treatmentSyncWarning };
  if (saved.treatmentSyncBlocked) return { pending: true, warning: '別の変更と競合しています。内容を確認して保存してください。' };
  return { pending: true };
}

function treatmentSyncChanged(context: TreatmentSyncContext): void {
  assertTreatmentSyncContext(context);
  if (context.retryChanged) context.retryChanged();
  else window.dispatchEvent(new Event(TREATMENT_SYNC_STATUS_EVENT));
}

function treatmentQueueKey(record: SyncedTreatment): string {
  return `supply-linked-sync:treatments:${encodeURIComponent(record.syncRecordId || `treatment:${record.id}`)}`;
}

function isRetryableTreatment(record: SyncedTreatment, context: TreatmentSyncContext): boolean {
  return record.cloudSyncPending === true && !record.treatmentSyncBlocked && !record.treatmentSyncDeletePending &&
    !record.deletedAt && record.medicineSource !== 'farm_stock' && !record.medicineInventoryMovementId &&
    isOwnedRecordSyncRetryOrigin('treatments', record.treatmentSyncOrigin, context);
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

function sameLinkedTreatmentContent(left: SyncedTreatment, right: SyncedTreatment): boolean {
  const business = (record: SyncedTreatment) => {
    const { cloudSyncPending: _pending, cloudUpdatedAt: _revision,
      treatmentSyncBase: _base, treatmentSyncAttempt: _attempt, ...content } = record;
    return content;
  };
  return sameTreatmentRecord(business(left), business(right));
}

async function assertCurrentTreatment(context: TreatmentSyncContext, expected: SyncedTreatment): Promise<void> {
  assertTreatmentSyncContext(context);
  if (context.retryGuard) {
    const database = await openFarmProDatabase();
    assertTreatmentSyncContext(context);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([STORE_NAME, 'metadata'], 'readonly');
      const source = transaction.objectStore(STORE_NAME).get(expected.id);
      const queue = transaction.objectStore('metadata').get(treatmentQueueKey(expected));
      transaction.oncomplete = () => {
        try {
          assertTreatmentSyncContext(context);
          if (queue.result !== undefined) throw new RecordSyncRetryPausedError();
          if (!sameTreatmentRecord(source.result, expected)) throw new TreatmentSyncConflictError();
          if (!isRetryableTreatment(source.result, context)) throw new RecordSyncRetryPausedError();
          resolve();
        } catch (error) { reject(error); }
      };
      transaction.onabort = () => reject(transaction.error ?? new RecordSyncRetryPausedError());
      transaction.onerror = () => reject(transaction.error ?? new RecordSyncRetryPausedError());
    });
    return;
  }
  const current = await getRecordById<SyncedTreatment>(STORE_NAME, expected.id);
  assertTreatmentSyncContext(context);
  if (!sameTreatmentRecord(current, expected)) throw new TreatmentSyncConflictError();
}

function validateTreatmentOriginal(context: TreatmentSyncContext, expected?: SyncedTreatment) {
  return (current: Treatment | undefined) => {
    assertTreatmentSyncContext(context);
    if (!sameTreatmentRecord(current, expected)) throw new TreatmentSyncConflictError();
  };
}

async function changeMatchingTreatment(
  context: TreatmentSyncContext,
  id: number,
  expected: SyncedTreatment | undefined,
  next: SyncedTreatment | undefined,
  protectDeletionConflict = false,
  guardNewCloudIdentity = false,
): Promise<boolean> {
  assertTreatmentSyncContext(context);
  const database = await openFarmProDatabase();
  assertTreatmentSyncContext(context);
  return new Promise((resolve, reject) => {
    // A linked outbox may appear after the retry snapshot. Inspect its raw key
    // in the same transaction as every retry write, including the final ACK.
    const transaction = database.transaction(context.retryGuard ? [STORE_NAME, 'metadata'] : STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const queue = context.retryGuard && expected
      ? transaction.objectStore('metadata').get(treatmentQueueKey(expected)) : undefined;
    let changed = false;
    let failure: unknown;
    transaction.oncomplete = () => {
      try { assertTreatmentSyncContext(context); resolve(changed); }
      catch (error) { reject(error); }
    };
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('治療記録の処理を中止しました。'));
    transaction.onerror = () => { failure ??= transaction.error; };
    const read = guardNewCloudIdentity ? store.getAll() : store.get(id);
    read.onsuccess = () => {
      try {
        assertTreatmentSyncContext(context);
        const rows = guardNewCloudIdentity ? read.result as SyncedTreatment[] : [];
        const current = guardNewCloudIdentity ? rows.find(row => row.id === id) : read.result as SyncedTreatment | undefined;
        if (context.retryGuard && (queue?.result !== undefined || !current || !isRetryableTreatment(current, context))) {
          throw new RecordSyncRetryPausedError();
        }
        if (guardNewCloudIdentity && !expected && next && rows.some(row =>
          (row.syncRecordId || `treatment:${row.id}`) === next.syncRecordId)) return;
        if (!sameTreatmentRecord(current, expected)) {
          // The cloud deletion has completed. Keep even a legacy writer's edit
          // protected from a later tombstone GET without changing its contents.
          if (protectDeletionConflict && current) store.put({ ...current, cloudSyncPending: true, treatmentSyncDeletePending: true });
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
  const context = getTreatmentSyncContext();
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
  allowMissing = false,
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
    if (!response.ok && !(allowMissing && response.status === 404)) {
      const message = await readSyncError(response);
      if (response.status === 409 || response.status === 412) throw new TreatmentSyncConflictError(message);
      throw new Error(message);
    }
    const result = await read(response);
    assertTreatmentSyncContext(context);
    return result;
  };
  try { return await Promise.race([work(), timeout]); }
  finally { clearTimeout(timer!); }
}

async function fetchCloudTreatment(syncId: string, context: TreatmentSyncContext): Promise<CloudTreatment | null> {
  const result = await requestTreatmentSync(`/api/treatments/record-sync/${encodeURIComponent(syncId)}`, {
    headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store',
  }, context, response => response.status === 404 ? Promise.resolve(null) : response.json(), true);
  if (result !== null && (!result || typeof result !== 'object' || Array.isArray(result) || result.id !== syncId)) {
    throw new TreatmentSyncConflictError('治療記録の確認結果が対象の記録と一致しません。端末の記録と関連経費を保持しています。');
  }
  return result as CloudTreatment | null;
}

function hasTreatmentSyncHistory(record: SyncedTreatment | undefined): boolean {
  return Boolean(record && (validTreatmentRevision(record.cloudUpdatedAt) || record.cloudSyncPending ||
    record.treatmentSyncBase || record.treatmentSyncAttempt));
}

function prepareTreatmentSyncState(existing: SyncedTreatment | undefined, context: TreatmentSyncContext): {
  treatmentSyncBase?: TreatmentSyncBase; treatmentSyncAttempt?: TreatmentSyncAttempt;
} {
  if (!context.cloudEnabled && !hasTreatmentSyncHistory(existing)) return { treatmentSyncBase: undefined, treatmentSyncAttempt: undefined };
  if (existing?.treatmentSyncBase && (existing.cloudSyncPending || !context.cloudEnabled)) return {
    treatmentSyncBase: existing.treatmentSyncBase, treatmentSyncAttempt: existing.treatmentSyncAttempt,
  };
  return {
    treatmentSyncBase: { version: 1, record: existing ? toCloudTreatment(existing) : null,
      ...(validTreatmentRevision(existing?.cloudUpdatedAt) ? { cloudUpdatedAt: existing.cloudUpdatedAt } : {}) },
    treatmentSyncAttempt: !context.cloudEnabled ? existing?.treatmentSyncAttempt : undefined,
  };
}

function formalTreatmentRetryState(context: TreatmentSyncContext, ordinary = true) {
  return {
    treatmentSyncOrigin: ordinary ? createRecordSyncRetryOrigin('treatments', context) : undefined,
    treatmentSyncWarning: undefined,
    treatmentSyncBlocked: undefined,
  };
}

async function rememberTreatmentSyncFailure(
  record: SyncedTreatment, context: TreatmentSyncContext, error: unknown,
): Promise<void> {
  if (!context.cloudEnabled || !record.cloudSyncPending || error instanceof RecordSyncRetryPausedError) return;
  try {
    assertTreatmentSyncContext(context);
    const failed: SyncedTreatment = {
      ...record,
      treatmentSyncWarning: error instanceof TreatmentSyncConflictError
        ? error.message : '通信を確認できません。記録はこの端末に保存されています。',
      treatmentSyncBlocked: error instanceof TreatmentSyncConflictError || undefined,
    };
    if (!sameTreatmentRecord(record, failed) && await changeMatchingTreatment(context, record.id, record, failed)) {
      treatmentSyncChanged(context);
    }
  } catch { /* A changed page, owner, original or queue must also prevent a status write. */ }
}

async function syncTreatmentAfterLocalSave(saved: SyncedTreatment, context: TreatmentSyncContext): Promise<SyncedTreatment> {
  let record = saved;
  try {
    await assertCurrentTreatment(context, record);
    if (!context.cloudEnabled) return record;
    if (!context.token) throw new Error('治療記録はこの端末に保存しています。クラウド同期にはログインが必要です。関連経費は更新していません。');
    if (record.treatmentSyncDeletePending) throw new TreatmentSyncConflictError('この治療記録は削除の確認待ちです。記録と関連経費を保持しています。');
    const wire = toCloudTreatment(record);
    let remote = await fetchCloudTreatment(wire.id, context);
    await assertCurrentTreatment(context, record);
    if (remote?.deletedAt) throw new TreatmentSyncConflictError('この治療記録はクラウドで削除済みです。端末の編集内容と関連経費を保持しています。');
    const base = record.treatmentSyncBase;
    if (!base || base.version !== 1 || (base.record !== null && String(base.record?.id) !== wire.id) ||
        (base.cloudUpdatedAt !== undefined && !validTreatmentRevision(base.cloudUpdatedAt))) {
      throw new TreatmentSyncConflictError('治療記録の送信条件を確認できません。端末の編集内容を保持しています。');
    }
    if (remote && !validTreatmentRevision(remote.cloudUpdatedAt)) throw new TreatmentSyncConflictError('治療記録の保存世代を確認できません。端末の編集内容を保持しています。');
    if (!remote || !sameTreatmentContent(record, remote)) {
      if (remote) {
        const knownRevision = base.cloudUpdatedAt !== undefined && base.cloudUpdatedAt === remote.cloudUpdatedAt;
        const sameBase = base.record !== null && sameTreatmentContent(base.record, remote);
        const ownAttempt = record.treatmentSyncAttempt?.version === 1 && sameTreatmentContent(record.treatmentSyncAttempt.record, remote);
        if (!knownRevision && !sameBase && !ownAttempt) throw new TreatmentSyncConflictError('クラウドの治療記録に変更があります。端末の入力と関連経費を保持しています。最新の内容を確認してください。');
      } else if (base.record !== null || base.cloudUpdatedAt !== undefined) {
        throw new TreatmentSyncConflictError('クラウドの元の治療記録を確認できません。端末の入力と関連経費を保持しています。');
      }
      // Readback may confirm B after its ACK was lost. Save that basis before
      // replacing the attempt with C, so a failed C cannot erase B's proof.
      const staged: SyncedTreatment = {
        ...record,
        treatmentSyncBase: { version: 1, record: remote,
          ...(remote ? { cloudUpdatedAt: remote.cloudUpdatedAt } : {}) },
        treatmentSyncAttempt: { version: 1, record: wire },
      };
      if (!await changeMatchingTreatment(context, record.id, record, staged)) throw new TreatmentSyncConflictError();
      record = staged;
      await assertCurrentTreatment(context, record);
      remote = await requestTreatmentSync(`/api/treatments/record-sync/${encodeURIComponent(wire.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`,
          ...treatmentConditionHeaders(remote?.cloudUpdatedAt) }, body: JSON.stringify(wire),
      }, context, response => response.json() as Promise<CloudTreatment>);
    }
    if (remote?.deletedAt) {
      await changeMatchingTreatment(context, record.id, record,
        { ...record, cloudSyncPending: true, treatmentSyncDeletePending: true }, true);
      throw new TreatmentSyncConflictError('この治療記録はクラウドで削除済みです。端末の編集内容と関連経費を保持しています。');
    }
    if (!remote || remote.id !== wire.id || !validTreatmentRevision(remote.cloudUpdatedAt) || !sameTreatmentContent(record, remote)) {
      throw new TreatmentSyncConflictError('治療記録の保存結果を確認できません。端末の入力と関連経費を保持しています。');
    }
    const { treatmentSyncBase: _base, treatmentSyncAttempt: _attempt,
      treatmentSyncOrigin: _origin, treatmentSyncWarning: _warning, treatmentSyncBlocked: _blocked, ...content } = record;
    const acknowledged: SyncedTreatment = { ...content, syncRecordId: wire.id,
      cloudUpdatedAt: remote.cloudUpdatedAt, cloudSyncPending: false };
    if (!await changeMatchingTreatment(context, record.id, record, acknowledged)) throw new TreatmentSyncConflictError();
    treatmentSyncChanged(context);
    return acknowledged;
  } catch (error) {
    await rememberTreatmentSyncFailure(record, context, error);
    throw error;
  }
}

/** Resume only this browser's formal, ordinary saves. Related expenses and
 * schedules belong to the foreground workflow and are never submitted here. */
export async function retryPendingTreatmentSync(): Promise<number> {
  const initial = getTreatmentSyncContext();
  const origin = getRecordSyncRetryOrigin('treatments', initial);
  const pathname = window.location.pathname;
  if (!origin || !canRetryRecordSyncOnPage('treatments', pathname)) return 0;
  const guard = () => {
    assertRecordSyncRetryPage('treatments');
    if (window.location.pathname !== pathname || !isOwnedRecordSyncRetryOrigin('treatments', origin, initial)) {
      throw new RecordSyncRetryPausedError();
    }
  };
  let changed = false;
  let completed = 0;
  const context: TreatmentSyncContext = { ...initial, retryGuard: guard, retryChanged: () => { changed = true; } };
  try {
    assertTreatmentSyncContext(context);
    await withTreatmentSync(async () => {
      assertTreatmentSyncContext(context);
      const records = await getAllRecords<SyncedTreatment>(STORE_NAME);
      assertTreatmentSyncContext(context);
      for (const record of records) {
        assertTreatmentSyncContext(context);
        if (!isRetryableTreatment(record, context)) continue;
        try {
          await syncTreatmentAfterLocalSave(record, context);
          completed += 1;
        } catch {
          // A row can remain pending, but a changed context must stop the batch.
          assertTreatmentSyncContext(context);
        }
      }
    });
  } catch { /* Network and lifecycle changes leave unacknowledged records pending. */ }
  finally {
    if (changed) {
      try { assertTreatmentSyncContext(context); window.dispatchEvent(new Event(TREATMENT_SYNC_STATUS_EVENT)); }
      catch { /* The previous page or owner must not refresh the new context. */ }
    }
  }
  return completed;
}

function normalizeCloudTreatment(record: CloudTreatment, localId: number, local?: SyncedTreatment): SyncedTreatment {
  const business = { ...(local ? toCloudTreatment(local) : {}), ...toCloudTreatment(record) };
  // Preserve every business field, including future fields, while mapping
  // nullable wire links back to the client's existing optional-field shape.
  for (const key of ['diseaseMasterId', 'treatmentProcedureMasterId', 'treatmentCourseId',
    'medicineInventoryMovementId', 'medicineInventoryBatchKey', 'medicineInventoryQuantity']) {
    if (business[key] === null) business[key] = undefined;
  }
  return { ...business, id: localId, syncRecordId: record.id,
    cloudUpdatedAt: record.cloudUpdatedAt, cloudSyncPending: false } as SyncedTreatment;
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
      if (local.cloudSyncPending || local.treatmentSyncDeletePending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      if (!await changeMatchingTreatment(context, local.id, local, undefined)) continue;
      localBySyncId.delete(syncId);
      applied += 1;
      continue;
    }

    if (local) {
      if (local.cloudSyncPending || local.treatmentSyncDeletePending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      const saved = normalizeCloudTreatment(cloud, local.id, local);
      if (!await changeMatchingTreatment(context, local.id, local, saved)) continue;
      localBySyncId.set(syncId, saved);
      applied += 1;
      continue;
    }

    const saved = normalizeCloudTreatment(cloud, nextId++);
    if (!await changeMatchingTreatment(context, saved.id, undefined, saved, false, true)) continue;
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

async function createLocalTreatments(
  inputs: TreatmentInput[], context: TreatmentSyncContext, onLocalSaved?: (ids: number[]) => void,
): Promise<SyncedTreatment[]> {
  const db = await openFarmProDatabase();
  assertTreatmentSyncContext(context);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const records: SyncedTreatment[] = [];
    let failure: unknown;
    tx.oncomplete = () => {
      // The commit already happened. Report its IDs even when the context
      // changed during commit, so returning to that attempt cannot create twice.
      try { onLocalSaved?.(records.map(record => record.id)); assertTreatmentSyncContext(context); resolve(records); }
      catch (error) { reject(error); }
    };
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('治療記録を保存できませんでした。'));
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      try {
        assertTreatmentSyncContext(context);
        const highest = (keys.result as IDBValidKey[]).reduce<number>((max, key) =>
          typeof key === 'number' && Number.isSafeInteger(key) ? Math.max(max, key) : max, 0);
        const first = Math.max(Date.now(), highest + 1);
        if (!Number.isSafeInteger(first + inputs.length)) throw new Error('治療記録のIDを安全に発行できませんでした。');
        const now = new Date().toISOString();
        inputs.forEach((input, index) => {
          const id = first + index;
          const record: SyncedTreatment = { ...input, id, syncRecordId: `treatment:${id}`,
            cloudSyncPending: context.cloudEnabled, createdAt: now, updatedAt: now,
            ...prepareTreatmentSyncState(undefined, context), ...formalTreatmentRetryState(context,
              input.medicineSource !== 'farm_stock' && !input.medicineInventoryMovementId) };
          store.add(record);
          records.push(record);
        });
      } catch (error) { failure = error; tx.abort(); }
    };
  });
}

async function finishLinkedTreatmentSave(saved: Treatment, context: TreatmentSyncContext): Promise<SyncedTreatment> {
  const current = await getRecordById<SyncedTreatment>(STORE_NAME, saved.id);
  assertTreatmentSyncContext(context);
  if (!current || !sameLinkedTreatmentContent(current, saved as SyncedTreatment)) throw new TreatmentSyncConflictError();
  markLocalChangePending();
  if (context.cloudEnabled) {
    const queued = await hasPendingSupplyLinkedRecord('treatments', current.syncRecordId || `treatment:${current.id}`);
    await assertCurrentTreatment(context, current);
    if (queued || current.cloudSyncPending) {
      throw new TreatmentSyncConflictError('治療記録と在庫はこの端末に保持しています。クラウドへの保存を確認できないため、関連経費は更新していません。通信状態と最新の内容を確認してください。');
    }
  }
  return current;
}

export async function createTreatment(
  input: TreatmentInput, options?: { onLocalSaved?: (id: number) => void },
): Promise<Treatment> {
  return withTreatmentSync(async context => {
    const normalizedInput = await normalizeTreatmentInput(input);
    assertTreatmentSyncContext(context);
    if (normalizedInput.medicineSource === 'farm_stock') {
      const saved = await saveTreatmentWithMedicineSource({ ...normalizedInput, ...formalTreatmentRetryState(context, false) }, {
        source: 'farm_stock', batchKey: normalizedInput.medicineInventoryBatchKey || '',
        quantity: normalizedInput.medicineInventoryQuantity || 0,
      }, undefined, { cloudSyncPending: context.cloudEnabled,
        syncState: prepareTreatmentSyncState(undefined, context), validateCurrent: validateTreatmentOriginal(context),
        onLocalSaved: localId => { options?.onLocalSaved?.(localId); assertTreatmentSyncContext(context); } });
      return finishLinkedTreatmentSave(saved, context);
    }
    const [saved] = await createLocalTreatments([normalizedInput], context, ids => options?.onLocalSaved?.(ids[0]));
    return syncTreatmentAfterLocalSave(saved, context);
  });
}

export async function createManyTreatments(
  inputs: TreatmentInput[], options?: { onLocalSaved?: (ids: number[]) => void },
): Promise<Treatment[]> {
  return withTreatmentSync(async context => {
    const normalizedInputs = await Promise.all(inputs.map(normalizeTreatmentInput));
    assertTreatmentSyncContext(context);
    const saved = await createLocalTreatments(normalizedInputs, context, options?.onLocalSaved);
    const acknowledged: SyncedTreatment[] = [];
    for (const record of saved) acknowledged.push(await syncTreatmentAfterLocalSave(record, context));
    return acknowledged;
  });
}

export async function updateTreatment(id: string | number, input: TreatmentInput): Promise<Treatment> {
  return withTreatmentSync(async context => {
    const current = await getRecordById<SyncedTreatment>(STORE_NAME, Number(id));
    assertTreatmentSyncContext(context);
    if (!current) throw new TreatmentSyncConflictError('指定された治療記録が見つかりません。削除後の記録は再作成していません。');
    if (current.treatmentSyncDeletePending) throw new TreatmentSyncConflictError('この治療記録は削除の確認待ちです。同じ記録の削除をもう一度実行し、関連経費の処理を完了してください。');
    const normalizedInput = await normalizeTreatmentInput(input);
    assertTreatmentSyncContext(context);
    const syncState = prepareTreatmentSyncState(current, context);
    // Free edits are not acknowledged by the old cloud revision. Retain their
    // basis/attempt and pending marker so paid list receipt cannot replace them.
    // An origin is granted again only by a subsequent explicit paid save.
    const cloudSyncPending = context.cloudEnabled || hasTreatmentSyncHistory(current);
    if (normalizedInput.medicineSource === 'farm_stock' || current.medicineInventoryMovementId ||
        await hasPendingSupplyLinkedRecord('treatments', current.syncRecordId || `treatment:${current.id}`)) {
      const saved = await saveTreatmentWithMedicineSource({ ...normalizedInput, ...formalTreatmentRetryState(context, false) }, {
        source: normalizedInput.medicineSource || '', batchKey: normalizedInput.medicineInventoryBatchKey || '',
        quantity: normalizedInput.medicineInventoryQuantity || 0,
      }, Number(id), { cloudSyncPending, syncState,
        validateCurrent: validateTreatmentOriginal(context, current) });
      return finishLinkedTreatmentSave(saved, context);
    }
    let saved: SyncedTreatment = { ...current, ...normalizedInput, ...syncState, id: Number(id),
      syncRecordId: current.syncRecordId || `treatment:${current.id}`, cloudSyncPending,
      updatedAt: new Date().toISOString(), ...formalTreatmentRetryState(context) };
    if (!context.cloudEnabled) {
      const { treatmentSyncOrigin: _origin, treatmentSyncWarning: _warning, treatmentSyncBlocked: _blocked, ...content } = saved;
      saved = content;
    }
    if (!await changeMatchingTreatment(context, current.id, current, saved)) throw new TreatmentSyncConflictError();
    return syncTreatmentAfterLocalSave(saved, context);
  });
}

export async function deleteTreatment(id: number): Promise<void> {
  return withTreatmentSync(async context => {
    const existing = await getRecordById<SyncedTreatment>(STORE_NAME, id);
    assertTreatmentSyncContext(context);
    if (!existing) return;
    const syncId = existing.syncRecordId || `treatment:${id}`;
    const inventoryLinked = Boolean(existing.medicineInventoryMovementId) || await hasPendingSupplyLinkedRecord('treatments', syncId);
    assertTreatmentSyncContext(context);
    let original = existing;
    let assertLinkedContext: (() => void) | undefined;
    if (context.cloudEnabled) {
      if (!context.token) throw new Error('治療記録の削除を確認するため、ログインして通信できる状態で削除してください。');
      const linkedState = inventoryLinked ? await getPendingTreatmentDeleteState(existing) : undefined;
      assertLinkedContext = linkedState?.assertCurrentContext;
      assertTreatmentSyncContext(context);
      assertLinkedContext?.();
      original = { ...existing, cloudSyncPending: true, treatmentSyncDeletePending: true };
      if (!await changeMatchingTreatment(context, id, existing, original)) throw new TreatmentSyncConflictError();
      try {
        assertLinkedContext?.();
        const remote = await fetchCloudTreatment(syncId, context);
        await assertCurrentTreatment(context, original);
        assertLinkedContext?.();
        if (remote && !remote.deletedAt) {
          const base = linkedState?.treatmentSyncBase ?? original.treatmentSyncBase;
          const attempt = linkedState?.treatmentSyncAttempt ?? original.treatmentSyncAttempt;
          const knownRevision = validTreatmentRevision(original.cloudUpdatedAt) && original.cloudUpdatedAt === remote.cloudUpdatedAt;
          const knownBase = base?.version === 1 && validTreatmentRevision(base.cloudUpdatedAt) && base.cloudUpdatedAt === remote.cloudUpdatedAt;
          const sameBase = base?.version === 1 && base.record && sameTreatmentContent(base.record, remote);
          const ownAttempt = attempt?.version === 1 && sameTreatmentContent(attempt.record, remote);
          if (!knownRevision && !knownBase && !sameBase && !ownAttempt && !sameTreatmentContent(original, remote)) {
            throw new TreatmentSyncConflictError('クラウドの治療記録に変更があります。記録・在庫・関連経費を保持して削除を中止しました。最新の内容を確認してください。');
          }
        }
        if (remote && !validTreatmentRevision(remote.cloudUpdatedAt)) throw new TreatmentSyncConflictError('治療記録の削除条件を確認できません。記録と関連経費を保持しています。');
        const tombstone = await requestTreatmentSync(`/api/treatments/record-sync/${encodeURIComponent(syncId)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${context.token}`, ...treatmentConditionHeaders(remote?.cloudUpdatedAt) },
        }, context, response => response.json() as Promise<CloudTreatment>);
        assertLinkedContext?.();
        if (!tombstone || tombstone.id !== syncId || !validTreatmentRevision(tombstone.cloudUpdatedAt) || !tombstone.deletedAt) {
          throw new TreatmentSyncConflictError('治療記録の削除結果を確認できません。記録・在庫・関連経費を保持しています。');
        }
        if (!await changeMatchingTreatment(context, id, original, original, true)) throw new TreatmentSyncConflictError();
      } catch (error) {
        assertTreatmentSyncContext(context);
        assertLinkedContext?.();
        await changeMatchingTreatment(context, id, original, original, true);
        throw error;
      }
    }
    try {
      assertLinkedContext?.();
      if (inventoryLinked) {
        const validateOriginal = validateTreatmentOriginal(context, original);
        await deleteTreatmentWithMedicineSource(id, current => {
          assertLinkedContext?.();
          validateOriginal(current);
        });
        assertTreatmentSyncContext(context);
        assertLinkedContext?.();
        markLocalChangePending();
      } else if (!await changeMatchingTreatment(context, id, original, undefined, context.cloudEnabled)) {
        throw new TreatmentSyncConflictError();
      }
    } catch (error) {
      assertTreatmentSyncContext(context);
      assertLinkedContext?.();
      if (context.cloudEnabled) await changeMatchingTreatment(context, id, original, original, true);
      throw error;
    }
  });
}
