import { openFarmProDatabase } from '../storage/db';
import type { StoredRecord } from '../storage/types';
import { getAuthToken, getStoredAuthUser } from './authClient';
import {
  getSupplySyncIdentity, sameSupplyRecord, SUPPLY_SYNC_STATE_ID,
  type SupplyInventorySyncState,
} from './supplyInventorySyncState';
import type { SupplyMovement } from './supplyInventoryApi';
import {
  breedingConditionHeaders, sameBreedingContent, toCloudBreeding, validBreedingRevision,
  type BreedingSyncAttempt, type BreedingSyncBase, type CloudBreedingRecord,
} from './breedingSyncProtocol';

type LinkedStore = 'treatments' | 'breedings' | 'expenses';
type LinkedQueue = StoredRecord & {
  id: string;
  version: 1;
  operationId: string;
  farmId: string;
  ownerId: string;
  store: LinkedStore;
  sourceId: string | number;
  cloudId: string;
  record: StoredRecord;
  movementIds: string[];
  deleted: boolean;
  breedingSyncBase?: BreedingSyncBase;
  breedingSyncAttempt?: BreedingSyncAttempt;
};
type Context = { farmId: string; ownerId: string; userId: string; token: string };
type View = {
  queue: LinkedQueue | undefined;
  source: StoredRecord | undefined;
  inventory: SupplyMovement[];
  state: SupplyInventorySyncState | undefined;
};
const PREFIX = 'supply-linked-sync:';
const running = new Map<string, Promise<boolean>>();
const staged = new WeakMap<IDBTransaction, Map<string, {
  latest: LinkedQueue; movementIds: Set<string>; loaded: boolean; hadQueue: boolean;
}>>();

function queueId(store: LinkedStore, cloudId: string): string {
  return `${PREFIX}${store}:${encodeURIComponent(cloudId)}`;
}

function cloudIdFor(store: LinkedStore, record: StoredRecord): string {
  if (store === 'breedings') return String(record.cloudRecordId ?? record.id);
  return String(record.syncRecordId || `${store === 'treatments' ? 'treatment' : 'expense'}:${record.id}`);
}

function validQueue(value: unknown): value is LinkedQueue {
  if (!value || typeof value !== 'object') return false;
  const row = value as LinkedQueue;
  return row.version === 1 && ['treatments', 'breedings', 'expenses'].includes(row.store) &&
    typeof row.cloudId === 'string' && Boolean(row.cloudId.trim()) && row.id === queueId(row.store, row.cloudId) &&
    typeof row.operationId === 'string' && Boolean(row.operationId) &&
    typeof row.farmId === 'string' && typeof row.ownerId === 'string' &&
    (typeof row.sourceId === 'number' || typeof row.sourceId === 'string') &&
    Boolean(row.record) && row.record.id === row.sourceId && cloudIdFor(row.store, row.record) === row.cloudId &&
    Array.isArray(row.movementIds) && row.movementIds.length > 0 &&
    row.movementIds.every(id => typeof id === 'string' && Boolean(id.trim())) &&
    typeof row.deleted === 'boolean' && (row.store !== 'breedings' || validBreedingQueueState(row));
}

function validBreedingQueueState(row: LinkedQueue): boolean {
  const base = row.breedingSyncBase;
  const attempt = row.breedingSyncAttempt;
  const matching = (record: unknown) => !!record && typeof record === 'object' && !Array.isArray(record) &&
    String((record as StoredRecord).id) === row.cloudId;
  return (base === undefined || (!!base && base.version === 1 && (base.record === null || matching(base.record)) &&
    (base.cloudUpdatedAt === undefined || validBreedingRevision(base.cloudUpdatedAt)))) &&
    (attempt === undefined || (!!attempt && attempt.version === 1 && matching(attempt.record)));
}

function initialBreedingQueueBase(record: StoredRecord): BreedingSyncBase {
  const saved = record.breedingSyncBase as BreedingSyncBase | undefined;
  if (saved) return structuredClone(saved);
  return { version: 1, record: null,
    ...(validBreedingRevision(record.cloudUpdatedAt) ? { cloudUpdatedAt: record.cloudUpdatedAt } : {}) };
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, normalize(entry)]));
}

