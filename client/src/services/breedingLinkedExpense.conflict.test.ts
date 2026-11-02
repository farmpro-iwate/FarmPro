import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearStore, deleteRecord, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { Breeding, BreedingInput } from '../types/breeding';
import { BreedingSyncConflictError, deleteBreeding, updateBreeding } from './breedingApi';
import { batchKey, getSupplyBatches, type SupplyMovement } from './supplyInventoryApi';
import { getSupplySyncIdentity, SUPPLY_SYNC_STATE_ID, type SupplyInventorySyncState } from './supplyInventorySyncState';
import { hasPendingSupplyLinkedRecord, retrySupplyLinkedRecords } from './supplyInventoryLinkedSync';
import { toCloudBreeding, type CloudBreedingRecord } from './breedingSyncProtocol';
import type { ExpenseRecord } from './expensesApi';

const bridge = vi.hoisted(() => ({ sync: vi.fn<() => Promise<boolean>>() }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'standard' }));
vi.mock('./authClient', () => ({
  getStoredAuthUser: () => ({ id: 'et-expense-fixture-owner', farmId: 'et-expense-fixture-farm', plan: 'standard' }),
  getAuthToken: () => 'et-expense-fixture-token',
}));
// This fixture confirms only its own stock snapshot, then invokes the real
// source outbox. Breeding, stock, queue, expenses and IndexedDB remain real.
vi.mock('./supplyInventorySync', () => ({ syncSupplyInventorySafely: bridge.sync }));

const firstTime = '2026-11-01T00:00:00.000Z';
const nextTime = '2026-11-02T00:00:00.000Z';
const localId = 'et-expense-fixture-local';
const cloudId = 'et-expense-fixture-cloud';
const sourcePath = `/api/breedings/record-sync/${cloudId}`;
const sourceDeletePath = `/api/breedings/${cloudId}`;
const queueId = `supply-linked-sync:breedings:${cloudId}`;
const purchase: SupplyMovement = {
  id: 'et-expense-fixture-purchase', kind: '受精卵', action: '購入', date: '2026-10-28',
  itemName: 'ET経費検証卵', lotNumber: 'ET-EXPENSE-FIXTURE', quantity: 2, unit: '個',
  expiryDate: '', supplier: '検証仕入先', storageLocation: '検証タンク', donorCow: '検証母',
  sire: '検証父', grade: 'A', cowEarTag: '', unitPrice: 12000, amount: 24000,
  paymentMethod: '現金', note: '隔離fixture', expenseRecorded: false,
  createdAt: firstTime, updatedAt: firstTime,
};
const usage: SupplyMovement = {
  ...purchase, id: `embryo-stock-${localId}`, action: '使用', date: '2026-11-01',
  cowEarTag: 'ET-FIXTURE-COW', quantity: 1, unitPrice: 0, amount: 0,
};
const input: BreedingInput = {
  cowEarTag: 'ET-FIXTURE-COW', cowName: 'ET経費検証牛', heatDate: '2026-10-25',
  breedingMethod: '受精卵移植', breedingStatus: '移植実施',
  inseminationDate: '', inseminationCost: '', bullName: '', inseminatorName: '',
  transferPlannedDate: '', transferDate: '2026-11-01', transferCost: '', embryoCost: '',
  transferProcedureCost: '1200', transferOtherCost: '', transferCancelReason: '',
  embryoNumber: purchase.lotNumber, embryoSource: 'farm_stock', embryoInventoryBatchKey: batchKey(purchase),
  collectionDate: '', embryoType: '', donorCowName: '', donorCowEarTag: '', embryoSireName: '',
  embryoGrade: '', strawNumber: '', supplierName: '', transferTechnician: '', nextHeatExpectedDate: '',
  pregnancyCheckExpectedDate: '', pregnancyCheckDate: '', pregnancyCheckCost: '', pregnancyResult: '',
  recheckExpectedDate: '', expectedCalvingDate: '', note: '確認済みの元記録',
};
const original: Breeding & StoredRecord = {
  ...input, id: localId, recordKind: 'standard', cloudRecordId: cloudId,
  embryoInventoryMovementId: usage.id, cloudSyncPending: false, cloudUpdatedAt: firstTime,
  createdAt: firstTime, updatedAt: firstTime,
};
const expense: ExpenseRecord & { cloudUpdatedAt: string } = {
  id: 'et-expense-fixture-procedure', syncRecordId: 'expense:et-expense-fixture-procedure',
  cloudSyncPending: false, cloudUpdatedAt: firstTime,
  paymentDate: '2026-11-01', category: '種付け・繁殖費', description: '移植料', vendor: '',
  amount: '1200', paymentMethod: '', target: 'ET-FIXTURE-COW ET経費検証牛',
  animalType: 'cattle', animalEarTag: 'ET-FIXTURE-COW', animalName: 'ET経費検証牛',
  sourceType: 'breeding', sourceId: localId, sourceDetail: 'transfer-procedure',
  memo: '確認済みの移植経費', createdAt: firstTime, updatedAt: firstTime,
};
type Queued = StoredRecord & { store: string; record: StoredRecord; movementIds: string[] };
type RequestRecord = { path: string; method: string; ifMatch?: string | null; sourcePending?: unknown; sourceQueued?: boolean };
let remote: CloudBreedingRecord;
let remoteExpense: StoredRecord;
let loseSourceAcknowledgement = false;
let requests: RequestRecord[];

