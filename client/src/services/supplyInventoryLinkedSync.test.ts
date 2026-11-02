import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import type { StoredRecord } from '../storage/types';
import type { Breeding, BreedingInput } from '../types/breeding';
import type { Treatment, TreatmentInput } from '../types/treatment';
import { batchKey, type SupplyMovement } from './supplyInventoryApi';
import { getSupplySyncIdentity, SUPPLY_SYNC_STATE_ID, type SupplyInventorySyncState } from './supplyInventorySyncState';
import { hasPendingSupplyLinkedRecord, queueSupplyLinkedRecord, retrySupplyLinkedRecords } from './supplyInventoryLinkedSync';
import { updateExpense, type ExpenseInput } from './expensesApi';
import { getTreatmentList } from './treatmentApi';
import { deleteTreatmentWithMedicineSource, saveTreatmentWithMedicineSource } from './treatmentInventoryLink';
import { deleteBreedingWithEmbryoInventory, saveBreedingWithEmbryoInventory } from './breedingInventoryLink';
import { toCloudBreeding } from './breedingSyncProtocol';
import { toCloudTreatment } from './treatmentSyncProtocol';

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

function linkedTreatment() {
  const purchase = stock();
  const usage: SupplyMovement = {
    ...purchase, id: 'treatment-stock-101', action: '使用', quantity: 1,
    cowEarTag: 'TEST-COW', unitPrice: 0, amount: 0,
  };
  const row: StoredRecord = {
    ...source(), targetNumber: 'TEST-COW', targetName: '試験牛', treatmentDate: '2026-11-01',
    medicine: purchase.itemName, medicineSource: 'farm_stock',
    medicineInventoryMovementId: usage.id, medicineInventoryBatchKey: batchKey(usage),
    medicineInventoryQuantity: usage.quantity,
  };
  return { purchase, usage, row };
}

function linkedBreeding() {
  const purchase: SupplyMovement = { ...stock(), kind: '受精卵', itemName: '試験受精卵', unit: '個' };
  const usage: SupplyMovement = {
    ...purchase, id: 'embryo-stock-breedings-test', action: '使用', quantity: 1,
    cowEarTag: 'TEST-COW', unitPrice: 0, amount: 0,
  };
  const input: BreedingInput = {
    cowEarTag: 'TEST-COW', cowName: '試験牛', heatDate: '2026-10-25',
    breedingMethod: '受精卵移植', breedingStatus: '移植実施', embryoSource: 'farm_stock',
    transferDate: '2026-11-01', embryoNumber: purchase.lotNumber, transferPlannedDate: '',
    transferCancelReason: '', inseminationDate: '', bullName: '', inseminatorName: '',
    collectionDate: '', embryoType: '', donorCowName: '', donorCowEarTag: '', embryoSireName: '',
    embryoGrade: '', strawNumber: '', supplierName: '', transferTechnician: '', nextHeatExpectedDate: '',
    pregnancyCheckExpectedDate: '', pregnancyCheckDate: '', pregnancyResult: '',
    recheckExpectedDate: '', expectedCalvingDate: '', note: 'saved locally',
  };
  const row: Breeding & StoredRecord = {
    ...source('breedings'), ...input, recordKind: 'standard',
    embryoInventoryMovementId: usage.id, embryoInventoryBatchKey: batchKey(usage),
  };
  return { purchase, usage, input, row };
}

type PurchaseExpense = ExpenseInput & StoredRecord & { id: string };

function purchaseExpense(changes: Partial<PurchaseExpense> = {}): PurchaseExpense {
  return {
    ...source('expenses'), id: 'expenses-test', syncRecordId: 'expense:expenses-test',
    paymentDate: '2026-11-01', category: '医薬品費',
    description: '試験薬 購入（TEST-LOT）', vendor: '試験仕入先', amount: '200',
    paymentMethod: '現金', target: '農場全体', memo: '在庫購入から登録',
    sourceSupplyMovementId: 'stock-1', sourceSupplyPurchaseReference: 'TEST-INVOICE',
    ...changes,
  };
}

function cloudId(store: SourceStore, row = source(store)): string {
  return String(store === 'breedings' ? row.cloudRecordId ?? row.id : row.syncRecordId);
}