function sameSource(a: StoredRecord | undefined, b: StoredRecord): boolean {
  if (!a) return false;
  const comparable = (record: StoredRecord) => {
    const { cloudUpdatedAt: _cloudUpdatedAt, cloudSyncPending: _cloudSyncPending, ...content } = record;
    return JSON.stringify(normalize(content));
  };
  return comparable(a) === comparable(b);
}

function sameInitialExpense(a: StoredRecord, b: StoredRecord): boolean {
  const comparable = (record: StoredRecord) => {
    const { id: _id, syncRecordId: _syncId, cloudUpdatedAt: _cloudAt,
      cloudSyncPending: _pending, expenseRetryOrigin: _origin, ...content } = record;
    // Match only empty server defaults. Keep payment method, provenance,
    // timestamps and unknown business fields exact; never import normalized data.
    return JSON.stringify(normalize({ paymentDate: '', category: '', description: '', vendor: '',
      amount: '', paymentMethod: '', target: '', memo: '', ...content }));
  };
  return comparable(a) === comparable(b);
}

function restorePage(): boolean {
  return /\/(?:device-sync|backups?)(?:\/|$)/.test(window.location?.pathname || '');
}

function assertContext(context: Context): void {
  const identity = getSupplySyncIdentity();
  const user = getStoredAuthUser();
  if (!identity || identity.farmId !== context.farmId || identity.ownerId !== context.ownerId ||
      user?.id !== context.userId || getAuthToken() !== context.token || restorePage()) {
    throw new Error('在庫に関連する記録の同期状態が変わりました。送信待ち記録を保持します。');
  }
}

/** Persist the latest source intent in the same transaction as its stock change. */
export function queueSupplyLinkedRecord(
  tx: IDBTransaction, store: LinkedStore, record: StoredRecord,
  movementIds: string[], deleted = false,
): void {
  try {
    const identity = getSupplySyncIdentity();
    if (!identity) return;
    const snapshot = structuredClone(record);
    const cloudId = cloudIdFor(store, snapshot);
    if (!cloudId.trim() || movementIds.some(id => typeof id !== 'string' || !id.trim())) {
      throw new Error('在庫に関連する記録の送信先を確認できません。');
    }
    const metadata = tx.objectStore('metadata');
    const entry: LinkedQueue = {
      id: queueId(store, cloudId), version: 1, operationId: crypto.randomUUID(), ...identity,
      store, sourceId: snapshot.id, cloudId, record: snapshot, movementIds: [], deleted,
    };
    let byId = staged.get(tx);
    if (!byId) { byId = new Map(); staged.set(tx, byId); }
    const previousStage = byId.get(entry.id);
    if (store === 'breedings') {
      entry.breedingSyncBase = previousStage?.latest.breedingSyncBase ?? initialBreedingQueueBase(snapshot);
      entry.breedingSyncAttempt = previousStage?.latest.breedingSyncAttempt ??
        structuredClone(snapshot.breedingSyncAttempt as BreedingSyncAttempt | undefined);
    }
    const stage = previousStage ?? { latest: entry, movementIds: new Set<string>(), loaded: false, hadQueue: false };
    stage.latest = entry;
    movementIds.forEach(id => stage.movementIds.add(id));
    byId.set(entry.id, stage);
    const write = () => {
      try {
        const current = getSupplySyncIdentity();
        if (current?.farmId !== identity.farmId || current.ownerId !== identity.ownerId) throw new Error('同期先が変わりました。');
        // Ordinary records with no stock dependency do not gain a new outbox.
        if (stage.movementIds.size === 0 && !stage.hadQueue) return;
        metadata.put({ ...stage.latest, movementIds: [...stage.movementIds] });
      } catch { tx.abort(); }
    };
    if (stage.loaded) { write(); return; }
    if (previousStage) return;
    const request = metadata.get(entry.id);
    request.onsuccess = () => {
      try {
        const old = request.result as LinkedQueue | undefined;
        if (old?.farmId === identity.farmId && old.ownerId === identity.ownerId) {
          if (!validQueue(old)) throw new Error('関連記録の送信待ち情報を確認できません。');
          old.movementIds.forEach(id => stage.movementIds.add(id));
          stage.hadQueue = true;
          if (store === 'breedings') {
            // A new stock edit may replace an attempt whose ACK was lost. Keep
            // that exact attempt and its original base until readback confirms it.
            stage.latest.breedingSyncBase = old.breedingSyncBase ?? initialBreedingQueueBase(old.record);
            stage.latest.breedingSyncAttempt = old.breedingSyncAttempt ??
              structuredClone(old.record.breedingSyncAttempt as BreedingSyncAttempt | undefined);
          }
        }
        stage.loaded = true;
        write();
      } catch { tx.abort(); }
    };
  } catch (error) {
    try { tx.abort(); } catch { /* The caller's transaction may already have aborted. */ }
    throw error;
  }
}

