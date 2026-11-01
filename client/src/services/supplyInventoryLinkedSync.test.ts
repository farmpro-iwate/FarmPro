import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import type { StoredRecord } from '../storage/types';
import type { SupplyMovement } from './supplyInventoryApi';
import { getSupplySyncIdentity, SUPPLY_SYNC_STATE_ID, type SupplyInventorySyncState } from './supplyInventorySyncState';
import { hasPendingSupplyLinkedRecord, queueSupplyLinkedRecord, retrySupplyLinkedRecords } from './supplyInventoryLinkedSync';

const environment = vi.hoisted(() => ({
  database: null as IDBDatabase | null, plan: 'standard', farmId: 'linked-test-farm',
  userId: 'linked-test-user', token: 'test-token',
}));
vi.mock('../storage/db', () => ({ openFarmProDatabase: async () => environment.database! }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => environment.plan }));
vi.mock('./authClient', () => ({
  getStoredAuthUser: () => ({ farmId: environment.farmId, id: environment.userId }),
  getAuthToken: () => environment.token,
}));

type SourceStore = 'treatments' | 'breedings' | 'expenses';
const stores = ['metadata', 'supplyInventory', 'treatments', 'breedings', 'expenses'];
const queueKey = (store: SourceStore, cloudId: string) => `supply-linked-sync:${store}:${encodeURIComponent(cloudId)}`;

function stock(id = 'stock-1'): SupplyMovement {
  return {
    id, kind: '医薬品', action: '購入', date: '2026-11-01', itemName: '試験薬', lotNumber: 'TEST-LOT',
    quantity: 2, unit: '本', expiryDate: '', supplier: '試験仕入先', storageLocation: '試験薬品庫',
    donorCow: '', sire: '', grade: '', cowEarTag: '', unitPrice: 100, amount: 200,
    paymentMethod: '現金', note: '', expenseRecorded: false,
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

function source(store: SourceStore = 'treatments', note = 'saved locally'): StoredRecord {
  return {
    id: store === 'treatments' ? 101 : `${store}-test`, note, cloudSyncPending: true,
    ...(store === 'breedings' ? { cloudRecordId: 'breeding-cloud-test' } : {
      syncRecordId: store === 'treatments' ? 'treatment:101' : 'expense:expenses-test',
    }),
    createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:01:00.000Z',
  };
}

function cloudId(store: SourceStore, row = source(store)): string {
  return String(store === 'breedings' ? row.cloudRecordId ?? row.id : row.syncRecordId);
}

async function transact(work: (tx: IDBTransaction) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = environment.database!.transaction(stores, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
    try { work(tx); } catch (error) { tx.abort(); reject(error); }
  });
}

async function read<T = StoredRecord>(store: string, id: string | number): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = environment.database!.transaction(store).objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readyStock(rows: SupplyMovement[] = [stock()], changes: Partial<SupplyInventorySyncState> = {}) {
  const identity = getSupplySyncIdentity()!;
  const state: SupplyInventorySyncState = {
    id: SUPPLY_SYNC_STATE_ID, version: 1, ...identity, epoch: 'linked-test-epoch', revision: 35,
    baseline: rows, pending: [], ...changes,
  };
  await transact(tx => {
    tx.objectStore('supplyInventory').clear();
    rows.forEach(row => tx.objectStore('supplyInventory').put(row));
    tx.objectStore('metadata').put(state);
  });
  return state;
}

async function saveQueued(store: SourceStore, row: StoredRecord, movementIds = ['stock-1'], deleted = false) {
  await transact(tx => {
    if (deleted) tx.objectStore(store).delete(row.id);
    else tx.objectStore(store).put(row);
    queueSupplyLinkedRecord(tx, store, row, movementIds, deleted);
  });
}

function success(id: string, extras: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ id, cloudUpdatedAt: '2026-11-01T00:02:00.000Z', ...extras }), { status: 200 });
}

