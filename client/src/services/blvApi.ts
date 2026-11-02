import { getAllRecords, getRecordById } from '../storage/repository';
import { openFarmProDatabase } from '../storage/db';
import type { StoredRecord } from '../storage/types';
import type { BlvTest, BlvTestInput } from '../types/blv';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import {
  assertRecordSyncRetryPage, canRetryRecordSyncOnPage, createRecordSyncRetryOrigin,
  getRecordSyncRetryOrigin, isOwnedRecordSyncRetryOrigin, RecordSyncRetryPausedError,
  type RecordSyncRetryOrigin,
} from './recordSyncRetry';
import {
  blvConditionHeaders, sameBlvContent, stableBlvValue, toCloudBlv, validBlvRevision,
  type BlvSyncAttempt, type BlvSyncBase, type CloudBlvRecord,
} from './blvSyncProtocol';

const STORE_NAME = 'blvTests' as const;
const SYNC_PATH = '/api/blv-tests/record-sync';
export const BLV_SYNC_STATUS_EVENT = 'farmpro:blv-sync-status';
type SyncedBlv = BlvTest & StoredRecord & {
  deletedAt?: string;
  blvSyncBase?: BlvSyncBase;
  blvSyncAttempt?: BlvSyncAttempt;
  blvSyncOrigin?: RecordSyncRetryOrigin;
};
export type BlvSyncContext = {
  farmId: string | null;
  userId: string | null;
  token: string | null;
  cloudEnabled: boolean;
  planId: string;
  retryGuard?: () => void;
  retryChanged?: () => void;
};
const pendingBlvSync = new Map<string, Promise<void>>();

export class BlvSyncConflictError extends Error {
  constructor(message = 'BLV検査記録が変更されたため、古い保存結果は反映していません。最新の内容を確認してください。') {
    super(message);
    this.name = 'BlvSyncConflictError';
  }
}

/** A committed creation must be retried under the same local/cloud identity,
 * including when the authentication context changes just after its commit. */
export class BlvLocalSaveError extends Error {
  readonly record: BlvTest;
  readonly cause: unknown;
  constructor(record: BlvTest, cause: unknown) {
    super(cause instanceof Error ? cause.message : 'BLV検査記録はこの端末に保存しています。クラウドへの保存を確認できません。');
    this.name = 'BlvLocalSaveError';
    this.record = record;
    this.cause = cause;
  }
}

export function getBlvSyncContext(): BlvSyncContext {
  const user = getStoredAuthUser();
  const planId = getCurrentFarmProPlanId();
  return { farmId: user?.farmId ?? null, userId: user?.id ?? null, token: getAuthToken(),
    cloudEnabled: getFarmProPlan(planId).multiDeviceSync, planId };
}

export function assertBlvSyncContext(expected: BlvSyncContext): void {
  const current = getBlvSyncContext();
  if (current.farmId !== expected.farmId || current.userId !== expected.userId ||
      current.token !== expected.token || current.planId !== expected.planId || current.cloudEnabled !== expected.cloudEnabled) {
    throw new Error('ログインまたは農場の情報が変わったため、BLV検査記録の処理を中止しました。');
  }
  expected.retryGuard?.();
}

export function getBlvSyncStatus(record: BlvTest): { pending: boolean; warning?: string } {
  const context = getBlvSyncContext();
  const saved = record as SyncedBlv;
  if (!context.cloudEnabled) return { pending: false };
  if (saved.blvSyncDeletePending || saved.deletedAt) return {
    pending: false, warning: '削除の完了を確認できていません。内容を確認し、もう一度削除してください。',
  };
  if (!saved.cloudSyncPending) return { pending: false };
  if (saved.blvSyncBlocked) return { pending: true,
    warning: saved.blvSyncWarning || '別の変更と競合しています。内容を確認して保存してください。' };
  if (!isOwnedRecordSyncRetryOrigin('blvTests', saved.blvSyncOrigin, context)) return {
    pending: true, warning: 'この記録の送信元を確認できません。内容を開いて確認し、保存してください。',
  };
  if (saved.blvSyncWarning) return { pending: true, warning: saved.blvSyncWarning };
  return { pending: true };
}