/** Read only the owned queue for this exact current source. The deletion marker
 * can differ after a lost DELETE ACK, while business fields, timestamps and
 * all other metadata must still match before its send history can be trusted.
 * The returned callback keeps that owner bound across asynchronous deletion
 * steps; it is never stored in the source or its queue. */
export async function getPendingBreedingDeleteState(record: StoredRecord): Promise<{
  breedingSyncBase?: BreedingSyncBase;
  breedingSyncAttempt?: BreedingSyncAttempt;
  assertCurrentContext: () => void;
}> {
  const identity = getSupplySyncIdentity();
  const user = getStoredAuthUser();
  const token = getAuthToken();
  if (!identity || !user?.id || !token) throw new Error('移植記録の同期元を確認できません。記録と関連経費を保持しています。');
  const context: Context = { ...identity, userId: user.id, token };
  const assertCurrentContext = () => assertContext(context);
  assertContext(context);
  const cloudId = cloudIdFor('breedings', record);
  const db = await openFarmProDatabase();
  assertContext(context);
  const comparable = (source: StoredRecord) => {
    const { breedingSyncDeletePending: _deleting, ...content } = source;
    return JSON.stringify(normalize(content));
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['metadata', 'breedings'], 'readonly');
    const queueRead = tx.objectStore('metadata').get(queueId('breedings', cloudId));
    const sourceRead = tx.objectStore('breedings').get(record.id);
    tx.oncomplete = () => {
      try {
        assertContext(context);
        const current = sourceRead.result as StoredRecord | undefined;
        if (!current || comparable(current) !== comparable(record)) throw new Error('確認中に移植記録が変更されました。削除を中止しました。');
        const queue = queueRead.result as LinkedQueue | undefined;
        if (!queue) { resolve({ assertCurrentContext }); return; }
        if (!validQueue(queue) || queue.store !== 'breedings' || queue.cloudId !== cloudId ||
            queue.sourceId !== record.id || queue.farmId !== context.farmId || queue.ownerId !== context.ownerId ||
            queue.deleted || comparable(queue.record) !== comparable(current)) {
          throw new Error('移植記録の送信待ち原本を確認できません。記録と関連経費を保持しています。');
        }
        const base = queue.breedingSyncBase ?? initialBreedingQueueBase(queue.record);
        const attempt = queue.breedingSyncAttempt ?? queue.record.breedingSyncAttempt as BreedingSyncAttempt | undefined;
        if (!validBreedingQueueState({ ...queue, breedingSyncBase: base, breedingSyncAttempt: attempt })) {
          throw new Error('移植記録の送信条件を確認できません。削除を中止しました。');
        }
        resolve({ ...structuredClone({ breedingSyncBase: base, breedingSyncAttempt: attempt }), assertCurrentContext });
      } catch (error) { reject(error); }
    };
    tx.onabort = () => reject(tx.error || new Error('移植記録の送信原本を読み取れませんでした。'));
  });
}

export async function hasPendingSupplyLinkedRecord(store: LinkedStore, cloudId: string): Promise<boolean> {
  const identity = getSupplySyncIdentity();
  if (!identity) return false;
  const db = await openFarmProDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('metadata', 'readonly');
    const request = tx.objectStore('metadata').get(queueId(store, String(cloudId)));
    tx.oncomplete = () => {
      try {
        const current = getSupplySyncIdentity();
        if (current?.farmId !== identity.farmId || current.ownerId !== identity.ownerId) throw new Error('同期先が変わりました。');
        const row = request.result as LinkedQueue | undefined;
        resolve(Boolean(row && row.farmId === identity.farmId && row.ownerId === identity.ownerId));
      } catch (error) { reject(error); }
    };
    tx.onabort = () => reject(tx.error || new Error('送信待ち記録を確認できません。'));
  });
}