beforeEach(async () => {
  localStorage.clear();
  environment.plan = 'standard'; environment.farmId = 'linked-test-farm';
  environment.userId = 'linked-test-user'; environment.token = 'test-token';
  window.history.replaceState(null, '', '/supply-inventory');
  environment.database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = new IDBFactory().open('linked-inventory-test', 1);
    request.onupgradeneeded = () => stores.forEach(name => request.result.createObjectStore(name, { keyPath: 'id' }));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => {
  environment.database?.close();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('durable source intents', () => {
  it('rolls back stock and source together if saving their linked queue fails', async () => {
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'metadata' && String(value.id).startsWith('supply-linked-sync:')) throw new DOMException('queue failure', 'DataCloneError');
      return put.call(this, value, key);
    });
    await expect(transact(tx => {
      tx.objectStore('supplyInventory').put(stock());
      tx.objectStore('treatments').put(source());
      queueSupplyLinkedRecord(tx, 'treatments', source(), ['stock-1']);
    })).rejects.toThrow();
    expect(await read('supplyInventory', 'stock-1')).toBeUndefined();
    expect(await read('treatments', 101)).toBeUndefined();
    expect(await read('metadata', queueKey('treatments', 'treatment:101'))).toBeUndefined();
  });

  it('keeps the last source intent and unions old dependencies, including edits after stock cancellation', async () => {
    await saveQueued('treatments', source(), ['old-stock']);
    const last = source('treatments', 'latest source edit');
    await transact(tx => {
      queueSupplyLinkedRecord(tx, 'treatments', source('treatments', 'intermediate'), ['new-stock']);
      tx.objectStore('treatments').put(last);
      queueSupplyLinkedRecord(tx, 'treatments', last, []);
    });
    const queue = await read('metadata', queueKey('treatments', 'treatment:101'));
    expect(queue?.record).toEqual(last);
    expect(new Set(queue?.movementIds as string[])).toEqual(new Set(['old-stock', 'new-stock']));
    expect(await hasPendingSupplyLinkedRecord('treatments', 'treatment:101')).toBe(true);
  });

  it('does not add an outbox to an unrelated source with no existing stock dependencies', async () => {
    await saveQueued('treatments', source(), []);
    expect(await hasPendingSupplyLinkedRecord('treatments', 'treatment:101')).toBe(false);
    expect(await read('treatments', 101)).toEqual(source());
  });

  it('captures the queued record at the formal save call rather than after its caller mutates an object', async () => {
    const mutable = source();
    await transact(tx => {
      tx.objectStore('treatments').put(mutable);
      queueSupplyLinkedRecord(tx, 'treatments', mutable, ['stock-1']);
      mutable.note = 'later in-memory mutation';
    });
    expect((await read('metadata', queueKey('treatments', 'treatment:101')))?.record).toEqual(source());
    expect(await read('treatments', 101)).toEqual(source());
  });
});

