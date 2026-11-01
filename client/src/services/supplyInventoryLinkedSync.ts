import { openFarmProDatabase } from '../storage/db';
import type { StoredRecord } from '../storage/types';
import { getAuthToken, getStoredAuthUser } from './authClient';
import {
  getSupplySyncIdentity, sameSupplyRecord, SUPPLY_SYNC_STATE_ID,
  type SupplyInventorySyncState,
} from './supplyInventorySyncState';
import type { SupplyMovement } from './supplyInventoryApi';

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
    typeof row.deleted === 'boolean';
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

async function send(context: Context, queued: LinkedQueue): Promise<string | undefined> {
  assertContext(context);
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
      headers: { Authorization: `Bearer ${context.token}`, ...(!queued.deleted ? { 'Content-Type': 'application/json' } : {}) },
      ...(!queued.deleted ? { body: JSON.stringify({ ...queued.record, ...stockLink, id: queued.cloudId,
        ...(queued.store !== 'breedings' ? { syncRecordId: queued.cloudId } : {}) }) } : {}),
    });
    assertContext(context);
    // Breeding deletion is already absent after a successful request whose response was lost.
    if (!response.ok && !(queued.deleted && queued.store === 'breedings' && response.status === 404)) {
      throw new Error('関連記録のクラウド同期を完了できませんでした。');
    }
    if (queued.deleted) return;
    const result = await response.json() as { id?: unknown; cloudUpdatedAt?: unknown };
    assertContext(context);
    if (String(result.id ?? '') !== queued.cloudId || typeof result.cloudUpdatedAt !== 'string' ||
        Number.isNaN(Date.parse(result.cloudUpdatedAt))) throw new Error('関連記録の保存結果を確認できません。');
    return result.cloudUpdatedAt;
  } finally { clearTimeout(timeout); }
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
          tx.objectStore(queued.store).put({ ...view.source!, cloudSyncPending: false, cloudUpdatedAt });
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
          const updatedAt = await send(context, entry);
          if (!await acknowledge(context, entry, epoch, updatedAt)) complete = false;
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