function ready(view: View, queued: LinkedQueue, context: Context): boolean {
  const { queue, source, inventory, state } = view;
  if (!validQueue(queue) || queue.operationId !== queued.operationId ||
      queue.farmId !== context.farmId || queue.ownerId !== context.ownerId ||
      !state || state.version !== 1 || state.farmId !== context.farmId || state.ownerId !== context.ownerId ||
      typeof state.epoch !== 'string' || !Number.isSafeInteger(state.revision) || Number(state.revision) < 1 ||
      !Array.isArray(state.baseline) || !Array.isArray(state.pending) ||
      (queue.deleted ? Boolean(source) : !sameSource(source, queue.record))) return false;
  if (queue.store === 'breedings' && !queue.deleted &&
      (queue.record.breedingSyncDeletePending === true || source?.breedingSyncDeletePending === true)) return false;
  if (queue.store === 'breedings' && (
    JSON.stringify(normalize(queue.breedingSyncBase)) !== JSON.stringify(normalize(queued.breedingSyncBase)) ||
    JSON.stringify(normalize(queue.breedingSyncAttempt)) !== JSON.stringify(normalize(queued.breedingSyncAttempt))
  )) return false;
  if (!queue.deleted) {
    const linkedId = queue.record[queue.store === 'treatments' ? 'medicineInventoryMovementId' :
      queue.store === 'breedings' ? 'embryoInventoryMovementId' : 'sourceSupplyMovementId'];
    if (linkedId !== undefined && linkedId !== null && linkedId !== '') {
      if (typeof linkedId !== 'string' || !queue.movementIds.includes(linkedId) ||
          !inventory.some(row => row.id === linkedId) || !state.baseline.some(row => row.id === linkedId)) return false;
    }
  }
  return queue.movementIds.every(id => {
    if (state.pending.some(change => !change || change.before?.id === id || change.after?.id === id)) return false;
    const local = inventory.filter(row => row.id === id);
    const baseline = state.baseline.filter(row => row.id === id);
    return local.length <= 1 && baseline.length <= 1 && sameSupplyRecord(local[0], baseline[0]);
  });
}

function readView(tx: IDBTransaction, queued: LinkedQueue, done: (view: View) => void): void {
  const queue = tx.objectStore('metadata').get(queued.id);
  const source = tx.objectStore(queued.store).get(queued.sourceId);
  const inventory = tx.objectStore('supplyInventory').getAll();
  const state = tx.objectStore('metadata').get(SUPPLY_SYNC_STATE_ID);
  let pending = 4;
  const complete = () => {
    if (--pending === 0) done({ queue: queue.result, source: source.result, inventory: inventory.result, state: state.result });
  };
  queue.onsuccess = complete; source.onsuccess = complete;
  inventory.onsuccess = complete; state.onsuccess = complete;
}

async function checkReady(context: Context, queued: LinkedQueue): Promise<string | null> {
  assertContext(context);
  const db = await openFarmProDatabase();
  assertContext(context);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['metadata', 'supplyInventory', queued.store], 'readonly');
    let epoch: string | null = null;
    let failure: unknown;
    readView(tx, queued, view => {
      try { assertContext(context); if (ready(view, queued, context)) epoch = view.state!.epoch; }
      catch (error) { failure = error; tx.abort(); }
    });
    tx.oncomplete = () => resolve(epoch);
    tx.onabort = () => reject(failure || tx.error || new Error('関連記録の同期を確認できません。'));
  });
}

async function breedingRequest<T>(
  context: Context, path: string, init: RequestInit, read: (response: Response) => Promise<T>, allowMissing = false,
): Promise<T> {
  assertContext(context);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('移植記録の通信が時間切れになりました。送信待ち記録を保持します。'));
    }, 12000);
  });
  const work = async () => {
    const response = await fetch(path, { ...init, signal: controller.signal });
    assertContext(context);
    if (!response.ok && !(allowMissing && response.status === 404)) {
      throw new Error('移植記録の確認条件が一致しないか通信に失敗しました。記録と在庫の送信待ちを保持します。');
    }
    const result = await read(response);
    assertContext(context);
    return result;
  };
  try { return await Promise.race([work(), timeout]); }
  finally { clearTimeout(timer!); }
}