function blvSyncChanged(context: BlvSyncContext): void {
  assertBlvSyncContext(context);
  if (context.retryChanged) context.retryChanged();
  else window.dispatchEvent(new Event(BLV_SYNC_STATUS_EVENT));
}

function sameBlvRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableBlvValue(left)) === JSON.stringify(stableBlvValue(right));
}

function isRetryableBlv(record: SyncedBlv, context: BlvSyncContext): boolean {
  return record.cloudSyncPending === true && !record.blvSyncDeletePending && !record.deletedAt && !record.blvSyncBlocked &&
    isOwnedRecordSyncRetryOrigin('blvTests', record.blvSyncOrigin, context);
}

async function assertCurrentBlv(context: BlvSyncContext, expected: SyncedBlv): Promise<void> {
  assertBlvSyncContext(context);
  const current = await getRecordById<SyncedBlv>(STORE_NAME, expected.id);
  assertBlvSyncContext(context);
  if (!sameBlvRecord(current, expected)) throw new BlvSyncConflictError();
  if (context.retryGuard && !isRetryableBlv(current!, context)) throw new RecordSyncRetryPausedError();
}

async function changeMatchingBlv(
  context: BlvSyncContext, id: number, expected: SyncedBlv | undefined, next: SyncedBlv | undefined,
  protectDeletionConflict = false, guardNewCloudIdentity = false,
): Promise<boolean> {
  assertBlvSyncContext(context);
  const database = await openFarmProDatabase();
  assertBlvSyncContext(context);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    let changed = false;
    let failure: unknown;
    transaction.oncomplete = () => {
      try { assertBlvSyncContext(context); resolve(changed); }
      catch (error) { reject(error); }
    };
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('BLV検査記録の処理を中止しました。'));
    transaction.onerror = () => { failure ??= transaction.error; };
    const read = guardNewCloudIdentity ? store.getAll() : store.get(id);
    read.onsuccess = () => {
      try {
        assertBlvSyncContext(context);
        const rows = guardNewCloudIdentity ? read.result as SyncedBlv[] : [];
        const current = guardNewCloudIdentity ? rows.find(row => row.id === id) : read.result as SyncedBlv | undefined;
        if (context.retryGuard && (!current || !isRetryableBlv(current, context))) throw new RecordSyncRetryPausedError();
        if (guardNewCloudIdentity && !expected && next && rows.some(row =>
          (row.syncRecordId || `blv:${row.id}`) === next.syncRecordId)) return;
        if (!sameBlvRecord(current, expected)) {
          // Keep a direct legacy edit protected after a cloud DELETE succeeded.
          if (protectDeletionConflict && current) store.put({ ...current, cloudSyncPending: true, blvSyncDeletePending: true });
          return;
        }
        if (next) {
          if (next.id !== id) throw new Error('更新対象のBLV検査記録が一致しません。');
          store.put(next);
        } else store.delete(id);
        changed = true;
      } catch (error) { failure = error; transaction.abort(); }
    };
  });
}

async function withBlvSync<T>(action: (context: BlvSyncContext) => Promise<T>): Promise<T> {
  const context = getBlvSyncContext();
  const key = `farmpro:blv-record-sync:${encodeURIComponent(context.farmId || 'anonymous')}`;
  const run = () => { assertBlvSyncContext(context); return action(context); };
  if (navigator.locks?.request) return navigator.locks.request(key, run);
  const previous = pendingBlvSync.get(key) ?? Promise.resolve();
  const work = previous.then(run);
  const settled = work.then(() => undefined, () => undefined);
  pendingBlvSync.set(key, settled);
  try { return await work; }
  finally { if (pendingBlvSync.get(key) === settled) pendingBlvSync.delete(key); }
}