function conditionalWire(store: 'treatments' | 'breedings', record: StoredRecord) {
  return store === 'breedings' ? toCloudBreeding(record) : toCloudTreatment(record);
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

function cloudExpense(row: StoredRecord, changes: Partial<StoredRecord> = {}): StoredRecord {
  return { ...row, id: cloudId('expenses', row), cloudUpdatedAt: '2026-11-01T00:02:00.000Z', ...changes };
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
  it.each([['breedings', false], ['breedings', true], ['treatments', false], ['treatments', true]] as const)(
    'keeps peer-edited %s and its stock queue unchanged (deleted=%s)', async (store, deleted) => {
    const state = await readyStock();
    const row = { ...source(store, 'local requested edit'), cloudUpdatedAt: '2026-11-01T00:00:00.000Z' };
    await saveQueued(store, row, ['stock-1'], deleted);
    const key = queueKey(store, cloudId(store, row));
    const queued = await read('metadata', key);
    const peer = { ...conditionalWire(store, row), note: 'peer confirmed edit', cloudUpdatedAt: '2026-11-01T00:03:00.000Z' };
    vi.mocked(fetch).mockResolvedValue(Response.json(peer));

    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => !options?.method)).toBe(true);
    expect(await read(store, row.id)).toEqual(deleted ? undefined : row);
    expect(await read('metadata', key)).toEqual(queued);
    expect(await read('supplyInventory', 'stock-1')).toEqual(stock());
    expect(await read('metadata', SUPPLY_SYNC_STATE_ID)).toEqual(state);
  });

  it.each(['breedings', 'treatments'] as const)('does not recreate remotely deleted %s from a ready stock queue', async store => {
    await readyStock();
    const row = source(store);
    await saveQueued(store, row);
    const key = queueKey(store, cloudId(store, row));
    const queued = await read('metadata', key);
    vi.mocked(fetch).mockResolvedValue(success(cloudId(store, row), {
      ...conditionalWire(store, row), deletedAt: '2026-11-01T00:02:00.000Z',
    }));

    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => !options?.method)).toBe(true);
    expect(await read(store, row.id)).toEqual(row);
    expect(await read('metadata', key)).toEqual(queued);
  });

  it.each(['breedings', 'treatments'] as const)('retains confirmed B before attempting C after a lost %s PUT acknowledgement', async store => {
    await readyStock();
    const revisionA = '2026-11-01T00:02:00.000Z';
    const revisionB = '2026-11-01T00:03:00.000Z';
    const revisionC = '2026-11-01T00:04:00.000Z';
    const a = { ...source(store, 'A'), cloudSyncPending: false, cloudUpdatedAt: revisionA };
    const b = { ...a, note: 'B', cloudSyncPending: true, updatedAt: '2026-11-01T01:00:00.000Z',
      localExtension: 'preserved locally', medicineCost: '1200', medicalFee: '3400' };
    const c = { ...b, note: 'C', medicineCost: '2300', updatedAt: '2026-11-01T02:00:00.000Z' };
    const id = cloudId(store, a);
    const key = queueKey(store, id);
    const baseKey = store === 'breedings' ? 'breedingSyncBase' : 'treatmentSyncBase';
    const attemptKey = store === 'breedings' ? 'breedingSyncAttempt' : 'treatmentSyncAttempt';
    let remote: ReturnType<typeof toCloudBreeding> = { ...conditionalWire(store, a), cloudUpdatedAt: revisionA };
    const conditions: Array<string | null> = [];
    let putCount = 0;
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      if (!options?.method) return Response.json(remote);
      expect(options.method).toBe('PUT');
      conditions.push(new Headers(options.headers).get('If-Match'));
      const payload = JSON.parse(String(options.body));
      if (store === 'breedings') expect(payload).not.toHaveProperty('localExtension');
      else expect(payload).toMatchObject({ localExtension: 'preserved locally', medicalFee: '3400' });
      expect(payload).not.toHaveProperty(attemptKey);
      expect(payload).not.toHaveProperty('cloudSyncPending');
      putCount += 1;
      if (putCount === 1) {
        remote = { ...payload, cloudUpdatedAt: revisionB };
        throw new Error('B committed but acknowledgement lost');
      }
      if (putCount === 2) return new Response('{}', { status: 503 });
      remote = { ...payload, cloudUpdatedAt: revisionC };
      return Response.json(remote);
    });

    await saveQueued(store, b);
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect((await read('metadata', key))?.[attemptKey]).toMatchObject({ record: { note: 'B' } });
    await saveQueued(store, c, []);
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect((await read('metadata', key))?.[baseKey]).toMatchObject({
      cloudUpdatedAt: revisionB, record: { note: 'B', cloudUpdatedAt: revisionB },
    });
    expect((await read('metadata', key))?.[attemptKey]).toMatchObject({ record: { note: 'C' } });
    expect(await read(store, c.id)).toEqual(c);
    expect(await retrySupplyLinkedRecords()).toBe(true);
    expect(conditions).toEqual([JSON.stringify(revisionA), JSON.stringify(revisionB), JSON.stringify(revisionB)]);
    expect(remote.note).toBe('C');
    expect(await read(store, c.id)).toEqual({ ...c, cloudSyncPending: false, cloudUpdatedAt: revisionC });
    expect(await read('metadata', key)).toBeUndefined();
    expect(await read('supplyInventory', 'stock-1')).toEqual(stock());
  });

  it.each(['breedings', 'treatments'] as const)('does not send a stale stock intent after its source and queue change during %s readback', async store => {
    await readyStock();
    const row = { ...source(store, 'old local edit'), cloudUpdatedAt: '2026-11-01T00:00:00.000Z' };
    await saveQueued(store, row);
    let started!: () => void;
    const waiting = new Promise<void>(resolve => { started = resolve; });
    let release!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(async () => {
      started();
      return new Promise<Response>(resolve => { release = resolve; });
    });
    const sending = retrySupplyLinkedRecords();
    await waiting;
    const newer = { ...row, note: 'new local edit', updatedAt: '2026-11-01T03:00:00.000Z' };
    await saveQueued(store, newer, []);
    const key = queueKey(store, cloudId(store, row));
    const queued = await read('metadata', key);
    release(Response.json({ ...conditionalWire(store, row), note: 'confirmed base', cloudUpdatedAt: row.cloudUpdatedAt }));

    expect(await sending).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await read(store, newer.id)).toEqual(newer);
    expect(await read('metadata', key)).toEqual(queued);
  });

  it.each(['treatments', 'breedings', 'expenses'] as const)('sends a ready %s through its existing endpoint and acknowledges only transport fields', async store => {
    await readyStock();
    const row = source(store);
    await saveQueued(store, row);
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (url === '/api/expenses/record-sync') return new Response('[]');
      if (store !== 'expenses' && !options?.method) return new Response('{}', { status: 404 });
      return success(cloudId(store), JSON.parse(String(options?.body)));
    });

    expect(await retrySupplyLinkedRecords()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    const sent = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === 'PUT')!;
    expect(sent[0]).toBe(`/api/${store}/record-sync/${encodeURIComponent(cloudId(store))}`);
    expect(new Headers(sent[1]?.headers).get('If-None-Match')).toBe('*');
    expect(await read(store, row.id)).toEqual({ ...row, cloudSyncPending: false, cloudUpdatedAt: '2026-11-01T00:02:00.000Z' });
    expect(await hasPendingSupplyLinkedRecord(store, cloudId(store))).toBe(false);
  });

  it.each(['breedings', 'treatments'] as const)('keeps delete-pending %s queued without PUT and still permits its explicit DELETE', async store => {
    const stockState = await readyStock();
    const row = { ...source(store), [store === 'breedings' ? 'breedingSyncDeletePending' : 'treatmentSyncDeletePending']: true };
    const id = cloudId(store, row);
    const key = queueKey(store, id);
    await saveQueued(store, row);
    const queue = await read('metadata', key);
    vi.mocked(fetch).mockImplementation(async (_url, options) => options?.method === 'DELETE'
      ? store === 'breedings' ? new Response(null, { status: 204 })
        : success(id, { deletedAt: '2026-11-01T00:02:00.000Z' })
      : new Response('{}', { status: 404 }));

    expect.soft(await retrySupplyLinkedRecords()).toBe(false);
    expect.soft(fetch).not.toHaveBeenCalled();
    expect.soft(await read(store, row.id)).toEqual(row);
    expect.soft(await read('metadata', key)).toEqual(queue);
    expect.soft(await read('supplyInventory', 'stock-1')).toEqual(stock());
    expect.soft(await read('metadata', SUPPLY_SYNC_STATE_ID)).toEqual(stockState);

    await saveQueued(store, row, ['stock-1'], true);
    expect(await retrySupplyLinkedRecords()).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(store === 'breedings' ? `/api/breedings/${id}`
      : `/api/treatments/record-sync/${encodeURIComponent(id)}`, expect.objectContaining({ method: 'DELETE' }));
    expect(await read(store, row.id)).toBeUndefined();
    expect(await read('metadata', key)).toBeUndefined();
    expect(await read('supplyInventory', 'stock-1')).toEqual(stock());
  });

  it('keeps a stock-linked treatment pending after a deleted PUT response and a later pull', async () => {
    const { purchase, usage, row } = linkedTreatment();
    const stockState = await readyStock([purchase, usage]);
    await saveQueued('treatments', row, [usage.id]);
    const key = queueKey('treatments', 'treatment:101');
    const queue = await read('metadata', key);
    const tombstone = {
      id: 'treatment:101', deletedAt: '2026-11-01T00:02:00.000Z',
      cloudUpdatedAt: '2026-11-01T00:03:00.000Z',
    };
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (options?.method === 'PUT') return success('treatment:101', tombstone);
      if (url === '/api/treatments/record-sync') return Response.json([{ ...tombstone, cloudUpdatedAt: '2026-11-01T00:04:00.000Z' }]);
      return new Response(null, { status: 404 });
    });

    expect.soft(await retrySupplyLinkedRecords()).toBe(false);
    expect.soft(await read('treatments', row.id)).toEqual(row);
    expect.soft(await read('metadata', key)).toMatchObject({ record: row, operationId: queue?.operationId });

    expect.soft(await getTreatmentList()).toEqual([row]);
    expect.soft(await read('treatments', row.id)).toEqual(row);
    expect.soft(await hasPendingSupplyLinkedRecord('treatments', 'treatment:101')).toBe(true);
    expect.soft(await read('supplyInventory', usage.id)).toEqual(usage);
    expect.soft(await read('metadata', SUPPLY_SYNC_STATE_ID)).toEqual(stockState);
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
    const cloud = new Map<string, StoredRecord>();
    let attempts = 0;
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      if (!options?.method) return cloud.has('treatment:101')
        ? Response.json(cloud.get('treatment:101')) : new Response(null, { status: 404 });
      const body = JSON.parse(String(options?.body));
      cloud.set(body.id, { ...body, cloudUpdatedAt: '2026-11-01T00:02:00.000Z' });
      if (++attempts === 1) throw new Error('response lost after commit');
      return Response.json(cloud.get(body.id));
    });
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(await hasPendingSupplyLinkedRecord('treatments', 'treatment:101')).toBe(true);
    expect(await retrySupplyLinkedRecords()).toBe(true);
    expect(cloud.size).toBe(1);
    expect(attempts).toBe(1);
    expect(vi.mocked(fetch).mock.calls.map(([_url, options]) => options?.method || 'GET')).toEqual(['GET', 'PUT', 'GET']);
  });

  it('keeps another device’s formal purchase-expense edit after the first PUT response was lost', async () => {
    await readyStock();
    const original = purchaseExpense();
    const id = cloudId('expenses', original);
    await saveQueued('expenses', original);
    const cloud = new Map<string, StoredRecord>();
    let loseResponse = true;
    let puts = 0;
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (url === '/api/expenses/record-sync' && (!options?.method || options.method === 'GET')) {
        return new Response(JSON.stringify([...cloud.values()]));
      }
      if (options?.method !== 'PUT') throw new Error('unexpected fixture request');
      puts += 1;
      const payload = JSON.parse(String(options.body)) as StoredRecord;
      const saved = { ...cloud.get(String(payload.id)), ...payload, cloudUpdatedAt: '2026-11-01T00:02:00.000Z' };
      cloud.set(String(payload.id), saved);
      if (loseResponse) { loseResponse = false; throw new TypeError('response lost after commit'); }
      return new Response(JSON.stringify(saved));
    });
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(cloud.size).toBe(1);

    // A different local database imports the saved cloud row and uses the real
    // formal edit API. Its expense edit does not modify the stock movement.
    const firstDatabase = environment.database!;
    const ownerKey = `farmpro.supplySyncOwner.${encodeURIComponent(environment.farmId)}`;
    const firstOwner = localStorage.getItem(ownerKey)!;
    const secondDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = new IDBFactory().open('second-purchase-expense-device', 1);
      request.onupgradeneeded = () => stores.forEach(name => request.result.createObjectStore(name, { keyPath: 'id' }));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      environment.database = secondDatabase;
      localStorage.setItem(ownerKey, 'second-browser-owner');
      const imported = { ...cloud.get(id)!, id: 'second-device-expense', syncRecordId: id, cloudSyncPending: false };
      await transact(tx => tx.objectStore('expenses').put(imported));
      await updateExpense(imported.id, { ...original, amount: '350', paymentMethod: '銀行振込' });
    } finally {
      environment.database = firstDatabase;
      localStorage.setItem(ownerKey, firstOwner);
      secondDatabase.close();
    }
    const otherDeviceEdit = structuredClone(cloud.get(id));
    expect(otherDeviceEdit).toMatchObject({ amount: '350', paymentMethod: '銀行振込' });

    expect.soft(await retrySupplyLinkedRecords()).toBe(false);
    expect.soft(cloud.get(id)).toEqual(otherDeviceEdit);
    expect.soft(puts).toBe(2);
    expect.soft(await read('expenses', original.id)).toEqual(original);
    expect.soft(await hasPendingSupplyLinkedRecord('expenses', id)).toBe(true);
  });

  it('does not acknowledge an older response over a source edited and requeued during the request', async () => {
    await readyStock();
    const original = source();
    await saveQueued('treatments', original);
    let entered!: () => void; let finish!: (response: Response) => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    vi.mocked(fetch).mockImplementation((_url, options) => {
      if (!options?.method) return Promise.resolve(new Response(null, { status: 404 }));
      entered(); return new Promise(resolve => { finish = resolve; });
    });
    const sending = retrySupplyLinkedRecords();
    await started;
    const edited = { ...original, note: 'newer edit', updatedAt: '2026-11-01T00:03:00.000Z' };
    await saveQueued('treatments', edited, []);
    finish(success('treatment:101', toCloudTreatment(original)));
    expect(await sending).toBe(false);
    expect(await read('treatments', 101)).toEqual(edited);
    expect((await read('metadata', queueKey('treatments', 'treatment:101')))?.record).toEqual(edited);
    vi.mocked(fetch).mockImplementation(async (_url, options) => success('treatment:101', options?.method
      ? JSON.parse(String(options.body)) : toCloudTreatment(original)));
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
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      if (!options?.method) return new Response('{}', { status: 404 });
      return success(cloudId(store), JSON.parse(String(options?.body)));
    });
    expect(await retrySupplyLinkedRecords()).toBe(true);
    const payload = JSON.parse(String(vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === 'PUT')![1]?.body));
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
    vi.mocked(fetch).mockImplementation(async (url, options) => String(url).includes('/expenses/')
      ? new Response('{}', { status: 409 }) : !options?.method ? new Response(null, { status: 404 })
        : success('treatment:101', JSON.parse(String(options.body))));
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(await hasPendingSupplyLinkedRecord('expenses', 'expense:expenses-test')).toBe(true);
    expect(await hasPendingSupplyLinkedRecord('treatments', 'treatment:101')).toBe(false);
  });
});