async function stageBreedingAttempt(
  context: Context, queued: LinkedQueue, epoch: string, base: BreedingSyncBase, attempt?: BreedingSyncAttempt,
): Promise<LinkedQueue> {
  assertContext(context);
  const db = await openFarmProDatabase();
  assertContext(context);
  const next = { ...queued, breedingSyncBase: base, breedingSyncAttempt: attempt };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['metadata', 'supplyInventory', queued.store], 'readwrite');
    let accepted = false;
    let failure: unknown;
    readView(tx, queued, view => {
      try {
        assertContext(context);
        if (!ready(view, queued, context) || view.state?.epoch !== epoch) return;
        tx.objectStore('metadata').put(next);
        accepted = true;
      } catch (error) { failure = error; tx.abort(); }
    });
    tx.oncomplete = () => {
      try {
        assertContext(context);
        if (!accepted) throw new Error('確認中に移植記録または在庫が変わりました。送信待ちを保持します。');
        resolve(next);
      } catch (error) { reject(error); }
    };
    tx.onabort = () => reject(failure || tx.error || new Error('移植記録の送信原本を保持できませんでした。'));
  });
}

async function sendBreeding(
  context: Context, queued: LinkedQueue, epoch: string,
): Promise<{ queue: LinkedQueue; cloudUpdatedAt?: string }> {
  const path = `/api/breedings/record-sync/${encodeURIComponent(queued.cloudId)}`;
  const remote = await breedingRequest(context, path, {
    headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store',
  }, async response => {
    if (response.status === 404) return null;
    const result = await response.json() as CloudBreedingRecord;
    if (!result || String(result.id ?? '') !== queued.cloudId || !validBreedingRevision(result.cloudUpdatedAt)) {
      throw new Error('移植記録の同期原本を確認できません。');
    }
    return result;
  }, true);
  if (await checkReady(context, queued) !== epoch) {
    throw new Error('確認中に移植記録または在庫が変わりました。送信待ちを保持します。');
  }
  if (remote?.deletedAt) {
    if (queued.deleted) return { queue: queued, cloudUpdatedAt: remote.cloudUpdatedAt };
    throw new Error('この移植記録は削除済みです。記録と在庫の送信待ちを保持します。');
  }
  const wire = toCloudBreeding(queued.record);
  if (remote && sameBreedingContent(remote, wire) && !queued.deleted) {
    // An identical attempt may already have committed before its ACK was lost.
    return { queue: queued, cloudUpdatedAt: remote.cloudUpdatedAt };
  }
  const base = queued.breedingSyncBase ?? initialBreedingQueueBase(queued.record);
  const attempt = queued.breedingSyncAttempt ?? queued.record.breedingSyncAttempt as BreedingSyncAttempt | undefined;
  if (remote) {
    const revision = base.cloudUpdatedAt ?? base.record?.cloudUpdatedAt;
    const knownRevision = validBreedingRevision(revision) && revision === remote.cloudUpdatedAt;
    const sameBase = base.record && sameBreedingContent(base.record, remote);
    const ownAttempt = attempt?.version === 1 && sameBreedingContent(attempt.record, remote);
    const sameSourceToDelete = queued.deleted && sameBreedingContent(wire, remote);
    if (!knownRevision && !sameBase && !ownAttempt && !sameSourceToDelete) {
      throw new Error('別の端末で移植記録が変更されています。記録と在庫の送信待ちを保持します。');
    }
  } else if (!queued.deleted && (base.record !== null || base.cloudUpdatedAt !== undefined)) {
    throw new Error('確認済みの移植記録がクラウドにありません。送信待ちを保持します。');
  }

  // Persist the confirmed readback before replacing an unacknowledged attempt.
  // B ACK lost -> C edited -> C failed must still retain B as the safe base.
  const stagedQueue = await stageBreedingAttempt(context, queued, epoch,
    { version: 1, record: remote, ...(remote ? { cloudUpdatedAt: remote.cloudUpdatedAt } : {}) },
    queued.deleted ? attempt : { version: 1, record: wire });
  if (await checkReady(context, stagedQueue) !== epoch) throw new Error('移植記録の送信待ち情報が変わりました。');
  const conditions = breedingConditionHeaders(remote?.cloudUpdatedAt);
  if (queued.deleted) {
    await breedingRequest(context, `/api/breedings/${encodeURIComponent(queued.cloudId)}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${context.token}`, ...conditions },
    }, async () => undefined);
    return { queue: stagedQueue };
  }
  const synced = await breedingRequest(context, path, {
    method: 'PUT', headers: { Authorization: `Bearer ${context.token}`, 'Content-Type': 'application/json', ...conditions },
    body: JSON.stringify(wire),
  }, async response => {
    const result = await response.json() as CloudBreedingRecord;
    if (!result || String(result.id ?? '') !== queued.cloudId || !validBreedingRevision(result.cloudUpdatedAt) ||
        result.deletedAt || !sameBreedingContent(result, wire)) {
      throw new Error('移植記録の保存内容が一致しません。送信待ち記録を保持します。');
    }
    return result;
  });
  return { queue: stagedQueue, cloudUpdatedAt: synced.cloudUpdatedAt };
}