async function requestBlvSync<T>(
  url: string, init: RequestInit, context: BlvSyncContext, read: (response: Response) => Promise<T>, allowMissing = false,
): Promise<T> {
  assertBlvSyncContext(context);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('BLV検査記録の通信が時間切れになりました。端末の記録は保持しています。'));
    }, 12000);
  });
  const work = async () => {
    const response = await fetch(url, { ...init, signal: controller.signal });
    assertBlvSyncContext(context);
    if (!response.ok && !(allowMissing && response.status === 404)) {
      let message = `BLV検査記録のクラウド同期に失敗しました（${response.status}）。`;
      try { message = (await response.json() as { message?: string }).message || message; } catch { /* Use the status message. */ }
      assertBlvSyncContext(context);
      if (response.status === 409 || response.status === 412) throw new BlvSyncConflictError(message);
      throw new Error(message);
    }
    const result = await read(response);
    assertBlvSyncContext(context);
    return result;
  };
  try { return await Promise.race([work(), timeout]); }
  finally { clearTimeout(timer!); }
}

async function fetchCloudBlv(syncId: string, context: BlvSyncContext): Promise<CloudBlvRecord | null> {
  const result = await requestBlvSync(`${SYNC_PATH}/${encodeURIComponent(syncId)}`, {
    headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store',
  }, context, response => response.status === 404 ? Promise.resolve(null) : response.json(), true);
  if (result !== null && (!result || typeof result !== 'object' || Array.isArray(result) || result.id !== syncId)) {
    throw new BlvSyncConflictError('BLV検査記録の確認結果が対象の記録と一致しません。端末の記録は保持しています。');
  }
  return result as CloudBlvRecord | null;
}

function hasBlvSyncHistory(record: SyncedBlv | undefined): boolean {
  return Boolean(record && (validBlvRevision(record.cloudUpdatedAt) || record.cloudSyncPending ||
    record.blvSyncBase || record.blvSyncAttempt));
}

function prepareBlvSyncState(existing: SyncedBlv | undefined, context: BlvSyncContext): {
  blvSyncBase?: BlvSyncBase; blvSyncAttempt?: BlvSyncAttempt;
} {
  if (!context.cloudEnabled && !hasBlvSyncHistory(existing)) return { blvSyncBase: undefined, blvSyncAttempt: undefined };
  if (existing?.blvSyncBase && (existing.cloudSyncPending || !context.cloudEnabled)) return {
    blvSyncBase: existing.blvSyncBase, blvSyncAttempt: existing.blvSyncAttempt,
  };
  return { blvSyncBase: { version: 1, record: existing ? toCloudBlv(existing) : null,
    ...(validBlvRevision(existing?.cloudUpdatedAt) ? { cloudUpdatedAt: existing.cloudUpdatedAt } : {}) },
    blvSyncAttempt: !context.cloudEnabled ? existing?.blvSyncAttempt : undefined };
}

function formalBlvRetryState(context: BlvSyncContext) {
  return { blvSyncOrigin: createRecordSyncRetryOrigin('blvTests', context), blvSyncWarning: undefined, blvSyncBlocked: undefined };
}

async function rememberBlvSyncFailure(record: SyncedBlv, context: BlvSyncContext, error: unknown): Promise<void> {
  if (!context.cloudEnabled || !record.cloudSyncPending || error instanceof RecordSyncRetryPausedError) return;
  try {
    assertBlvSyncContext(context);
    const failed: SyncedBlv = { ...record, blvSyncWarning: error instanceof BlvSyncConflictError
      ? error.message : '通信を確認できません。記録はこの端末に保存されています。',
    blvSyncBlocked: error instanceof BlvSyncConflictError || undefined };
    if (!sameBlvRecord(record, failed) && await changeMatchingBlv(context, record.id, record, failed)) blvSyncChanged(context);
  } catch { /* A new original or context must also prevent a status write. */ }
}