describe('stock-dependent record delivery', () => {
  it.each(['treatments', 'breedings', 'expenses'] as const)('sends a ready %s through its existing endpoint and acknowledges only transport fields', async store => {
    await readyStock();
    const row = source(store);
    await saveQueued(store, row);
    vi.mocked(fetch).mockResolvedValue(success(cloudId(store), { note: 'server-normalized value must not replace the local record' }));

    expect(await retrySupplyLinkedRecords()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(`/api/${store}/record-sync/${encodeURIComponent(cloudId(store))}`);
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe('PUT');
    expect(await read(store, row.id)).toEqual({ ...row, cloudSyncPending: false, cloudUpdatedAt: '2026-11-01T00:02:00.000Z' });
    expect(await hasPendingSupplyLinkedRecord(store, cloudId(store))).toBe(false);
  });

  it.each(['unconfirmed revision', 'pending movement', 'untracked inventory edit'])('does not send a source while stock has %s', async reason => {
    const original = stock();
    await readyStock([original], reason === 'unconfirmed revision' ? { revision: null } :
      reason === 'pending movement' ? { pending: [{ operationId: 'stock-op', before: original, after: { ...original, note: 'changed' } }] } : {});
    if (reason === 'untracked inventory edit') await transact(tx => tx.objectStore('supplyInventory').put({ ...original, note: 'untracked' }));
    await saveQueued('treatments', source());
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(await hasPendingSupplyLinkedRecord('treatments', 'treatment:101')).toBe(true);
  });

  it('retries a lost PUT response by the same cloud ID without creating another record', async () => {
    await readyStock();
    await saveQueued('treatments', source());
    const cloud = new Map<string, unknown>();
    let attempts = 0;
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      cloud.set(body.id, body);
      if (++attempts === 1) throw new Error('response lost after commit');
      return success(body.id);
    });
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(await hasPendingSupplyLinkedRecord('treatments', 'treatment:101')).toBe(true);
    expect(await retrySupplyLinkedRecords()).toBe(true);
    expect(cloud.size).toBe(1);
    expect(attempts).toBe(2);
    expect(vi.mocked(fetch).mock.calls.every(([_url, options]) => options?.method === 'PUT')).toBe(true);
  });

  it('does not acknowledge an older response over a source edited and requeued during the request', async () => {
    await readyStock();
    const original = source();
    await saveQueued('treatments', original);
    let entered!: () => void; let finish!: (response: Response) => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    vi.mocked(fetch).mockImplementationOnce(() => { entered(); return new Promise(resolve => { finish = resolve; }); });
    const sending = retrySupplyLinkedRecords();
    await started;
    const edited = { ...original, note: 'newer edit', updatedAt: '2026-11-01T00:03:00.000Z' };
    await saveQueued('treatments', edited, []);
    finish(success('treatment:101'));
    expect(await sending).toBe(false);
    expect(await read('treatments', 101)).toEqual(edited);
    expect((await read('metadata', queueKey('treatments', 'treatment:101')))?.record).toEqual(edited);
    vi.mocked(fetch).mockResolvedValue(success('treatment:101'));
    expect(await retrySupplyLinkedRecords()).toBe(true);
    expect((await read('treatments', 101))?.note).toBe('newer edit');
  });

  it('does not send an old queued source when an untracked later edit exists', async () => {
    await readyStock();
    await saveQueued('treatments', source());
    const newer = source('treatments', 'untracked source edit');
    await transact(tx => tx.objectStore('treatments').put(newer));
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(await read('treatments', 101)).toEqual(newer);
  });

  it.each(['treatments', 'breedings', 'expenses'] as const)('does not send %s with an explicit missing stock link even when both stock copies are absent', async store => {
    await readyStock([]);
    const field = store === 'treatments' ? 'medicineInventoryMovementId' :
      store === 'breedings' ? 'embryoInventoryMovementId' : 'sourceSupplyMovementId';
    await saveQueued(store, { ...source(store), [field]: 'missing-stock' }, ['missing-stock']);
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(await hasPendingSupplyLinkedRecord(store, cloudId(store))).toBe(true);
  });

  it.each(['treatments', 'breedings'] as const)('delivers a %s cancellation with explicit null links while retaining its former stock dependency', async store => {
    await readyStock([stock('old-stock')]);
    const original = { ...source(store), ...(store === 'treatments'
      ? { medicineInventoryMovementId: 'old-stock', medicineInventoryBatchKey: 'old-batch', medicineInventoryQuantity: 1 }
      : { embryoInventoryMovementId: 'old-stock', embryoInventoryBatchKey: 'old-batch' }) };
    await saveQueued(store, original, ['old-stock']);
    await readyStock([]);
    const cancelled: StoredRecord = { ...source(store, 'stock use cancelled'), ...(store === 'treatments'
      ? { medicineSource: 'veterinarian' } : { embryoSource: 'external' }) };
    await saveQueued(store, cancelled, []);
    expect((await read('metadata', queueKey(store, cloudId(store))))?.movementIds).toEqual(['old-stock']);
    vi.mocked(fetch).mockResolvedValue(success(cloudId(store)));
    expect(await retrySupplyLinkedRecords()).toBe(true);
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(payload).toMatchObject(store === 'treatments' ? {
      medicineSource: 'veterinarian', medicineInventoryMovementId: null,
      medicineInventoryBatchKey: null, medicineInventoryQuantity: null,
    } : { embryoSource: 'external', embryoInventoryMovementId: null, embryoInventoryBatchKey: null });
    expect(payload.note).toBe('stock use cancelled');
    expect((await read(store, cancelled.id))?.note).toBe(cancelled.note);
  });

  it('continues an independent ready source after another queued source fails', async () => {
    await readyStock();
    await saveQueued('expenses', source('expenses'));
    await saveQueued('treatments', source());
    vi.mocked(fetch).mockImplementation(async url => String(url).includes('/expenses/')
      ? new Response('{}', { status: 409 }) : success('treatment:101'));
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(await hasPendingSupplyLinkedRecord('expenses', 'expense:expenses-test')).toBe(true);
    expect(await hasPendingSupplyLinkedRecord('treatments', 'treatment:101')).toBe(false);
  });
});

