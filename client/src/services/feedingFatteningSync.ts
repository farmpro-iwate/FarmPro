import { getAllRecords, getRecordById } from '../storage/repository';
import { openFarmProDatabase } from '../storage/db';
import type { StoredRecord } from '../storage/types';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import {
  assertRecordSyncRetryPage, canRetryRecordSyncOnPage, createRecordSyncRetryOrigin,
  getRecordSyncRetryOrigin, isOwnedRecordSyncRetryOrigin, RecordSyncRetryPausedError,
  type RecordSyncRetryContext,
} from './recordSyncRetry';
import {
  feedingFatteningConditionHeaders, feedingFatteningSyncResources, sameFeedingFatteningContent,
  stableFeedingFatteningValue, toCloudFeedingFattening, validFeedingFatteningRevision,
  type FeedingFatteningSource, type FeedingFatteningCloudRecord as CloudRecord,
  type FeedingFatteningSyncBase as SyncBase, type FeedingFatteningSyncAttempt as SyncAttempt,
} from './feedingFatteningSyncProtocol';

export type FeedingFatteningSyncContext = RecordSyncRetryContext & { retryGuard?: () => void; retryChanged?: () => void };
export type FeedingFatteningSyncFields = { syncRecordId?: string; cloudUpdatedAt?: string; cloudSyncPending?: boolean };
type LocalRecord = StoredRecord & FeedingFatteningSyncFields & { id: string; deletedAt?: string };
const pendingSync = new Map<string, Promise<void>>();

type ResourceOptions<TRecord, TInput> = {
  source: FeedingFatteningSource;
  label: string;
  classPrefix: string;
  event: string;
  compare?: (left: TRecord, right: TRecord) => number;
  readBeforeCreate?: boolean;
  validateCreate?: (records: TRecord[], input: TInput) => void;
  validateUpdate?: (records: TRecord[], current: TRecord, input: TInput) => void;
};

/** A shared implementation for these two string-ID source stores only. No
 * related cattle, calf, inventory, expense or schedule store is written here. */