async function syncSavedBlv(saved: SyncedBlv, context: BlvSyncContext): Promise<SyncedBlv> {
  let record = saved;
  try {
    await assertCurrentBlv(context, record);
    if (!context.cloudEnabled) return record;
    if (!context.token) throw new Error('BLV検査記録はこの端末に保存しています。クラウド同期にはログインが必要です。');
    if (record.blvSyncDeletePending || record.deletedAt) throw new BlvSyncConflictError('このBLV検査記録は削除の確認待ちです。もう一度削除を実行してください。');
    let wire = toCloudBlv(record);
    let remote = await fetchCloudBlv(wire.id, context);
    await assertCurrentBlv(context, record);
    if (remote?.deletedAt) throw new BlvSyncConflictError('このBLV検査記録はクラウドで削除済みです。端末の編集内容は保持しています。');
    const base = record.blvSyncBase;
    if (!base || base.version !== 1 || (base.record !== null && String(base.record?.id) !== wire.id) ||
        (base.cloudUpdatedAt !== undefined && !validBlvRevision(base.cloudUpdatedAt))) {
      throw new BlvSyncConflictError('BLV検査記録の送信条件を確認できません。端末の編集内容は保持しています。');
    }
    if (remote && !validBlvRevision(remote.cloudUpdatedAt)) throw new BlvSyncConflictError('BLV検査記録の保存世代を確認できません。端末の編集内容は保持しています。');
    if (!remote || !sameBlvContent(record, remote)) {
      if (remote) {
        const knownRevision = base.cloudUpdatedAt !== undefined && base.cloudUpdatedAt === remote.cloudUpdatedAt;
        const sameBase = base.record !== null && sameBlvContent(base.record, remote);
        const ownAttempt = record.blvSyncAttempt?.version === 1 && sameBlvContent(record.blvSyncAttempt.record, remote);
        if (!knownRevision && !sameBase && !ownAttempt) throw new BlvSyncConflictError('クラウドのBLV検査記録に変更があります。端末の入力は保持しています。最新の内容を確認してください。');
      } else if (base.cloudUpdatedAt !== undefined) {
        throw new BlvSyncConflictError('クラウドの元のBLV検査記録を確認できません。端末の入力は保持しています。');
      }
      // Persist confirmed B before attempting C, so a failed C cannot lose the
      // proof needed to distinguish our lost ACK from another device's edit.
      // The approved basis can contain fields an older reader omitted. Retain
      // them, while the current edit (including explicit null/empty) wins.
      const preserved = { ...(remote ? toCloudBlv(remote) : base.record ? toCloudBlv(base.record) : {}), ...record };
      wire = toCloudBlv(preserved);
      const staged: SyncedBlv = { ...preserved,
        blvSyncBase: { version: 1, record: remote, ...(remote ? { cloudUpdatedAt: remote.cloudUpdatedAt } : {}) },
        blvSyncAttempt: { version: 1, record: wire } };
      if (!await changeMatchingBlv(context, record.id, record, staged)) throw new BlvSyncConflictError();
      record = staged;
      await assertCurrentBlv(context, record);
      remote = await requestBlvSync(`${SYNC_PATH}/${encodeURIComponent(wire.id)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`,
          ...blvConditionHeaders(remote?.cloudUpdatedAt) }, body: JSON.stringify(wire),
      }, context, response => response.json() as Promise<CloudBlvRecord>);
    }
    if (remote?.deletedAt) {
      await changeMatchingBlv(context, record.id, record, { ...record, cloudSyncPending: true, blvSyncDeletePending: true }, true);
      throw new BlvSyncConflictError('このBLV検査記録はクラウドで削除済みです。端末の編集内容は保持しています。');
    }
    if (!remote || remote.id !== wire.id || !validBlvRevision(remote.cloudUpdatedAt) || !sameBlvContent(record, remote)) {
      throw new BlvSyncConflictError('BLV検査記録の保存結果を確認できません。端末の入力は保持しています。');
    }
    const { blvSyncBase: _base, blvSyncAttempt: _attempt, blvSyncOrigin: _origin,
      blvSyncWarning: _warning, blvSyncBlocked: _blocked, ...content } = record;
    const acknowledged: SyncedBlv = { ...content, syncRecordId: wire.id, cloudUpdatedAt: remote.cloudUpdatedAt, cloudSyncPending: false };
    if (!await changeMatchingBlv(context, record.id, record, acknowledged)) throw new BlvSyncConflictError();
    blvSyncChanged(context);
    return acknowledged;
  } catch (error) {
    await rememberBlvSyncFailure(record, context, error);
    throw error;
  }
}