async function send(context: Context, queued: LinkedQueue, createOnly = false): Promise<string | undefined> {
  assertContext(context);
  if (queued.store === 'breedings' && !queued.deleted && queued.record.breedingSyncDeletePending === true) {
    throw new Error('削除を確認中の繁殖記録は再送できません。端末の記録を保持しています。');
  }
  const path = queued.deleted && queued.store === 'breedings'
    ? `/api/breedings/${encodeURIComponent(queued.cloudId)}`
    : `/api/${queued.store}/record-sync/${encodeURIComponent(queued.cloudId)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  // Existing record-sync stores merge omitted fields with the previous record.
  // Explicit null clears a cancelled inventory link; JSON would drop undefined.
  const stockLink = queued.store === 'treatments' ? {
    medicineInventoryMovementId: queued.record.medicineInventoryMovementId ?? null,
    medicineInventoryBatchKey: queued.record.medicineInventoryBatchKey ?? null,
    medicineInventoryQuantity: queued.record.medicineInventoryQuantity ?? null,
  } : queued.store === 'breedings' ? {
    embryoInventoryMovementId: queued.record.embryoInventoryMovementId ?? null,
    embryoInventoryBatchKey: queued.record.embryoInventoryBatchKey ?? null,
  } : {};
  try {
    const response = await fetch(path, {
      method: queued.deleted ? 'DELETE' : 'PUT', signal: controller.signal,
      headers: { Authorization: `Bearer ${context.token}`, ...(!queued.deleted ? { 'Content-Type': 'application/json' } : {}),
        ...(createOnly ? { 'If-None-Match': '*' } : {}) },
      ...(!queued.deleted ? { body: JSON.stringify({ ...queued.record, ...stockLink, id: queued.cloudId,
        ...(queued.store !== 'breedings' ? { syncRecordId: queued.cloudId } : {}) }) } : {}),
    });
    assertContext(context);
    // Breeding deletion is already absent after a successful request whose response was lost.
    if (!response.ok && !(queued.deleted && queued.store === 'breedings' && response.status === 404)) {
      throw new Error('関連記録のクラウド同期を完了できませんでした。');
    }
    if (queued.deleted) return;
    const result = await response.json() as StoredRecord;
    assertContext(context);
    if (!result || String(result.id ?? '') !== queued.cloudId || typeof result.cloudUpdatedAt !== 'string' ||
        Number.isNaN(Date.parse(result.cloudUpdatedAt))) throw new Error('関連記録の保存結果を確認できません。');
    if (queued.store === 'treatments' && result.deletedAt) {
      throw new Error('治療記録はクラウドで削除済みです。端末の治療と在庫を保持して同期を保留しました。');
    }
    if (createOnly && (result.deletedAt || result.settlementSaleId || !sameInitialExpense(queued.record, result))) {
      throw new Error('購入経費の保存内容が一致しません。送信待ち記録を保持します。');
    }
    return result.cloudUpdatedAt;
  } finally { clearTimeout(timeout); }
}

/** Initial stock-purchase expenses use create-only delivery and verify an
 * identical stored result before acknowledging a request whose ACK was lost. */
async function sendInitialExpense(context: Context, queued: LinkedQueue, epoch: string): Promise<string | undefined> {
  assertContext(context);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let records: StoredRecord[];
  try {
    const response = await fetch('/api/expenses/record-sync', {
      headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store', signal: controller.signal,
    });
    assertContext(context);
    if (!response.ok) throw new Error('購入経費のクラウド確認を完了できませんでした。');
    const result = await response.json() as unknown;
    assertContext(context);
    if (!Array.isArray(result) || result.some(record => !record || typeof record !== 'object' ||
        typeof record.id !== 'string' || !record.id.trim())) {
      throw new Error('購入経費の取得結果を確認できません。');
    }
    records = result as StoredRecord[];
  } finally { clearTimeout(timeout); }

  const matches = records.filter(record => record.id === queued.cloudId);
  const existing = matches[0];
  if (matches.length > 1 || (existing && (existing.deletedAt || existing.settlementSaleId ||
      !sameInitialExpense(queued.record, existing) || typeof existing.cloudUpdatedAt !== 'string' ||
      Number.isNaN(Date.parse(existing.cloudUpdatedAt))))) {
    throw new Error('クラウドの購入経費に未確認の違いがあります。端末の記録を保持して同期を保留しました。');
  }
  // A local edit/deletion, new stock operation or restore during GET must not
  // authorize sending the previously captured expense or acknowledging it.
  if (await checkReady(context, queued) !== epoch) {
    throw new Error('確認中に購入経費または在庫が変わりました。送信待ち記録を保持します。');
  }
  assertContext(context);
  if (existing) return existing.cloudUpdatedAt as string;
  // A 412 remains pending. Never retry it as an unconditional replacement.
  return send(context, queued, true);
}

async function acknowledge(context: Context, queued: LinkedQueue, epoch: string, cloudUpdatedAt?: string): Promise<boolean> {
  assertContext(context);
  const db = await openFarmProDatabase();
  assertContext(context);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['metadata', 'supplyInventory', queued.store], 'readwrite');
    let accepted = false;
    let failure: unknown;
    readView(tx, queued, view => {
      try {
        assertContext(context);
        if (!ready(view, queued, context) || view.state?.epoch !== epoch) return;
        if (!queued.deleted) {
          // Preserve every business field, including a stable local ID. Do not apply server normalization here.
          const source = { ...view.source! };
          if (queued.store === 'breedings') {
            delete source.breedingSyncBase;
            delete source.breedingSyncAttempt;
          }
          tx.objectStore(queued.store).put({ ...source, cloudSyncPending: false, cloudUpdatedAt });
        }
        tx.objectStore('metadata').delete(queued.id);
        accepted = true;
      } catch (error) { failure = error; tx.abort(); }
    });
    tx.oncomplete = () => resolve(accepted);
    tx.onabort = () => reject(failure || tx.error || new Error('関連記録の送信結果を保存できません。'));
  });
}

export async function retrySupplyLinkedRecords(): Promise<boolean> {
  if (restorePage()) return false;
  const identity = getSupplySyncIdentity();
  const user = getStoredAuthUser();
  const token = getAuthToken();
  if (!identity || !user?.id || !token) return false;
  const context: Context = { ...identity, userId: user.id, token };
  const key = `${context.farmId}:${context.ownerId}`;
  const active = running.get(key);
  if (active) return active;
  const work = async () => {
    try {
      assertContext(context);
      const db = await openFarmProDatabase();
      assertContext(context);
      const entries = await new Promise<StoredRecord[]>((resolve, reject) => {
        const tx = db.transaction('metadata', 'readonly');
        const request = tx.objectStore('metadata').getAll();
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error || new Error('送信待ち記録を読み込めません。'));
      });
      let complete = true;
      for (const entry of entries) {
        if (!String(entry.id).startsWith(PREFIX) || entry.farmId !== context.farmId || entry.ownerId !== context.ownerId) continue;
        if (!validQueue(entry)) { complete = false; continue; }
        try {
          const epoch = await checkReady(context, entry);
          if (epoch === null) { complete = false; continue; }
          const delivery = entry.store === 'breedings' ? await sendBreeding(context, entry, epoch) : {
            queue: entry,
            cloudUpdatedAt: entry.store === 'expenses' && !entry.deleted && !entry.record.cloudUpdatedAt
              ? await sendInitialExpense(context, entry, epoch) : await send(context, entry),
          };
          if (!await acknowledge(context, delivery.queue, epoch, delivery.cloudUpdatedAt)) complete = false;
        } catch { complete = false; }
      }
      assertContext(context);
      // A source saved during another source's request must not be reported as delivered.
      const remaining = await new Promise<StoredRecord[]>((resolve, reject) => {
        const tx = db.transaction('metadata', 'readonly');
        const request = tx.objectStore('metadata').getAll();
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error || new Error('送信待ち記録を確認できません。'));
      });
      assertContext(context);
      return complete && !remaining.some(entry => String(entry.id).startsWith(PREFIX) &&
        entry.farmId === context.farmId && entry.ownerId === context.ownerId);
    } catch { return false; }
  };
  const promise = work();
  running.set(key, promise);
  try { return await promise; }
  finally { if (running.get(key) === promise) running.delete(key); }
}