const expenseBytes = async () => JSON.stringify(await getAllRecords('expenses'));
const readSource = () => getRecordById<Breeding & StoredRecord>('breedings', localId);
const readQueue = () => getRecordById<Queued>('metadata', queueId);

beforeEach(async () => {
  window.history.replaceState(null, '', '/breedings');
  window.localStorage.clear();
  window.sessionStorage.clear();
  for (const store of ['breedings', 'expenses', 'supplyInventory', 'metadata'] as const) await clearStore(store);
  await saveRecordPreservingTimestamps('supplyInventory', purchase);
  await saveRecordPreservingTimestamps('supplyInventory', usage);
  await saveRecordPreservingTimestamps('breedings', original);
  await saveRecordPreservingTimestamps('expenses', expense);
  const identity = getSupplySyncIdentity()!;
  await saveRecordPreservingTimestamps<SupplyInventorySyncState>('metadata', {
    id: SUPPLY_SYNC_STATE_ID, version: 1, ...identity,
    epoch: 'et-expense-fixture-epoch', revision: 35, baseline: [purchase, usage], pending: [],
  });
  bridge.sync.mockImplementation(async () => {
    const state = await getRecordById<SupplyInventorySyncState>('metadata', SUPPLY_SYNC_STATE_ID);
    if (!state) throw new Error('Fixture stock state is missing');
    await saveRecordPreservingTimestamps<SupplyInventorySyncState>('metadata', {
      ...state, revision: (state.revision ?? 35) + 1,
      baseline: await getAllRecords<SupplyMovement>('supplyInventory'), pending: [],
    });
    return retrySupplyLinkedRecords();
  });
  remote = { ...toCloudBreeding(original), cloudUpdatedAt: firstTime };
  remoteExpense = { ...expense, id: expense.syncRecordId! };
  loseSourceAcknowledgement = false;
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const request: RequestRecord = { path: String(url), method: init?.method ?? 'GET' };
    requests.push(request);
    if (request.path === sourcePath && request.method === 'GET') return Response.json(remote);
    if (request.path === sourcePath && request.method === 'PUT') {
      const headers = new Headers(init?.headers);
      request.ifMatch = headers.get('If-Match');
      if (headers.get('If-Match') !== JSON.stringify(remote.cloudUpdatedAt)) {
        return Response.json({ message: 'Fixture source revision changed' }, { status: 412 });
      }
      remote = { ...JSON.parse(String(init?.body)),
        cloudUpdatedAt: new Date(Math.max(Date.now(), Date.parse(String(remote.cloudUpdatedAt)) + 1)).toISOString() };
      if (loseSourceAcknowledgement) {
        loseSourceAcknowledgement = false;
        throw new TypeError('Fixture: source saved, acknowledgement lost');
      }
      return Response.json(remote);
    }
    if (request.path === sourceDeletePath && request.method === 'DELETE') {
      request.ifMatch = new Headers(init?.headers).get('If-Match');
      if (request.ifMatch !== JSON.stringify(remote.cloudUpdatedAt)) {
        return Response.json({ message: 'Fixture source revision changed' }, { status: 412 });
      }
      if (!remote.deletedAt) {
        const revision = new Date(Math.max(Date.now(), Date.parse(String(remote.cloudUpdatedAt)) + 1)).toISOString();
        remote = { ...remote, deletedAt: revision, cloudUpdatedAt: revision };
      }
      if (loseSourceAcknowledgement) {
        loseSourceAcknowledgement = false;
        throw new TypeError('Fixture: source deleted, acknowledgement lost');
      }
      return new Response(null, { status: 204 });
    }
    if (request.path.startsWith('/api/expenses/record-sync/') && request.method === 'PUT') {
      request.sourcePending = (await readSource())?.cloudSyncPending;
      request.sourceQueued = await hasPendingSupplyLinkedRecord('breedings', cloudId);
      remoteExpense = { ...JSON.parse(String(init?.body)), id: expense.syncRecordId!, cloudUpdatedAt: nextTime };
      return Response.json(remoteExpense);
    }
    if (request.path.startsWith('/api/expenses/record-sync/') && request.method === 'DELETE') {
      remoteExpense = { ...remoteExpense, deletedAt: nextTime, cloudUpdatedAt: nextTime };
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${request.path}`);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('rejects an ET deletion before deleting its expenses or stock usage when a peer changed the remote source', async () => {
  remote = { ...remote, transferProcedureCost: '4500', note: '別端末で確定した削除しない移植記録', updatedAt: nextTime, cloudUpdatedAt: nextTime };
  const cloudBefore = JSON.stringify(remote);
  const expenseBefore = await expenseBytes();
  const remoteExpenseBefore = JSON.stringify(remoteExpense);
  const inventoryBefore = JSON.stringify(await getAllRecords<SupplyMovement>('supplyInventory'));

  const result = await deleteBreeding(localId).catch(error => error);

  expect.soft(result).toBeInstanceOf(BreedingSyncConflictError);
  expect.soft(await readSource()).toMatchObject({
    id: localId, transferProcedureCost: original.transferProcedureCost, note: original.note,
    embryoInventoryMovementId: usage.id, embryoInventoryBatchKey: original.embryoInventoryBatchKey,
  });
  expect.soft(await expenseBytes()).toBe(expenseBefore);
  expect.soft(JSON.stringify(remoteExpense)).toBe(remoteExpenseBefore);
  expect.soft(JSON.stringify(await getAllRecords<SupplyMovement>('supplyInventory'))).toBe(inventoryBefore);
  expect.soft(JSON.stringify(remote)).toBe(cloudBefore);
  expect.soft(requests).toContainEqual({ path: sourcePath, method: 'GET' });
  expect.soft(requests.filter(request => request.path.startsWith('/api/expenses/') && request.method === 'DELETE')).toEqual([]);
  expect.soft(requests.filter(request => request.path.startsWith('/api/supply') && request.method === 'PUT')).toEqual([]);
  // The stock sync bridge would acknowledge the actual local stock snapshot.
  // Rejecting before it is called proves no stock mutation can be uploaded.
  expect(bridge.sync).not.toHaveBeenCalled();
});

it('keeps ET expenses and stock after a lost deletion acknowledgement and removes them once on an explicit retry', async () => {
  const expenseBefore = await expenseBytes();
  const remoteExpenseBefore = JSON.stringify(remoteExpense);
  const inventoryBefore = JSON.stringify(await getAllRecords<SupplyMovement>('supplyInventory'));
  loseSourceAcknowledgement = true;

  const first = await deleteBreeding(localId).catch(error => error);

  expect.soft(first).toBeInstanceOf(Error);
  expect.soft(remote.deletedAt).toBeDefined();
  expect.soft(await readSource()).toMatchObject({
    id: localId, note: original.note, transferProcedureCost: original.transferProcedureCost,
    embryoInventoryMovementId: usage.id, cloudSyncPending: true, breedingSyncDeletePending: true,
  });
  expect.soft(await expenseBytes()).toBe(expenseBefore);
  expect.soft(JSON.stringify(remoteExpense)).toBe(remoteExpenseBefore);
  expect.soft(JSON.stringify(await getAllRecords<SupplyMovement>('supplyInventory'))).toBe(inventoryBefore);
  expect.soft(requests.filter(request => request.path.startsWith('/api/expenses/'))).toEqual([]);
  expect.soft(bridge.sync).not.toHaveBeenCalled();
  const acceptedDeletion = JSON.stringify(remote);

  await deleteBreeding(localId);

  expect(await readSource()).toBeUndefined();
  expect(await getAllRecords('expenses')).toEqual([]);
  expect(remoteExpense.deletedAt).toBeDefined();
  expect(JSON.stringify(remote)).toBe(acceptedDeletion);
  expect(await readQueue()).toBeUndefined();
  expect(await getAllRecords<SupplyMovement>('supplyInventory')).toEqual([purchase]);
  expect(getSupplyBatches(await getAllRecords<SupplyMovement>('supplyInventory'), '受精卵')[0].balance).toBe(2);
  expect(bridge.sync).toHaveBeenCalledTimes(1);
  expect(requests.filter(request => request.path.startsWith('/api/expenses/') && request.method === 'DELETE')).toHaveLength(1);
  expect(requests.filter(request => request.method === 'PUT')).toEqual([]);
});

it('keeps an ET edit, its stock and queue without changing expenses when a peer changed the remote source', async () => {
  remote = { ...remote, transferProcedureCost: '4500', note: '別端末で確定した移植記録', updatedAt: nextTime, cloudUpdatedAt: nextTime };
  const cloudBefore = JSON.stringify(remote);
  const expenseBefore = await expenseBytes();
  const remoteExpenseBefore = JSON.stringify(remoteExpense);

  const result = await updateBreeding(localId, {
    ...input, transferProcedureCost: '2300', note: 'PCで入力した未確認の移植費',
  }).catch(error => error);

  expect.soft(result).toBeInstanceOf(BreedingSyncConflictError);
  expect.soft(await readSource()).toMatchObject({
    transferProcedureCost: '2300', note: 'PCで入力した未確認の移植費',
    embryoInventoryMovementId: usage.id, cloudSyncPending: true,
  });
  expect.soft(await readQueue()).toMatchObject({ store: 'breedings', record: { transferProcedureCost: '2300' }, movementIds: [usage.id] });
  const inventory = await getAllRecords<SupplyMovement>('supplyInventory');
  expect.soft(inventory.filter(row => row.action === '使用')).toHaveLength(1);
  expect.soft(getSupplyBatches(inventory, '受精卵')[0].balance).toBe(1);
  expect.soft(await expenseBytes()).toBe(expenseBefore);
  expect.soft(JSON.stringify(remoteExpense)).toBe(remoteExpenseBefore);
  expect.soft(JSON.stringify(remote)).toBe(cloudBefore);
  expect.soft(requests).toContainEqual({ path: sourcePath, method: 'GET' });
  expect(requests.filter(request => request.method !== 'GET')).toEqual([]);
});

it('handles a lost source acknowledgement before an explicit save resumes its expense, without consuming another embryo', async () => {
  const changed = { ...input, transferProcedureCost: '2300', note: '確認待ちの移植費' };
  const expenseBefore = await expenseBytes();
  loseSourceAcknowledgement = true;

  const first = await updateBreeding(localId, changed).catch(error => error);
  expect.soft(first).toBeInstanceOf(BreedingSyncConflictError);
  expect.soft(await readSource()).toMatchObject({ cloudSyncPending: true, transferProcedureCost: '2300' });
  expect.soft(await readQueue()).toBeDefined();
  expect.soft(await expenseBytes()).toBe(expenseBefore);
  expect.soft(requests.filter(request => request.path.startsWith('/api/expenses/'))).toEqual([]);
  const accepted = JSON.stringify(remote);
  const beforeReadback = requests.length;

  expect(await retrySupplyLinkedRecords()).toBe(true);
  expect(await readSource()).toMatchObject({ cloudSyncPending: false, transferProcedureCost: '2300' });
  expect(await readQueue()).toBeUndefined();
  expect(JSON.stringify(remote)).toBe(accepted);
  expect(requests.slice(beforeReadback).every(request => request.method === 'GET')).toBe(true);
  expect(await expenseBytes()).toBe(expenseBefore);

  const saved = await updateBreeding(localId, changed);
  expect(saved.cloudSyncPending).toBe(false);
  expect(await getAllRecords('expenses')).toMatchObject([{ id: expense.id, amount: '2300', sourceId: localId }]);
  const fees = requests.filter(request => request.path.startsWith('/api/expenses/') && request.method === 'PUT');
  expect(fees).toHaveLength(1);
  expect(fees[0]).toMatchObject({ sourcePending: false, sourceQueued: false });
  const inventory = await getAllRecords<SupplyMovement>('supplyInventory');
  expect(inventory.filter(row => row.action === '使用')).toHaveLength(1);
  expect(getSupplyBatches(inventory, '受精卵')[0].balance).toBe(1);
});

it('completes expenses when a normal pending save switches to farm-stock ET and its old attempt is confirmed', async () => {
  await deleteRecord('supplyInventory', usage.id);
  const state = (await getRecordById<SupplyInventorySyncState>('metadata', SUPPLY_SYNC_STATE_ID))!;
  await saveRecordPreservingTimestamps<SupplyInventorySyncState>('metadata', { ...state, baseline: [purchase], pending: [] });
  const base = {
    ...original, embryoSource: 'external', embryoInventoryMovementId: undefined,
    embryoInventoryBatchKey: undefined, note: '在庫を使わない確認済みA',
  };
  const attempt = {
    ...base, transferProcedureCost: '1800', note: '通常保存BのACKだけ未確認',
    updatedAt: nextTime, cloudSyncPending: true,
    localBusinessReference: { reference: '保護する既存の業務情報', amount: '990' },
  };
  await saveRecordPreservingTimestamps('breedings', {
    ...attempt,
    breedingSyncBase: { version: 1, record: toCloudBreeding(base), cloudUpdatedAt: firstTime },
    breedingSyncAttempt: { version: 1, record: toCloudBreeding(attempt) },
  });
  remote = { ...toCloudBreeding(attempt), cloudUpdatedAt: '2026-11-02T00:00:00.001Z' };
  const acceptedRevision = remote.cloudUpdatedAt;

  const saved = await updateBreeding(localId, {
    ...input, transferProcedureCost: '2300', note: 'Bの確認後に農場在庫へ切り替えたC',
  });

  expect(saved.cloudSyncPending).toBe(false);
  const source = await readSource();
  expect(source).toMatchObject({
    embryoSource: 'farm_stock', embryoInventoryMovementId: usage.id, transferProcedureCost: '2300',
    note: 'Bの確認後に農場在庫へ切り替えたC',
    localBusinessReference: attempt.localBusinessReference,
  });
  expect(source).not.toHaveProperty('breedingSyncBase');
  expect(source).not.toHaveProperty('breedingSyncAttempt');
  expect(await readQueue()).toBeUndefined();
  expect(requests.filter(request => request.path === sourcePath && request.method === 'PUT'))
    .toEqual([{ path: sourcePath, method: 'PUT', ifMatch: JSON.stringify(acceptedRevision) }]);
  expect(await getAllRecords('expenses')).toMatchObject([{ id: expense.id, amount: '2300', sourceId: localId }]);
  const fees = requests.filter(request => request.path.startsWith('/api/expenses/') && request.method === 'PUT');
  expect(fees).toHaveLength(1);
  expect(fees[0]).toMatchObject({ sourcePending: false, sourceQueued: false });
  const inventory = await getAllRecords<SupplyMovement>('supplyInventory');
  expect(inventory.filter(row => row.action === '使用')).toHaveLength(1);
  expect(getSupplyBatches(inventory, '受精卵')[0].balance).toBe(1);
});