describe('deletion and context protection', () => {
  it.each(['treatments', 'breedings', 'expenses'] as const)('retries %s deletion after a lost response without recreating its source', async store => {
    await readyStock([]);
    const row = source(store);
    await saveQueued(store, row, ['deleted-stock'], true);
    vi.mocked(fetch).mockRejectedValueOnce(new Error('lost deletion response'));
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(await hasPendingSupplyLinkedRecord(store, cloudId(store))).toBe(true);
    vi.mocked(fetch).mockResolvedValue(store === 'breedings' ? new Response('{}', { status: 404 }) : success(cloudId(store)));
    expect(await retrySupplyLinkedRecords()).toBe(true);
    expect(await read(store, row.id)).toBeUndefined();
    expect(await hasPendingSupplyLinkedRecord(store, cloudId(store))).toBe(false);
    const expected = store === 'breedings' ? `/api/breedings/${cloudId(store)}`
      : `/api/${store}/record-sync/${encodeURIComponent(cloudId(store))}`;
    expect(vi.mocked(fetch).mock.calls.every(([url, options]) => url === expected && options?.method === 'DELETE')).toBe(true);
  });

  it.each(['farm', 'owner'])('does not replay a queue belonging to a different %s', async kind => {
    await readyStock();
    await saveQueued('treatments', source());
    const original = await read('metadata', queueKey('treatments', 'treatment:101'));
    if (kind === 'farm') environment.farmId = 'another-test-farm';
    else localStorage.setItem(`farmpro.supplySyncOwner.${encodeURIComponent(environment.farmId)}`, 'another-browser');
    await retrySupplyLinkedRecords();
    expect(fetch).not.toHaveBeenCalled();
    expect(await hasPendingSupplyLinkedRecord('treatments', 'treatment:101')).toBe(false);
    expect(await read('metadata', queueKey('treatments', 'treatment:101'))).toEqual(original);
  });

  it.each(['token', 'user', 'farm', 'owner', 'restore'])('keeps the source and its queue if %s changes during a request', async kind => {
    await readyStock();
    await saveQueued('treatments', source());
    let entered!: () => void; let finish!: (response: Response) => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    vi.mocked(fetch).mockImplementationOnce(() => { entered(); return new Promise(resolve => { finish = resolve; }); });
    const sending = retrySupplyLinkedRecords();
    await started;
    if (kind === 'token') environment.token = 'new-login-token';
    if (kind === 'user') environment.userId = 'new-user';
    if (kind === 'farm') environment.farmId = 'new-farm';
    if (kind === 'owner') localStorage.setItem(`farmpro.supplySyncOwner.${encodeURIComponent(environment.farmId)}`, 'new-owner');
    if (kind === 'restore') window.history.replaceState(null, '', '/backups');
    finish(success('treatment:101'));
    expect(await sending).toBe(false);
    expect(await read('treatments', 101)).toEqual(source());
    expect(await read('metadata', queueKey('treatments', 'treatment:101'))).toBeDefined();
    expect(environment.token).toBe(kind === 'token' ? 'new-login-token' : 'test-token');
  });

  it.each(['/backups', '/device-sync?receive=cloud'])('does not start linked synchronization on %s', async url => {
    await readyStock();
    await saveQueued('treatments', source());
    window.history.replaceState(null, '', url);
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