describe('initial stock-purchase expense delivery', () => {
  it('acknowledges the exact raw cloud expense after response loss without another PUT or field normalization', async () => {
    await readyStock();
    const row = purchaseExpense({ paymentMethod: '', provenanceDetail: { invoiceLine: 3, source: 'fixture' } });
    await saveQueued('expenses', row);
    let remote: StoredRecord | undefined;
    let puts = 0;
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (url === '/api/expenses/record-sync') return new Response(JSON.stringify(remote ? [remote] : []));
      expect(options?.method).toBe('PUT');
      expect(new Headers(options?.headers).get('If-None-Match')).toBe('*');
      puts += 1;
      remote = cloudExpense(JSON.parse(String(options?.body)) as StoredRecord);
      throw new TypeError('response lost after the conditional create succeeded');
    });

    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(await read('expenses', row.id)).toEqual(row);
    expect(await retrySupplyLinkedRecords()).toBe(true);

    expect(puts).toBe(1);
    expect(await read('expenses', row.id)).toEqual({
      ...row, cloudSyncPending: false, cloudUpdatedAt: remote!.cloudUpdatedAt,
    });
    expect(await hasPendingSupplyLinkedRecord('expenses', cloudId('expenses', row))).toBe(false);
  });

  it.each([
    ['deleted', { deletedAt: '2026-11-01T00:03:00.000Z' }],
    ['settled', { settlementSaleId: 'fixture-settlement' }],
    ['blank payment method', { paymentMethod: '' }],
    ['different source reference', { sourceSupplyPurchaseReference: 'OTHER-INVOICE' }],
    ['different timestamp', { updatedAt: '2026-11-01T00:03:00.000Z' }],
    ['unknown business field', { noteFromOtherDevice: '別端末で追加した情報' }],
  ] as const)('holds an existing %s expense without changing either copy or its queue', async (_label, changes) => {
    const stockState = await readyStock();
    const row = purchaseExpense();
    await saveQueued('expenses', row);
    const key = queueKey('expenses', cloudId('expenses', row));
    const queue = await read('metadata', key);
    const remote = cloudExpense(row, changes);
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify([remote])));

    expect(await retrySupplyLinkedRecords()).toBe(false);

    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/expenses/record-sync', expect.objectContaining({ cache: 'no-store' }));
    expect(await read('expenses', row.id)).toEqual(row);
    expect(await read('metadata', key)).toEqual(queue);
    expect(await read('metadata', SUPPLY_SYNC_STATE_ID)).toEqual(stockState);
  });

  it('holds a concurrent 412 without retrying as an unconditional replacement', async () => {
    await readyStock();
    const row = purchaseExpense();
    await saveQueued('expenses', row);
    const remote = cloudExpense(row, { amount: '900', paymentMethod: '銀行振込' });
    const cloud = new Map<string, StoredRecord>();
    const writes: RequestInit[] = [];
    vi.mocked(fetch).mockImplementation(async (url, options) => {
      if (url === '/api/expenses/record-sync') return new Response('[]');
      writes.push(options!);
      if (!cloud.has(String(remote.id))) cloud.set(String(remote.id), remote);
      if (new Headers(options?.headers).get('If-None-Match') === '*') {
        return new Response(JSON.stringify({ message: 'another device saved this ID after GET' }), { status: 412 });
      }
      const overwritten = cloudExpense(JSON.parse(String(options?.body)) as StoredRecord);
      cloud.set(String(overwritten.id), overwritten);
      return new Response(JSON.stringify(overwritten));
    });

    expect(await retrySupplyLinkedRecords()).toBe(false);

    expect(writes).toHaveLength(1);
    expect(new Headers(writes[0].headers).get('If-None-Match')).toBe('*');
    expect(await read('expenses', row.id)).toEqual(row);
    expect(await hasPendingSupplyLinkedRecord('expenses', cloudId('expenses', row))).toBe(true);
    expect([...cloud.values()]).toEqual([remote]);
  });

  it.each(['queue edit', 'queue deletion', 'pending stock', 'new epoch'] as const)(
    'rechecks a %s made while the cloud expense GET is waiting', async kind => {
      await readyStock();
      const row = purchaseExpense();
      await saveQueued('expenses', row);
      let expected: StoredRecord | undefined = row;
      vi.mocked(fetch).mockImplementation(async () => {
        if (kind === 'queue edit') {
          expected = { ...row, amount: '400', updatedAt: '2026-11-01T00:04:00.000Z' };
          await saveQueued('expenses', expected, []);
        } else if (kind === 'queue deletion') {
          await saveQueued('expenses', row, [], true);
          expected = undefined;
        } else if (kind === 'pending stock') {
          await readyStock([stock()], { pending: [{
            operationId: 'new-stock-operation', before: stock(), after: { ...stock(), quantity: 3 },
          }] });
        } else {
          await readyStock([stock()], { epoch: 'replacement-stock-baseline' });
        }
        return new Response('[]');
      });

      expect(await retrySupplyLinkedRecords()).toBe(false);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/expenses/record-sync');
      expect(await read('expenses', row.id)).toEqual(expected);
      expect(await read('metadata', queueKey('expenses', cloudId('expenses', row)))).toMatchObject({
        record: expected ?? row, deleted: kind === 'queue deletion',
      });
    },
  );

  it.each(['token', 'user', 'farm', 'owner', 'restore'] as const)(
    'keeps the initial purchase expense and queue if %s changes during GET', async kind => {
      await readyStock();
      const row = purchaseExpense();
      await saveQueued('expenses', row);
      const key = queueKey('expenses', cloudId('expenses', row));
      const queue = await read('metadata', key);
      vi.mocked(fetch).mockImplementation(async () => {
        if (kind === 'token') environment.token = 'changed-token';
        if (kind === 'user') environment.userId = 'changed-user';
        if (kind === 'farm') environment.farmId = 'changed-farm';
        if (kind === 'owner') localStorage.setItem(`farmpro.supplySyncOwner.${encodeURIComponent(environment.farmId)}`, 'changed-browser');
        if (kind === 'restore') window.history.replaceState(null, '', '/backups');
        return new Response('[]');
      });

      expect(await retrySupplyLinkedRecords()).toBe(false);

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/expenses/record-sync');
      expect(await read('expenses', row.id)).toEqual(row);
      expect(await read('metadata', key)).toEqual(queue);
    },
  );

  it.each(['acknowledged update', 'deletion'] as const)('preserves the existing %s path without adding an initial-expense GET', async kind => {
    await readyStock();
    const row = purchaseExpense({ ...(kind === 'acknowledged update' ? { cloudUpdatedAt: '2026-11-01T00:01:30.000Z' } : {}) });
    await saveQueued('expenses', row, ['stock-1'], kind === 'deletion');
    vi.mocked(fetch).mockImplementation(async () => success(cloudId('expenses', row)));

    expect(await retrySupplyLinkedRecords()).toBe(true);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`/api/expenses/record-sync/${encodeURIComponent(cloudId('expenses', row))}`);
    expect(options?.method).toBe(kind === 'deletion' ? 'DELETE' : 'PUT');
    expect(new Headers(options?.headers).has('If-None-Match')).toBe(false);
  });
});