export function createFeedingFatteningSync<TRecord extends { id: string }, TInput extends object>(
  options: ResourceOptions<TRecord, TInput>,
) {
  const { source, label, event } = options;
  const { prefix, path } = feedingFatteningSyncResources[source];
  const keys = { base: `${prefix}Base`, attempt: `${prefix}Attempt`, origin: `${prefix}Origin`,
    warning: `${prefix}Warning`, blocked: `${prefix}Blocked`, deletion: `${prefix}DeletePending` };
  const toCloud = (record: StoredRecord) => toCloudFeedingFattening(source, record);
  const sameContent = (left: StoredRecord, right: StoredRecord) => sameFeedingFatteningContent(source, left, right);
  const sameOriginal = (left: unknown, right: unknown) =>
    JSON.stringify(stableFeedingFatteningValue(left)) === JSON.stringify(stableFeedingFatteningValue(right));
  const baseOf = (record: LocalRecord) => record[keys.base] as SyncBase | undefined;
  const attemptOf = (record: LocalRecord) => record[keys.attempt] as SyncAttempt | undefined;
  const without = (record: LocalRecord, names: string[]) => Object.fromEntries(Object.entries(record)
    .filter(([key]) => !names.includes(key))) as LocalRecord;
  const acknowledgedContent = (record: LocalRecord) => without(record,
    [keys.base, keys.attempt, keys.origin, keys.warning, keys.blocked]);
  const hasSyncEvidence = (record: LocalRecord) => Boolean(validFeedingFatteningRevision(record.cloudUpdatedAt) ||
    record.cloudSyncPending || baseOf(record) || attemptOf(record));
  const freeRecord = (record: LocalRecord, keepProof: boolean) => keepProof
    ? without(record, [keys.origin, keys.warning, keys.blocked])
    : without(acknowledgedContent(record), ['cloudUpdatedAt']);

  class SyncConflictError extends Error {
    constructor(message = `${label}が変更されたため、古い保存結果は反映していません。最新の内容を確認してください。`) {
      super(message); this.name = `${options.classPrefix}SyncConflictError`;
    }
  }
  class LocalSaveError extends Error {
    readonly record: TRecord;
    readonly cause: unknown;
    constructor(record: TRecord, cause: unknown) {
      super(cause instanceof Error ? cause.message : `${label}はこの端末に保存しています。クラウドへの保存を確認できません。`);
      this.name = `${options.classPrefix}LocalSaveError`; this.record = record; this.cause = cause;
    }
  }

  function getContext(): FeedingFatteningSyncContext {
    const user = getStoredAuthUser();
    const planId = getCurrentFarmProPlanId();
    return { farmId: user?.farmId ?? null, userId: user?.id ?? null, token: getAuthToken(), planId,
      cloudEnabled: getFarmProPlan(planId).multiDeviceSync };
  }
  function assertContext(expected: FeedingFatteningSyncContext): void {
    const current = getContext();
    if (current.farmId !== expected.farmId || current.userId !== expected.userId || current.token !== expected.token ||
        current.planId !== expected.planId || current.cloudEnabled !== expected.cloudEnabled) {
      throw new Error(`ログインまたは農場の情報が変わったため、${label}の処理を中止しました。`);
    }
    expected.retryGuard?.();
  }
  function changed(context: FeedingFatteningSyncContext): void {
    assertContext(context);
    if (context.retryChanged) context.retryChanged(); else window.dispatchEvent(new Event(event));
  }
  function getStatus(record: TRecord): { pending: boolean; warning?: string } {
    const context = getContext(); const saved = record as unknown as LocalRecord;
    if (!context.cloudEnabled) return { pending: false };
    if (saved[keys.deletion] || saved.deletedAt) return { pending: false,
      warning: '削除の完了を確認できていません。内容を確認し、もう一度削除してください。' };
    if (!saved.cloudSyncPending) return { pending: false };
    if (saved[keys.blocked]) return { pending: true,
      warning: String(saved[keys.warning] || '別の変更と競合しています。内容を確認して保存してください。') };
    if (!isOwnedRecordSyncRetryOrigin(source, saved[keys.origin], context)) return { pending: true,
      warning: 'この記録の送信元を確認できません。内容を開いて確認し、保存してください。' };
    return saved[keys.warning] ? { pending: true, warning: String(saved[keys.warning]) } : { pending: true };
  }
  const retryable = (record: LocalRecord, context: FeedingFatteningSyncContext) => record.cloudSyncPending === true &&
    !record[keys.deletion] && !record.deletedAt && !record[keys.blocked] && isOwnedRecordSyncRetryOrigin(source, record[keys.origin], context);

  async function assertCurrent(context: FeedingFatteningSyncContext, expected: LocalRecord): Promise<void> {
    assertContext(context);
    const current = await getRecordById<LocalRecord>(source, expected.id);
    assertContext(context);
    if (!sameOriginal(current, expected)) throw new SyncConflictError();
    if (context.retryGuard && !retryable(current!, context)) throw new RecordSyncRetryPausedError();
  }
  async function changeMatching(
    context: FeedingFatteningSyncContext, id: string, expected: LocalRecord | undefined, next: LocalRecord | undefined,
    guards: { protectDeletion?: boolean; cloudIdentity?: boolean; validate?: (rows: LocalRecord[]) => void } = {},
  ): Promise<boolean> {
    assertContext(context);
    const db = await openFarmProDatabase(); assertContext(context);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(source, 'readwrite'); const store = tx.objectStore(source);
      let applied = false; let failure: unknown;
      tx.oncomplete = () => { try { assertContext(context); resolve(applied); } catch (error) { reject(error); } };
      tx.onabort = () => reject(failure ?? tx.error ?? new Error(`${label}の処理を中止しました。`));
      tx.onerror = () => { failure ??= tx.error; };
      const all = guards.cloudIdentity || Boolean(guards.validate);
      const read = all ? store.getAll() : store.get(id);
      read.onsuccess = () => {
        try {
          assertContext(context);
          const rows = all ? read.result as LocalRecord[] : [];
          const current = all ? rows.find(row => row.id === id) : read.result as LocalRecord | undefined;
          if (context.retryGuard && (!current || !retryable(current, context))) throw new RecordSyncRetryPausedError();
          if (guards.cloudIdentity && !expected && next && rows.some(row => (row.syncRecordId || row.id) === next.syncRecordId)) return;
          if (!sameOriginal(current, expected)) {
            if (guards.protectDeletion && current) store.put({ ...current, cloudSyncPending: true, [keys.deletion]: true });
            return;
          }
          guards.validate?.(rows);
          if (next) {
            if (next.id !== id) throw new Error(`更新対象の${label}が一致しません。`);
            store.put(next);
          } else store.delete(id);
          applied = true;
        } catch (error) { failure = error; tx.abort(); }
      };
    });
  }
  async function withSync<T>(action: (context: FeedingFatteningSyncContext) => Promise<T>): Promise<T> {
    const context = getContext(); const key = `farmpro:${source}-record-sync:${encodeURIComponent(context.farmId || 'anonymous')}`;
    const run = () => { assertContext(context); return action(context); };
    if (navigator.locks?.request) return navigator.locks.request(key, run);
    const work = (pendingSync.get(key) ?? Promise.resolve()).then(run);
    const settled = work.then(() => undefined, () => undefined); pendingSync.set(key, settled);
    try { return await work; } finally { if (pendingSync.get(key) === settled) pendingSync.delete(key); }
  }
  async function request<T>(url: string, init: RequestInit, context: FeedingFatteningSyncContext,
    read: (response: Response) => Promise<T>, allowMissing = false): Promise<T> {
    assertContext(context); const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error(`${label}の通信が時間切れになりました。端末の記録は保持しています。`)); }, 12000);
    });
    const work = async () => {
      const response = await fetch(url, { ...init, signal: controller.signal }); assertContext(context);
      if (!response.ok && !(allowMissing && response.status === 404)) {
        let message = `${label}のクラウド同期に失敗しました（${response.status}）。`;
        try { message = (await response.json() as { message?: string }).message || message; } catch { /* Use the status message. */ }
        assertContext(context);
        if (response.status === 409 || response.status === 412) throw new SyncConflictError(message);
        throw new Error(message);
      }
      const result = await read(response); assertContext(context); return result;
    };
    try { return await Promise.race([work(), timeout]); } finally { clearTimeout(timer!); }
  }
  async function fetchOne(syncId: string, context: FeedingFatteningSyncContext): Promise<CloudRecord | null> {
    const result = await request(`${path}/${encodeURIComponent(syncId)}`, { headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store' },
      context, response => response.status === 404 ? Promise.resolve(null) : response.json(), true);
    if (result !== null && (!result || typeof result !== 'object' || Array.isArray(result) || result.id !== syncId)) {
      throw new SyncConflictError(`${label}の確認結果が対象と一致しません。端末の記録は保持しています。`);
    }
    return result as CloudRecord | null;
  }
  function prepareState(existing: LocalRecord | undefined, context: FeedingFatteningSyncContext) {
    const base = existing ? baseOf(existing) : undefined;
    if (!context.cloudEnabled && (!existing || !hasSyncEvidence(existing))) return { [keys.base]: undefined, [keys.attempt]: undefined };
    if (existing && base && (existing.cloudSyncPending || !context.cloudEnabled)) return { [keys.base]: base, [keys.attempt]: attemptOf(existing) };
    return { [keys.base]: { version: 1, record: existing ? toCloud(existing) : null,
      ...(validFeedingFatteningRevision(existing?.cloudUpdatedAt) ? { cloudUpdatedAt: existing.cloudUpdatedAt } : {}) },
    [keys.attempt]: existing?.cloudSyncPending ? attemptOf(existing) : undefined };
  }
  function formalState(context: FeedingFatteningSyncContext) {
    return { [keys.origin]: createRecordSyncRetryOrigin(source, context), [keys.warning]: undefined, [keys.blocked]: undefined };
  }
  async function rememberFailure(record: LocalRecord, context: FeedingFatteningSyncContext, error: unknown): Promise<void> {
    if (!context.cloudEnabled || !record.cloudSyncPending || error instanceof RecordSyncRetryPausedError) return;
    try {
      assertContext(context);
      const failed = { ...record, [keys.warning]: error instanceof SyncConflictError ? error.message : '通信を確認できません。記録はこの端末に保存されています。',
        [keys.blocked]: error instanceof SyncConflictError || undefined };
      if (!sameOriginal(record, failed) && await changeMatching(context, record.id, record, failed)) changed(context);
    } catch { /* Do not alter a changed original or a different context. */ }
  }

  async function syncSaved(saved: LocalRecord, context: FeedingFatteningSyncContext): Promise<LocalRecord> {
    let record = saved;
    try {
      await assertCurrent(context, record);
      if (!context.cloudEnabled) return record;
      if (!context.token) throw new Error(`${label}はこの端末に保存しています。クラウド同期にはログインが必要です。`);
      if (record[keys.deletion] || record.deletedAt) throw new SyncConflictError(`${label}は削除の確認待ちです。もう一度削除してください。`);
      let wire = toCloud(record); let remote = await fetchOne(wire.id, context);
      await assertCurrent(context, record);
      if (remote?.deletedAt) throw new SyncConflictError(`${label}はクラウドで削除済みです。端末の入力は保持しています。`);
      const base = baseOf(record);
      if (!base || base.version !== 1 || (base.record !== null && String(base.record?.id) !== wire.id) ||
          (base.cloudUpdatedAt !== undefined && !validFeedingFatteningRevision(base.cloudUpdatedAt))) {
        throw new SyncConflictError(`${label}の送信条件を確認できません。端末の入力は保持しています。`);
      }
      if (remote && !validFeedingFatteningRevision(remote.cloudUpdatedAt)) throw new SyncConflictError(`${label}の保存世代を確認できません。`);
      if (!remote || !sameContent(record, remote)) {
        if (remote) {
          const known = base.cloudUpdatedAt !== undefined && base.cloudUpdatedAt === remote.cloudUpdatedAt;
          const sameBase = base.record !== null && sameContent(base.record, remote);
          const attempt = attemptOf(record); const ownAttempt = attempt?.version === 1 && sameContent(attempt.record, remote);
          if (!known && !sameBase && !ownAttempt) throw new SyncConflictError(`クラウドの${label}に変更があります。端末の入力を保持しています。最新の内容を確認してください。`);
        } else if (base.cloudUpdatedAt !== undefined) throw new SyncConflictError(`クラウドの元の${label}を確認できません。端末の入力は保持しています。`);
        // Preserve unknown values from the approved basis. Persist confirmed B
        // before replacing its attempt with C, so a failed C retains that proof.
        const preserved = { ...(remote ? toCloud(remote) : base.record ? toCloud(base.record) : {}), ...record };
        wire = toCloud(preserved);
        const staged: LocalRecord = { ...preserved, [keys.base]: { version: 1, record: remote,
          ...(remote ? { cloudUpdatedAt: remote.cloudUpdatedAt } : {}) }, [keys.attempt]: { version: 1, record: wire } };
        if (!await changeMatching(context, record.id, record, staged)) throw new SyncConflictError();
        record = staged; await assertCurrent(context, record);
        remote = await request(`${path}/${encodeURIComponent(wire.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json',
          Authorization: `Bearer ${context.token}`, ...feedingFatteningConditionHeaders(remote?.cloudUpdatedAt) }, body: JSON.stringify(wire) },
        context, response => response.json() as Promise<CloudRecord>);
      }
      if (remote?.deletedAt) {
        await changeMatching(context, record.id, record, { ...record, cloudSyncPending: true, [keys.deletion]: true }, { protectDeletion: true });
        throw new SyncConflictError(`${label}はクラウドで削除済みです。端末の入力は保持しています。`);
      }
      if (!remote || remote.id !== wire.id || !validFeedingFatteningRevision(remote.cloudUpdatedAt) || !sameContent(record, remote)) {
        throw new SyncConflictError(`${label}の保存結果を確認できません。端末の入力は保持しています。`);
      }
      const acknowledged: LocalRecord = { ...acknowledgedContent(record), syncRecordId: wire.id,
        cloudUpdatedAt: remote.cloudUpdatedAt, cloudSyncPending: false };
      if (!await changeMatching(context, record.id, record, acknowledged)) throw new SyncConflictError();
      changed(context); return acknowledged;
    } catch (error) { await rememberFailure(record, context, error); throw error; }
  }

  async function createLocal(input: TInput, context: FeedingFatteningSyncContext,
    onCommitted: (record: LocalRecord) => void): Promise<LocalRecord> {
    assertContext(context); const db = await openFarmProDatabase(); assertContext(context);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(source, 'readwrite'); const store = tx.objectStore(source);
      let saved: LocalRecord; let failure: unknown;
      tx.oncomplete = () => {
        // The ID already committed, even when the context changed at commit.
        onCommitted(saved);
        try { assertContext(context); resolve(saved); } catch (error) { reject(error); }
      };
      tx.onabort = () => reject(failure ?? tx.error ?? new Error(`${label}を保存できませんでした。`));
      tx.onerror = () => { failure ??= tx.error; };
      const read = store.getAll();
      read.onsuccess = () => {
        try {
          assertContext(context);
          options.validateCreate?.(read.result as TRecord[], input);
          const id = crypto.randomUUID(); const now = new Date().toISOString();
          saved = { ...input, id, syncRecordId: id, cloudSyncPending: context.cloudEnabled,
            createdAt: now, updatedAt: now, ...prepareState(undefined, context), ...formalState(context) };
          if (!context.cloudEnabled) saved = freeRecord(saved, false);
          store.add(saved);
        } catch (error) { failure = error; tx.abort(); }
      };
    });
  }
  async function create(input: TInput): Promise<TRecord> {
    return withSync(async context => {
      if (options.readBeforeCreate) await pullSafely(context);
      let committed: LocalRecord | undefined;
      try {
        const saved = await createLocal(input, context, record => { committed = record; });
        return await syncSaved(saved, context) as unknown as TRecord;
      } catch (error) {
        if (committed) throw new LocalSaveError(committed as unknown as TRecord, error);
        throw error;
      }
    });
  }
  async function update(id: string, input: TInput): Promise<TRecord> {
    return withSync(async context => {
      const current = await getRecordById<LocalRecord>(source, id); assertContext(context);
      if (!current) throw new SyncConflictError(`指定された${label}が見つかりません。削除後の記録は再作成していません。`);
      if (current[keys.deletion] || current.deletedAt) throw new SyncConflictError(`${label}は削除の確認待ちです。もう一度削除してください。`);
      const keepFreeProof = !context.cloudEnabled && hasSyncEvidence(current);
      let saved: LocalRecord = { ...current, ...input, id: current.id, syncRecordId: current.syncRecordId || current.id,
        cloudSyncPending: context.cloudEnabled || keepFreeProof, updatedAt: new Date().toISOString(),
        ...prepareState(current, context), ...formalState(context) };
      // A Free edit has no permission for automatic upload. Keep the last
      // confirmed basis/attempt so a later explicit save can prove ownership
      // without allowing a list read to replace the unacknowledged edit.
      if (!context.cloudEnabled) saved = freeRecord(saved, keepFreeProof);
      const validate = options.validateUpdate
        ? (rows: LocalRecord[]) => options.validateUpdate!(rows as unknown as TRecord[], current as unknown as TRecord, input) : undefined;
      if (!await changeMatching(context, id, current, saved, { validate })) throw new SyncConflictError();
      return await syncSaved(saved, context) as unknown as TRecord;
    });
  }
  async function remove(id: string): Promise<void> {
    return withSync(async context => {
      const existing = await getRecordById<LocalRecord>(source, id); assertContext(context);
      if (!existing) return;
      let original = existing;
      if (context.cloudEnabled) {
        if (!context.token) throw new Error(`${label}の削除を確認するため、ログインして通信できる状態で削除してください。`);
        original = { ...existing, cloudSyncPending: true, [keys.deletion]: true };
        if (!await changeMatching(context, id, existing, original)) throw new SyncConflictError();
        try {
          const syncId = original.syncRecordId || id;
          const remote = await fetchOne(syncId, context); await assertCurrent(context, original);
          if (remote && !validFeedingFatteningRevision(remote.cloudUpdatedAt)) throw new SyncConflictError(`${label}の削除条件を確認できません。端末の原本は保持しています。`);
          if (remote && !remote.deletedAt) {
            const base = baseOf(original); const attempt = attemptOf(original);
            const known = (validFeedingFatteningRevision(original.cloudUpdatedAt) && original.cloudUpdatedAt === remote.cloudUpdatedAt) ||
              (validFeedingFatteningRevision(base?.cloudUpdatedAt) && base.cloudUpdatedAt === remote.cloudUpdatedAt);
            const sameBase = base?.version === 1 && base.record !== null && sameContent(base.record, remote);
            const ownAttempt = attempt?.version === 1 && sameContent(attempt.record, remote);
            if (!known && !sameContent(original, remote) && !sameBase && !ownAttempt) throw new SyncConflictError(`クラウドの${label}に変更があります。削除せず端末の記録を保持しています。最新の内容を確認してください。`);
          }
          const deleted = await request(`${path}/${encodeURIComponent(syncId)}`, { method: 'DELETE',
            headers: { Authorization: `Bearer ${context.token}`, ...feedingFatteningConditionHeaders(remote?.cloudUpdatedAt) } },
          context, response => response.json() as Promise<CloudRecord>);
          if (!deleted || deleted.id !== syncId || !validFeedingFatteningRevision(deleted.cloudUpdatedAt) || !validFeedingFatteningRevision(deleted.deletedAt)) {
            throw new SyncConflictError(`${label}の削除結果を確認できません。端末の記録は保持しています。`);
          }
          if (!await changeMatching(context, id, original, undefined, { protectDeletion: true })) throw new SyncConflictError();
          changed(context); return;
        } catch (error) {
          await changeMatching(context, id, original, original, { protectDeletion: true }); changed(context); throw error;
        }
      }
      if (!await changeMatching(context, id, original, undefined)) throw new SyncConflictError();
      changed(context);
    });
  }
  async function pull(context: FeedingFatteningSyncContext): Promise<void> {
    if (!context.cloudEnabled || !context.token) return;
    assertContext(context); const originals = await getAllRecords<LocalRecord>(source); assertContext(context);
    const remote = await request(path, { headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store' }, context,
      response => response.json() as Promise<CloudRecord[]>);
    if (!Array.isArray(remote) || remote.some(record => !record || typeof record.id !== 'string' || !record.id ||
        !validFeedingFatteningRevision(record.cloudUpdatedAt) || (record.deletedAt !== undefined && !validFeedingFatteningRevision(record.deletedAt)))) {
      throw new Error(`${label}のクラウド確認結果が不正です。端末の記録は保持しています。`);
    }
    const bySyncId = new Map(originals.map(record => [record.syncRecordId || record.id, record]));
    for (const cloud of remote) {
      assertContext(context); const local = bySyncId.get(cloud.id);
      if (local) {
        if (local.cloudSyncPending || local[keys.deletion] || local.deletedAt) continue;
        if (!validFeedingFatteningRevision(local.cloudUpdatedAt)) {
          // A matching ID alone never authorizes replacing a restored or
          // local-only original. First adoption must match the full business.
          const next: LocalRecord = !cloud.deletedAt && sameContent(local, cloud)
            ? { ...acknowledgedContent(local), syncRecordId: cloud.id, cloudUpdatedAt: cloud.cloudUpdatedAt, cloudSyncPending: false }
            : { ...without(local, [keys.origin]), cloudSyncPending: true, [keys.blocked]: true,
              [keys.warning]: `クラウドに同じIDの異なる${label}または削除情報があります。端末の原本は保持しています。内容を確認してください。` };
          if (await changeMatching(context, local.id, local, next)) bySyncId.set(cloud.id, next);
          continue;
        }
        if (Date.parse(cloud.cloudUpdatedAt!) <= Date.parse(local.cloudUpdatedAt)) continue;
        const next: LocalRecord | undefined = cloud.deletedAt ? undefined : { ...toCloud(local), ...toCloud(cloud),
          id: local.id, syncRecordId: cloud.id, cloudUpdatedAt: cloud.cloudUpdatedAt, cloudSyncPending: false };
        if (!await changeMatching(context, local.id, local, next)) continue;
        if (next) bySyncId.set(cloud.id, next); else bySyncId.delete(cloud.id);
      } else if (!cloud.deletedAt) {
        const next: LocalRecord = { ...toCloud(cloud), id: cloud.id, syncRecordId: cloud.id, cloudUpdatedAt: cloud.cloudUpdatedAt, cloudSyncPending: false };
        if (await changeMatching(context, next.id, undefined, next, { cloudIdentity: true })) bySyncId.set(cloud.id, next);
      }
    }
  }
  async function pullSafely(context: FeedingFatteningSyncContext): Promise<void> {
    try { await pull(context); } catch (error) { console.warn(`${label}のクラウド取り込みをスキップしました。`, error); }
    assertContext(context);
  }
  async function list(): Promise<TRecord[]> {
    return withSync(async context => {
      await pullSafely(context); const records = await getAllRecords<LocalRecord>(source); assertContext(context);
      const result = records as unknown as TRecord[];
      return options.compare ? result.sort(options.compare) : result;
    });
  }
  async function get(id: string): Promise<TRecord> {
    const context = getContext(); const record = await getRecordById<LocalRecord>(source, id); assertContext(context);
    if (!record) throw new Error(`${label}を取得できませんでした。`);
    return record as unknown as TRecord;
  }
  async function retry(): Promise<number> {
    const initial = getContext(); const origin = getRecordSyncRetryOrigin(source, initial); const pathname = window.location.pathname;
    if (!origin || !canRetryRecordSyncOnPage(source, pathname)) return 0;
    const guard = () => {
      assertRecordSyncRetryPage(source);
      if (window.location.pathname !== pathname || !isOwnedRecordSyncRetryOrigin(source, origin, initial)) throw new RecordSyncRetryPausedError();
    };
    let completed = 0; let didChange = false;
    const context: FeedingFatteningSyncContext = { ...initial, retryGuard: guard, retryChanged: () => { didChange = true; } };
    try {
      assertContext(context);
      await withSync(async () => {
        assertContext(context); const records = await getAllRecords<LocalRecord>(source); assertContext(context);
        for (const record of records) {
          assertContext(context); if (!retryable(record, context)) continue;
          try { await syncSaved(record, context); completed += 1; } catch { assertContext(context); }
        }
      });
    } catch { /* Leave unacknowledged records pending when the context or communication changes. */ }
    finally {
      if (didChange) {
        try { assertContext(context); window.dispatchEvent(new Event(event)); } catch { /* Do not refresh a changed page or owner. */ }
      }
    }
    return completed;
  }
  return { getContext, assertContext, getStatus, create, update, remove, list, get, retry, LocalSaveError, SyncConflictError };
}
