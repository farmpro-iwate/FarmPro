import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { openFarmProDatabase } from '../storage/db';
import { parseFarmProBackupJson } from '../storage/backup-import';
import type { FarmProBackup } from '../storage/backup';
import type { StoredRecord } from '../storage/types';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { CloudSnapshotConflictError } from './cloudClient';
import { hasLocalChangePending } from './deviceSync';
import type { SupplyMovement } from './supplyInventoryApi';
import { withSupplyInventorySyncLock } from './supplyInventorySyncLock';
import { retrySupplyLinkedRecords } from './supplyInventoryLinkedSync';
import {
  SUPPLY_SYNC_STATE_ID, applySupplyChanges, getSupplySyncIdentity,
  mergeSupplyChanges, sameSupplyRecord, sameSupplyRows, validateSupplyRows,
  type SupplyInventorySyncState,
} from './supplyInventorySyncState';

export const SUPPLY_INVENTORY_SYNC_STATUS_EVENT = 'farmpro:supply-inventory-sync-status';
type SyncStatus = { state: 'idle' | 'synced' | 'pending' | 'conflict'; message: string };
type SyncContext = { farmId: string; ownerId: string; userId: string; token: string };
type LocalView = { rows: SupplyMovement[]; state: SupplyInventorySyncState | undefined };
type RemoteView = { revision: number; savedAt: string; snapshot: FarmProBackup };
type SyncOnceResult = boolean | 'initial-received';
const statuses = new Map<string, SyncStatus>();
const running = new Map<string, Promise<void>>();
const idle: SyncStatus = { state: 'idle', message: '' };

class InventoryConflict extends Error {}

function isRestorePage(): boolean {
  return /\/(?:device-sync|backups?)(?:\/|$)/.test(window.location?.pathname || '');
}

function assertContext(context: SyncContext): void {
  const user = getStoredAuthUser();
  if (user?.farmId !== context.farmId || user.id !== context.userId || getAuthToken() !== context.token ||
      !getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync || isRestorePage() ||
      getSupplySyncIdentity()?.ownerId !== context.ownerId) {
    throw new InventoryConflict('画面またはログイン状態が変わったため、在庫の同期を保留しました。');
  }
}

function setStatus(context: SyncContext, status: SyncStatus): void {
  statuses.set(context.farmId, status);
  if (getStoredAuthUser()?.farmId === context.farmId) {
    window.dispatchEvent(new Event(SUPPLY_INVENTORY_SYNC_STATUS_EVENT));
  }
}

export function getSupplyInventorySyncStatus(): SyncStatus {
  return statuses.get(getStoredAuthUser()?.farmId || '') || idle;
}