describe('deletion and context protection', () => {
  it.each([
    ['create', 'source read'], ['create', 'stock read'],
    ['save', 'source read'], ['save', 'stock read'],
  ] as const)('aborts a guarded treatment %s at the %s without changing stock or source', async (operation, boundary) => {
    const fixture = linkedTreatment();
    const stockState = await readyStock(operation === 'create' ? [fixture.purchase] : [fixture.purchase, fixture.usage]);
    if (operation === 'save') await saveQueued('treatments', fixture.row, [fixture.usage.id]);
    const key = queueKey('treatments', cloudId('treatments', fixture.row));
    const queue = await read('metadata', key);
    const conflict = new Error('the reviewed treatment or login changed');
    const token = environment.token;
    const input: TreatmentInput = {
      targetNumber: 'TEST-COW', targetName: '試験牛', treatmentDate: '2026-11-01',
      symptom: '試験症状', diagnosis: '', medicine: fixture.purchase.itemName, dosage: '1本',
      withdrawalEndDate: '', veterinarian: '', progress: '治療中', note: 'attempted save',
    };
    await expect(saveTreatmentWithMedicineSource(input, {
      source: 'farm_stock', batchKey: batchKey(fixture.purchase), quantity: 1,
    }, operation === 'create' ? undefined : 101, {
      validateCurrent: (current: Treatment | undefined) => {
        expect(current).toEqual(operation === 'create' ? undefined : fixture.row);
        if (boundary === 'source read' || environment.token !== token) throw conflict;
        queueMicrotask(() => { environment.token = 'changed-token'; });
      },
    })).rejects.toBe(conflict);

    expect(await read('treatments', 101)).toEqual(operation === 'create' ? undefined : fixture.row);
    expect(await read('supplyInventory', fixture.purchase.id)).toEqual(fixture.purchase);
    expect(await read('supplyInventory', fixture.usage.id)).toEqual(operation === 'create' ? undefined : fixture.usage);
    expect(await read('metadata', key)).toEqual(queue);
    expect(await read('metadata', SUPPLY_SYNC_STATE_ID)).toEqual(stockState);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([204, 412])('finishes a legacy physically deleted ET only if absence still holds (DELETE %s)', async status => {
    const state = await readyStock([]);
    const row = { ...source('breedings'), cloudUpdatedAt: '2026-11-01T00:01:00.000Z' };
    await saveQueued('breedings', row, ['deleted-stock'], true);
    vi.mocked(fetch).mockImplementation(async (_url, options) => options?.method === 'DELETE'
      ? new Response(null, { status }) : new Response(null, { status: 404 }));

    expect(await retrySupplyLinkedRecords()).toBe(status === 204);

    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, options] = vi.mocked(fetch).mock.calls[1];
    expect(url).toBe(`/api/breedings/${cloudId('breedings', row)}`);
    expect(options?.method).toBe('DELETE');
    expect(new Headers(options?.headers).get('If-None-Match')).toBe('*');
    expect(new Headers(options?.headers).has('If-Match')).toBe(false);
    expect(await read('breedings', row.id)).toBeUndefined();
    expect(await read('metadata', SUPPLY_SYNC_STATE_ID)).toEqual(state);
    expect(await hasPendingSupplyLinkedRecord('breedings', cloudId('breedings', row))).toBe(status !== 204);
  });

  it.each([
    ['create', 'source read'], ['create', 'stock read'],
    ['save', 'source read'], ['save', 'stock read'],
    ['delete', 'source read'], ['delete', 'stock read'],
  ] as const)('aborts a guarded ET %s at the %s without changing its record, stock or queue', async (operation, boundary) => {
    const fixture = linkedBreeding();
    const stockState = await readyStock(operation === 'create'
      ? [fixture.purchase] : [fixture.purchase, fixture.usage]);
    if (operation !== 'create') await saveQueued('breedings', fixture.row, [fixture.usage.id]);
    const id = operation === 'create' ? 'new-breeding-guard' : fixture.row.id;
    const key = queueKey('breedings', operation === 'create' ? String(id) : cloudId('breedings', fixture.row));
    const queue = await read('metadata', key);
    class BreedingConflict extends Error {}
    const conflict = new BreedingConflict('the reviewed breeding or login changed');
    const token = environment.token;
    const validateCurrent = (current: Breeding | undefined) => {
      expect(current).toEqual(operation === 'create' ? undefined : fixture.row);
      if (boundary === 'source read' || environment.token !== token) throw conflict;
      queueMicrotask(() => { environment.token = 'changed-token'; });
    };

    await expect(operation === 'delete'
      ? deleteBreedingWithEmbryoInventory(id, validateCurrent)
      : saveBreedingWithEmbryoInventory(id, { ...fixture.input, note: 'attempted later save' }, batchKey(fixture.purchase), {
        create: operation === 'create', validateCurrent,
      })).rejects.toBe(conflict);

    expect(await read('breedings', id)).toEqual(operation === 'create' ? undefined : fixture.row);
    expect(await read('supplyInventory', fixture.purchase.id)).toEqual(fixture.purchase);
    expect(await read('supplyInventory', fixture.usage.id)).toEqual(operation === 'create' ? undefined : fixture.usage);
    expect(await read('supplyInventory', 'embryo-stock-new-breeding-guard')).toBeUndefined();
    expect(await read('metadata', key)).toEqual(queue);
    expect(await read('metadata', SUPPLY_SYNC_STATE_ID)).toEqual(stockState);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['changed source', 'context while reading stock', 'cancelled stock source'] as const)(
    'keeps the treatment, stock and queue when deletion validation rejects a %s', async kind => {
      const fixture = linkedTreatment();
      const rows = kind === 'cancelled stock source' ? [fixture.purchase] : [fixture.purchase, fixture.usage];
      const stockState = await readyStock(rows);
      const row = kind === 'cancelled stock source' ? source() : fixture.row;
      await saveQueued('treatments', row, [fixture.usage.id]);
      const key = queueKey('treatments', 'treatment:101');
      const queue = await read('metadata', key);
      class DeletionConflict extends Error {}
      const conflict = new DeletionConflict('the reviewed treatment or login changed');
      const token = environment.token;

      await expect(deleteTreatmentWithMedicineSource(101, current => {
        expect(current).toEqual(row);
        if (kind !== 'context while reading stock' || environment.token !== token) throw conflict;
        queueMicrotask(() => { environment.token = 'changed-token'; });
      })).rejects.toBe(conflict);

      expect(await read('treatments', row.id)).toEqual(row);
      expect(await read('supplyInventory', fixture.purchase.id)).toEqual(fixture.purchase);
      expect(await read('supplyInventory', fixture.usage.id)).toEqual(
        kind === 'cancelled stock source' ? undefined : fixture.usage,
      );
      expect(await read('metadata', key)).toEqual(queue);
      expect(await read('metadata', SUPPLY_SYNC_STATE_ID)).toEqual(stockState);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['treatments', 'breedings', 'expenses'] as const)('retries %s deletion after a lost response without recreating its source', async store => {
    await readyStock([]);
    const row = source(store);
    await saveQueued(store, row, ['deleted-stock'], true);
    if (store !== 'expenses') {
      vi.mocked(fetch).mockImplementation(async (_url, options) => {
        if (options?.method === 'DELETE') throw new Error('lost deletion response');
        return success(cloudId(store), conditionalWire(store, row));
      });
    } else vi.mocked(fetch).mockRejectedValueOnce(new Error('lost deletion response'));
    expect(await retrySupplyLinkedRecords()).toBe(false);
    expect(await hasPendingSupplyLinkedRecord(store, cloudId(store))).toBe(true);
    vi.mocked(fetch).mockResolvedValue(store !== 'expenses'
      ? success(cloudId(store), { ...conditionalWire(store, row), deletedAt: '2026-11-01T00:02:00.000Z' }) : success(cloudId(store)));
    expect(await retrySupplyLinkedRecords()).toBe(true);
    expect(await read(store, row.id)).toBeUndefined();
    expect(await hasPendingSupplyLinkedRecord(store, cloudId(store))).toBe(false);
    const expected = store === 'breedings' ? `/api/breedings/${cloudId(store)}`
      : `/api/${store}/record-sync/${encodeURIComponent(cloudId(store))}`;
    expect(vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'DELETE')
      .every(([url]) => url === expected)).toBe(true);
    if (store !== 'expenses') expect(vi.mocked(fetch).mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(1);
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