async function createLocalBlv(
  input: BlvTestInput, context: BlvSyncContext, onCommitted: (record: SyncedBlv) => void,
): Promise<SyncedBlv> {
  assertBlvSyncContext(context);
  const database = await openFarmProDatabase();
  assertBlvSyncContext(context);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    let record: SyncedBlv;
    let failure: unknown;
    transaction.oncomplete = () => {
      // The ID has committed even if the context changed during the commit.
      onCommitted(record);
      try { assertBlvSyncContext(context); resolve(record); } catch (error) { reject(error); }
    };
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('BLV検査記録を保存できませんでした。'));
    transaction.onerror = () => { failure ??= transaction.error; };
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      try {
        assertBlvSyncContext(context);
        const highest = (keys.result as IDBValidKey[]).reduce<number>((max, key) =>
          typeof key === 'number' && Number.isSafeInteger(key) ? Math.max(max, key) : max, 0);
        const id = Math.max(Date.now(), highest + 1);
        if (!Number.isSafeInteger(id)) throw new Error('BLV検査記録のIDを安全に発行できませんでした。');
        const now = new Date().toISOString();
        record = { ...input, id, syncRecordId: `blv:${crypto.randomUUID()}`, cloudSyncPending: context.cloudEnabled,
          createdAt: now, updatedAt: now, ...prepareBlvSyncState(undefined, context), ...formalBlvRetryState(context) };
        store.add(record);
      } catch (error) { failure = error; transaction.abort(); }
    };
  });
}

export async function createBlvTest(input: BlvTestInput): Promise<BlvTest> {
  return withBlvSync(async context => {
    let committed: SyncedBlv | undefined;
    try {
      const saved = await createLocalBlv(input, context, record => { committed = record; });
      return await syncSavedBlv(saved, context);
    } catch (error) {
      if (committed) throw new BlvLocalSaveError(committed, error);
      throw error;
    }
  });
}

export async function updateBlvTest(id: string | number, input: BlvTestInput): Promise<BlvTest> {
  return withBlvSync(async context => {
    const current = await getRecordById<SyncedBlv>(STORE_NAME, Number(id));
    assertBlvSyncContext(context);
    if (!current) throw new BlvSyncConflictError('指定されたBLV検査記録が見つかりません。削除後の記録は再作成していません。');
    if (current.blvSyncDeletePending || current.deletedAt) throw new BlvSyncConflictError('このBLV検査記録は削除の確認待ちです。もう一度削除を実行してください。');
    let saved: SyncedBlv = { ...current, ...input, id: current.id, syncRecordId: current.syncRecordId || `blv:${current.id}`,
      cloudSyncPending: context.cloudEnabled || hasBlvSyncHistory(current), updatedAt: new Date().toISOString(),
      ...prepareBlvSyncState(current, context), ...formalBlvRetryState(context) };
    if (!context.cloudEnabled) {
      // A Free edit has not been acknowledged by the old cloud revision. Keep
      // its base/attempt as proof for a later explicit save, but never resume
      // sending it merely because the paid plan is enabled again.
      const { blvSyncOrigin: _origin, blvSyncWarning: _warning, blvSyncBlocked: _blocked, ...content } = saved;
      saved = content;
    }
    if (!await changeMatchingBlv(context, current.id, current, saved)) throw new BlvSyncConflictError();
    return syncSavedBlv(saved, context);
  });
}