// Capture credentials for this operation. A late 401 must not clear a newer login.
async function requestCloud<T>(context: SyncContext, body?: FarmProBackup, revision?: number): Promise<T> {
  assertContext(context);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch('/api/cloud-snapshots/latest', {
      method: body ? 'PUT' : 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${context.token}`,
        ...(body ? { 'Content-Type': 'application/json', 'X-FarmPro-Cloud-Revision': String(revision) } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    assertContext(context);
    if (!response.ok) {
      if (response.status === 409) throw new CloudSnapshotConflictError('別の端末でクラウドが更新されました。');
      if (response.status === 401) throw new Error('再ログイン後に在庫の同期を再開します。');
      throw new Error(`在庫のクラウド通信を完了できませんでした（${response.status}）。`);
    }
    const result = await response.json() as T;
    assertContext(context);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

async function readLocal(context: SyncContext): Promise<LocalView> {
  assertContext(context);
  const db = await openFarmProDatabase();
  assertContext(context);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['supplyInventory', 'metadata'], 'readonly');
    const rows = tx.objectStore('supplyInventory').getAll();
    const state = tx.objectStore('metadata').get(SUPPLY_SYNC_STATE_ID);
    tx.oncomplete = () => {
      try {
        assertContext(context);
        resolve({ rows: rows.result, state: state.result });
      } catch (error) { reject(error); }
    };
    tx.onabort = () => reject(tx.error || new Error('在庫の同期状態を読み込めませんでした。'));
  });
}

function belongsToDevice(state: SupplyInventorySyncState | undefined, context: SyncContext): state is SupplyInventorySyncState {
  return state?.version === 1 && state.farmId === context.farmId && state.ownerId === context.ownerId &&
    typeof state.epoch === 'string' && Array.isArray(state.baseline) && Array.isArray(state.pending);
}

function newState(context: SyncContext, rows: SupplyMovement[], revision: number): SupplyInventorySyncState {
  return {
    id: SUPPLY_SYNC_STATE_ID, version: 1, farmId: context.farmId, ownerId: context.ownerId,
    epoch: crypto.randomUUID(), revision, baseline: rows, pending: [],
  };
}

// A new browser/PWA can have no inventory or only unchanged cloud records.
// Enrol it by adding missing inventory, without restoring any other store or
// sending anything. Existing state and every retained pending-change marker
// remain authoritative; none may be cleared to make this path eligible.
async function receiveInitialInventory(
  context: SyncContext, observed: LocalView, received: SupplyMovement[], revision: number,
): Promise<void> {
  assertContext(context);
  const db = await openFarmProDatabase();
  assertContext(context);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['supplyInventory', 'metadata', 'treatments', 'breedings', 'expenses'], 'readwrite');
    const inventory = tx.objectStore('supplyInventory');
    const metadata = tx.objectStore('metadata');
    const requests = [
      inventory.getAll(), metadata.getAll(),
      tx.objectStore('treatments').getAll(), tx.objectStore('breedings').getAll(),
      tx.objectStore('expenses').getAll(),
    ];
    let pending = requests.length;
    let failure: unknown;
    const apply = () => {
      if (--pending !== 0) return;
      try {
        assertContext(context);
        const rows = requests[0].result as SupplyMovement[];
        const metadataRows = requests[1].result as StoredRecord[];
        const sourcePending = requests.slice(2).some(request =>
          (request.result as StoredRecord[]).some(record => record.cloudSyncPending === true));
        if (observed.state !== undefined || metadataRows.some(record => record.id === SUPPLY_SYNC_STATE_ID) ||
            !sameSupplyRows(rows, observed.rows)) {
          throw new InventoryConflict('確認中に端末の在庫が変更されました。記録を残して再確認します。');
        }
        if (hasLocalChangePending() || sourcePending || metadataRows.some(record =>
          typeof record.id === 'string' && record.id.startsWith('supply-linked-sync:'))) {
          throw new InventoryConflict('この端末に未送信の変更があるため、在庫の初回受信を保留しました。記録は保持しています。');
        }
        validateSupplyRows(received);
        const remoteById = new Map(received.map(record => [record.id, record]));
        if (rows.some(record => !sameSupplyRecord(record, remoteById.get(record.id)))) {
          throw new InventoryConflict('端末とクラウドの在庫に未確認の違いがあります。記録を保持し、同期を保留しました。');
        }
        const localIds = new Set(rows.map(record => record.id));
        for (const record of received) if (!localIds.has(record.id)) inventory.add(record);
        metadata.add(newState(context, received, revision));
      } catch (error) { failure = error; tx.abort(); }
    };
    for (const request of requests) request.onsuccess = apply;
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure || tx.error || new Error('在庫の初回受信を取り消しました。元の記録は保持しています。'));
  });
}

async function initialReceiveHasPendingWork(context: SyncContext): Promise<boolean> {
  assertContext(context);
  const db = await openFarmProDatabase();
  assertContext(context);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('metadata', 'readonly');
    const request = tx.objectStore('metadata').getAll();
    tx.oncomplete = () => {
      try {
        assertContext(context);
        const rows = request.result as StoredRecord[];
        const state = rows.find(record => record.id === SUPPLY_SYNC_STATE_ID) as SupplyInventorySyncState | undefined;
        resolve(!belongsToDevice(state, context) || state.pending.length > 0 || hasLocalChangePending() ||
          rows.some(record => typeof record.id === 'string' && record.id.startsWith('supply-linked-sync:')));
      } catch (error) { reject(error); }
    };
    tx.onabort = () => reject(tx.error || new Error('在庫の送信待ちを確認できませんでした。'));
  });
}

function assertUnchangedBase(current: SupplyInventorySyncState | undefined, sent: SupplyInventorySyncState): asserts current is SupplyInventorySyncState {
  if (!current || current.epoch !== sent.epoch || current.farmId !== sent.farmId || current.ownerId !== sent.ownerId ||
      current.revision !== sent.revision || !sameSupplyRows(current.baseline, sent.baseline) ||
      current.pending.length < sent.pending.length || sent.pending.some((operation, index) => {
        const next = current.pending[index];
        return next.operationId !== operation.operationId ||
          !sameSupplyRecord(next.before, operation.before) || !sameSupplyRecord(next.after, operation.after);
      })) {
    throw new InventoryConflict('同期中に在庫の確認基準が変わりました。記録を残して再確認します。');
  }
}

// Apply only inventory row differences. Never call backup restore or clear a store.
// Re-read both stores in this transaction so a save during network I/O survives.
async function acknowledge(
  context: SyncContext, observed: LocalView, received: SupplyMovement[], revision: number,
  sent?: SupplyInventorySyncState,
): Promise<boolean> {
  assertContext(context);
  const db = await openFarmProDatabase();
  assertContext(context);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['supplyInventory', 'metadata'], 'readwrite');
    const inventory = tx.objectStore('supplyInventory');
    const metadata = tx.objectStore('metadata');
    const rowsRequest = inventory.getAll();
    const stateRequest = metadata.get(SUPPLY_SYNC_STATE_ID);
    let remaining = false;
    let failure: unknown;
    let ready = 0;
    const apply = () => {
      if (++ready !== 2) return;
      try {
        assertContext(context);
        const rows = rowsRequest.result as SupplyMovement[];
        const current = stateRequest.result as SupplyInventorySyncState | undefined;
        let nextState: SupplyInventorySyncState;
        let nextRows: SupplyMovement[];
        if (sent) {
          assertUnchangedBase(current, sent);
          if (!sameSupplyRows(rows, applySupplyChanges(current.baseline, current.pending))) {
            throw new InventoryConflict('端末の在庫が同期の変更記録と一致しません。上書きせず確認を待ちます。');
          }
          const pending = current.pending.slice(sent.pending.length);
          const expected = new Map(received.map(row => [row.id, row]));
          for (const operation of pending) {
            const id = (operation.before || operation.after)!.id;
            if (!sameSupplyRecord(expected.get(id), operation.before)) {
              throw new InventoryConflict('同期中に同じ在庫が変更されました。端末の変更記録を残して照合を待ちます。');
            }
            if (operation.after) expected.set(id, operation.after);
            else expected.delete(id);
          }
          nextRows = applySupplyChanges(received, pending);
          nextState = { ...current, revision, baseline: received, pending };
          remaining = pending.length > 0;
        } else {
          if (!sameSupplyRows(rows, observed.rows) || JSON.stringify(current) !== JSON.stringify(observed.state)) {
            throw new InventoryConflict('確認中に端末の在庫が変更されました。記録を残して再確認します。');
          }
          nextRows = received;
          nextState = newState(context, received, revision);
        }
        validateSupplyRows(nextRows);
        const nextById = new Map(nextRows.map(row => [row.id, row]));
        const currentById = new Map(rows.map(row => [row.id, row]));
        for (const row of rows) if (!nextById.has(row.id)) inventory.delete(row.id);
        for (const row of nextRows) {
          if (!sameSupplyRecord(row, currentById.get(row.id) || null)) inventory.put(row);
        }
        metadata.put(nextState);
      } catch (error) { failure = error; tx.abort(); }
    };
    rowsRequest.onsuccess = apply;
    stateRequest.onsuccess = apply;
    tx.oncomplete = () => resolve(remaining);
    tx.onabort = () => reject(failure || tx.error || new Error('在庫の受信を取り消しました。元の記録は保持しています。'));
  });
}

async function syncOnce(context: SyncContext): Promise<SyncOnceResult> {
  const remote = await requestCloud<RemoteView | null>(context);
  if (!remote) throw new InventoryConflict('クラウドに在庫の確認基準がありません。端末の記録を保持しています。');
  const backup = parseFarmProBackupJson(JSON.stringify(remote.snapshot));
  if (![4, 5].includes(backup.schemaVersion) || backup.farm?.id !== context.farmId ||
      !Number.isInteger(remote.revision) || remote.revision < 1) {
    throw new InventoryConflict('農場またはクラウドの形式が一致しないため、在庫の同期を保留しました。');
  }
  const cloudRows = backup.stores.supplyInventory as SupplyMovement[];
  const observed = await readLocal(context);
  const state = observed.state;
  if (!belongsToDevice(state, context)) {
    // Missing records alone may be received by a genuinely uninitialised browser.
    // A changed/local-only record, existing state or pending work still blocks it.
    if (state === undefined && !sameSupplyRows(observed.rows, cloudRows)) {
      await receiveInitialInventory(context, observed, cloudRows, remote.revision);
      return 'initial-received';
    }
    // Never reinterpret state copied from another device as a new empty browser.
    if (!sameSupplyRows(observed.rows, cloudRows)) {
      throw new InventoryConflict('端末とクラウドの在庫に未確認の違いがあります。記録を保持し、同期を保留しました。');
    }
    validateSupplyRows(cloudRows);
    return acknowledge(context, observed, cloudRows, remote.revision);
  }
  if (state.revision !== null && (remote.revision < state.revision ||
      (remote.revision === state.revision && !sameSupplyRows(state.baseline, cloudRows)))) {
    throw new InventoryConflict('クラウドの世代または在庫の確認基準が変わったため、同期を保留しました。');
  }
  let candidate: SupplyMovement[];
  try { candidate = mergeSupplyChanges(state, observed.rows, cloudRows); }
  catch (error) { throw new InventoryConflict(error instanceof Error ? error.message : '在庫の変更が競合しています。'); }
  let revision = remote.revision;
  if (!sameSupplyRows(candidate, cloudRows)) {
    // Check that a restore/account change did not replace the outbox while computing.
    const current = await readLocal(context);
    assertUnchangedBase(current.state, state);
    const result = await requestCloud<{ revision: number }>(context, {
      ...remote.snapshot,
      exportedAt: new Date().toISOString(),
      // Parsing supplies missing new stores for local readers. An inventory-only
      // write must retain the cloud's original schema and other store keys.
      stores: { ...remote.snapshot.stores, supplyInventory: candidate },
    }, remote.revision);
    if (result.revision !== remote.revision + 1) {
      throw new Error('クラウドの保存結果を確認できませんでした。変更記録を保持して再確認します。');
    }
    revision = result.revision;
  }
  return acknowledge(context, observed, candidate, revision, state);
}

export async function syncSupplyInventory(): Promise<void> {
  if (isRestorePage() || !getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync) return;
  const identity = getSupplySyncIdentity();
  const token = getAuthToken();
  const user = getStoredAuthUser();
  if (!identity || !token || !user) return;
  const context: SyncContext = { ...identity, userId: user.id, token };
  const key = `${identity.farmId}:${identity.ownerId}`;
  const active = running.get(key);
  if (active) return active;
  const work = async () => {
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const remaining = await syncOnce(context);
          if (remaining === 'initial-received') {
            // Initial receipt is GET-only, including associated record-sync APIs.
            const pending = await initialReceiveHasPendingWork(context);
            setStatus(context, pending ? {
              state: 'pending', message: '在庫を受信しました。新しい端末の変更を保持し、次の確認で同期を続けます。',
            } : { state: 'synced', message: '' });
            return;
          }
          if (!remaining) {
            const linkedComplete = await retrySupplyLinkedRecords();
            assertContext(context);
            const latest = await readLocal(context);
            if (belongsToDevice(latest.state, context) && latest.state.pending.length > 0) continue;
            if (!linkedComplete) {
              setStatus(context, { state: 'pending', message: '在庫の同期は確認できました。関連する治療・ET・購入経費に送信待ちがあるため、次の確認で再送します。' });
              return;
            }
            setStatus(context, { state: 'synced', message: '' });
            return;
          }
        } catch (error) {
          // A fresh GET is mandatory after a revision conflict; never just change the header.
          if (!(error instanceof CloudSnapshotConflictError) || attempt === 2) throw error;
        }
      }
      setStatus(context, { state: 'pending', message: '新しい在庫変更を端末に保存しました。次の確認で同期を続けます。' });
    } catch (error) {
      setStatus(context, {
        state: error instanceof InventoryConflict || error instanceof CloudSnapshotConflictError ? 'conflict' : 'pending',
        message: error instanceof InventoryConflict ? error.message :
          '在庫は端末に保持しています。同期が完了していないため、通信が戻ったらこの画面で再確認します。',
      });
      throw error;
    }
  };
  const promise = withSupplyInventorySyncLock(work);
  running.set(key, promise);
  try { await promise; }
  finally { if (running.get(key) === promise) running.delete(key); }
}

export async function syncSupplyInventorySafely(): Promise<boolean> {
  try {
    await syncSupplyInventory();
    return !['pending', 'conflict'].includes(getSupplyInventorySyncStatus().state);
  }
  catch { return false; }
}