export async function deleteBlvTest(id: number): Promise<void> {
  return withBlvSync(async context => {
    const existing = await getRecordById<SyncedBlv>(STORE_NAME, id);
    assertBlvSyncContext(context);
    if (!existing) return;
    let original = existing;
    if (context.cloudEnabled) {
      if (!context.token) throw new Error('BLV検査記録の削除を確認するため、ログインして通信できる状態で削除してください。');
      original = { ...existing, cloudSyncPending: true, blvSyncDeletePending: true };
      if (!await changeMatchingBlv(context, id, existing, original)) throw new BlvSyncConflictError();
      try {
        const syncId = original.syncRecordId || `blv:${id}`;
        const remote = await fetchCloudBlv(syncId, context);
        await assertCurrentBlv(context, original);
        if (remote && !validBlvRevision(remote.cloudUpdatedAt)) throw new BlvSyncConflictError('BLV検査記録の削除条件を確認できません。端末の記録は保持しています。');
        if (remote && !remote.deletedAt) {
          const base = original.blvSyncBase;
          const knownRevision = (validBlvRevision(original.cloudUpdatedAt) && original.cloudUpdatedAt === remote.cloudUpdatedAt) ||
            (validBlvRevision(base?.cloudUpdatedAt) && base.cloudUpdatedAt === remote.cloudUpdatedAt);
          const sameBase = base?.version === 1 && base.record !== null && sameBlvContent(base.record, remote);
          const ownAttempt = original.blvSyncAttempt?.version === 1 && sameBlvContent(original.blvSyncAttempt.record, remote);
          if (!knownRevision && !sameBlvContent(original, remote) && !sameBase && !ownAttempt) {
            throw new BlvSyncConflictError('クラウドのBLV検査記録に変更があります。削除せず、端末の記録を保持しています。最新の内容を確認してください。');
          }
        }
        const deleted = await requestBlvSync(`${SYNC_PATH}/${encodeURIComponent(syncId)}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${context.token}`, ...blvConditionHeaders(remote?.cloudUpdatedAt) },
        }, context, response => response.json() as Promise<CloudBlvRecord>);
        if (!deleted || deleted.id !== syncId || !validBlvRevision(deleted.cloudUpdatedAt) || !validBlvRevision(deleted.deletedAt)) {
          throw new BlvSyncConflictError('BLV検査記録の削除結果を確認できません。端末の記録は保持しています。');
        }
        if (!await changeMatchingBlv(context, id, original, undefined, true)) throw new BlvSyncConflictError();
        blvSyncChanged(context);
        return;
      } catch (error) {
        await changeMatchingBlv(context, id, original, original, true);
        blvSyncChanged(context);
        throw error;
      }
    }
    if (!await changeMatchingBlv(context, id, original, undefined)) throw new BlvSyncConflictError();
    blvSyncChanged(context);
  });
}

function normalizeCloudBlv(record: CloudBlvRecord, localId: number, local?: SyncedBlv): SyncedBlv {
  return { ...(local ? toCloudBlv(local) : {}), ...toCloudBlv(record), id: localId,
    syncRecordId: record.id, cloudUpdatedAt: record.cloudUpdatedAt, cloudSyncPending: false } as SyncedBlv;
}

async function pullBlvChanges(context: BlvSyncContext): Promise<void> {
  if (!context.cloudEnabled || !context.token) return;
  assertBlvSyncContext(context);
  const originals = await getAllRecords<SyncedBlv>(STORE_NAME);
  assertBlvSyncContext(context);
  const remote = await requestBlvSync(SYNC_PATH, { headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store' },
    context, response => response.json() as Promise<CloudBlvRecord[]>);
  if (!Array.isArray(remote) || remote.some(record => !record || typeof record.id !== 'string' || !record.id ||
      !validBlvRevision(record.cloudUpdatedAt))) throw new Error('BLV検査記録のクラウド確認結果が不正です。端末の記録は保持しています。');
  const localBySyncId = new Map(originals.map(record => [record.syncRecordId || `blv:${record.id}`, record]));
  let nextId = originals.reduce((highest, record) => Math.max(highest, Number(record.id) || 0), 0) + 1;
  for (const cloud of remote) {
    assertBlvSyncContext(context);
    const local = localBySyncId.get(cloud.id);
    if (local) {
      if (local.cloudSyncPending || local.blvSyncDeletePending) continue;
      if (!validBlvRevision(local.cloudUpdatedAt)) {
        if (!cloud.deletedAt && sameBlvContent(local, cloud)) {
          // First adoption is metadata-only. A numeric ID from an older backup
          // must not let a different device replace unconfirmed local content.
          const { blvSyncBase: _base, blvSyncAttempt: _attempt, blvSyncOrigin: _origin,
            blvSyncWarning: _warning, blvSyncBlocked: _blocked, ...content } = local;
          const adopted: SyncedBlv = { ...content, syncRecordId: cloud.id,
            cloudUpdatedAt: cloud.cloudUpdatedAt, cloudSyncPending: false };
          if (await changeMatchingBlv(context, local.id, local, adopted)) localBySyncId.set(cloud.id, adopted);
        } else {
          const { blvSyncOrigin: _origin, ...content } = local;
          const held: SyncedBlv = { ...content, cloudSyncPending: true, blvSyncBlocked: true,
            blvSyncWarning: 'クラウドに同じ番号の異なるBLV検査記録または削除情報があります。端末の原本は保持しています。内容を確認してください。' };
          if (await changeMatchingBlv(context, local.id, local, held)) localBySyncId.set(cloud.id, held);
        }
        continue;
      }
      if (validBlvRevision(local.cloudUpdatedAt) && Date.parse(cloud.cloudUpdatedAt!) <= Date.parse(local.cloudUpdatedAt)) continue;
      const next = cloud.deletedAt ? undefined : normalizeCloudBlv(cloud, local.id, local);
      if (!await changeMatchingBlv(context, local.id, local, next)) continue;
      if (next) localBySyncId.set(cloud.id, next); else localBySyncId.delete(cloud.id);
    } else if (!cloud.deletedAt) {
      if (!Number.isSafeInteger(nextId)) throw new Error('BLV検査記録のIDを安全に発行できませんでした。');
      const saved = normalizeCloudBlv(cloud, nextId++);
      if (await changeMatchingBlv(context, saved.id, undefined, saved, false, true)) localBySyncId.set(cloud.id, saved);
    }
  }
}

export async function getBlvTestList(): Promise<BlvTest[]> {
  return withBlvSync(async context => {
    try { await pullBlvChanges(context); }
    catch (error) { console.warn('BLV検査記録のクラウド取り込みをスキップしました。', error); }
    assertBlvSyncContext(context);
    const records = await getAllRecords<SyncedBlv>(STORE_NAME);
    assertBlvSyncContext(context);
    return records.sort((a, b) => b.testDate.localeCompare(a.testDate));
  });
}

export async function getBlvTest(id: string | number): Promise<BlvTest> {
  const context = getBlvSyncContext();
  const record = await getRecordById<BlvTest>(STORE_NAME, Number(id));
  assertBlvSyncContext(context);
  if (!record) throw new Error('指定されたBLV検査記録が見つかりません。');
  return record;
}

/** Only resume formally saved sources; this service never writes cattle,
 * expenses, schedules, or any other record store. */
export async function retryPendingBlvSync(): Promise<number> {
  const initial = getBlvSyncContext();
  const origin = getRecordSyncRetryOrigin('blvTests', initial);
  const pathname = window.location.pathname;
  if (!origin || !canRetryRecordSyncOnPage('blvTests', pathname)) return 0;
  const guard = () => {
    assertRecordSyncRetryPage('blvTests');
    if (window.location.pathname !== pathname || !isOwnedRecordSyncRetryOrigin('blvTests', origin, initial)) throw new RecordSyncRetryPausedError();
  };
  let changed = false;
  let completed = 0;
  const context: BlvSyncContext = { ...initial, retryGuard: guard, retryChanged: () => { changed = true; } };
  try {
    assertBlvSyncContext(context);
    await withBlvSync(async () => {
      assertBlvSyncContext(context);
      const records = await getAllRecords<SyncedBlv>(STORE_NAME);
      assertBlvSyncContext(context);
      for (const record of records) {
        assertBlvSyncContext(context);
        if (!isRetryableBlv(record, context)) continue;
        try { await syncSavedBlv(record, context); completed += 1; }
        catch { assertBlvSyncContext(context); }
      }
    });
  } catch { /* Leave unacknowledged records pending when communication or the context changes. */ }
  finally {
    if (changed) {
      try { assertBlvSyncContext(context); window.dispatchEvent(new Event(BLV_SYNC_STATUS_EVENT)); }
      catch { /* Do not refresh a different page or owner. */ }
    }
  }
  return completed;
}
