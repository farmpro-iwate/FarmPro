import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { Breeding, BreedingInput } from '../types/breeding';
import { getBreedingList, getBreedingListForHomeSummary, getBreedingSyncStatus, retryPendingBreedingSync, updateBreeding } from './breedingApi';
import { batchKey, type SupplyMovement } from './supplyInventoryApi';
import { getSupplySyncIdentity, SUPPLY_SYNC_STATE_ID, type SupplyInventorySyncState } from './supplyInventorySyncState';
import { toCloudBreeding, type CloudBreedingRecord } from './breedingSyncProtocol';
import type { ExpenseRecord } from './expensesApi';

const context = vi.hoisted(() => ({ plan: 'standard' }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => context.plan }));
vi.mock('./authClient', () => ({
  getAuthToken: () => 'linked-free-edit-token',
  getStoredAuthUser: () => ({ id: 'linked-free-edit-user', farmId: 'linked-free-edit-farm' }),
}));

type Row = Breeding & StoredRecord;
const firstTime = '2026-11-01T00:00:00.000Z';
const localId = 'linked-free-edit-source';
const cloudId = 'cloud-linked-free-edit-source';
const purchase: SupplyMovement = {
  id: 'linked-free-edit-purchase', kind: '受精卵', action: '購入', date: '2026-10-28',
  itemName: '無料編集検証卵', lotNumber: 'FREE-EDIT-EMBRYO', quantity: 2, unit: '個',
  expiryDate: '', supplier: '', storageLocation: 'タンク1', donorCow: '', sire: '', grade: 'A',
  cowEarTag: '', unitPrice: 10000, amount: 20000, paymentMethod: '', note: '購入原本',
  expenseRecorded: false, createdAt: firstTime, updatedAt: firstTime,
};
const usage: SupplyMovement = { ...purchase, id: `embryo-stock-${localId}`, action: '使用', date: '2026-11-01',
  cowEarTag: 'LINKED-FREE-COW', quantity: 1, unitPrice: 0, amount: 0, note: '使用原本' };
const input = {
  cowEarTag: usage.cowEarTag, cowName: '在庫連動無料編集牛', heatDate: '2026-10-25',
  breedingMethod: '受精卵移植', breedingStatus: '移植実施',
  inseminationDate: '', inseminationCost: '', bullName: '', inseminatorName: '',
  transferDate: '2026-11-01', transferPlannedDate: '', transferCost: '', embryoCost: '0',
  transferProcedureCost: '01200', transferOtherCost: '', transferCancelReason: '',
  embryoNumber: purchase.lotNumber, embryoSource: 'farm_stock', embryoInventoryBatchKey: batchKey(purchase),
  supplierName: '', transferTechnician: '', embryoSireName: '', note: '在庫連動で確認済みのA',
} as BreedingInput;
const origin = { version: 1, farmId: 'linked-free-edit-farm', userId: 'linked-free-edit-user', ownerId: 'prior-ordinary-origin' };
const original: Row = { ...input, id: localId, recordKind: 'standard', cloudRecordId: cloudId,
  embryoInventoryMovementId: usage.id, cloudUpdatedAt: firstTime, cloudSyncPending: false,
  breedingSyncOrigin: origin, localHistory: { embryo: '00017', keep: null }, createdAt: firstTime, updatedAt: firstTime };
const expense: ExpenseRecord = {
  id: 'linked-free-edit-fee', syncRecordId: 'expense:linked-free-edit-fee', cloudSyncPending: false,
  paymentDate: input.transferDate, category: '種付け・繁殖費', description: '移植料', vendor: '',
  amount: '1200', paymentMethod: '', target: `${input.cowEarTag} ${input.cowName}`,
  animalType: 'cattle', animalEarTag: input.cowEarTag, animalName: input.cowName,
  sourceType: 'breeding', sourceId: localId, sourceDetail: 'transfer-procedure', memo: '既存費目',
  createdAt: firstTime, updatedAt: firstTime,
};
const freeInput = { ...input, transferDate: '2026-11-03', transferProcedureCost: '02300', note: 'Freeで確認した在庫連動C' };
const readSource = () => getRecordById<Row>('breedings', localId);
let remote: CloudBreedingRecord;
let calls: Array<{ path: string; method: string }>;
let stockState: SupplyInventorySyncState;

beforeEach(async () => {
  context.plan = 'standard';
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/breedings');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T01:00:00.000Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  for (const store of ['breedings', 'expenses', 'masters', 'metadata', 'supplyInventory'] as const) await clearStore(store);
  await saveRecordPreservingTimestamps('supplyInventory', purchase);
  await saveRecordPreservingTimestamps('supplyInventory', usage);
  await saveRecordPreservingTimestamps('breedings', original);
  await saveRecordPreservingTimestamps('expenses', expense);
  stockState = { id: SUPPLY_SYNC_STATE_ID, version: 1, ...getSupplySyncIdentity()!,
    epoch: 'linked-free-edit-epoch', revision: 7, baseline: [purchase, usage], pending: [] };
  stockState = await saveRecordPreservingTimestamps('metadata', stockState);
  localStorage.setItem('farmpro.breedingSyncOwner.linked-free-edit-farm', origin.ownerId);
  remote = { ...toCloudBreeding(original), cloudUpdatedAt: firstTime };
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const request = { path: String(url), method: init?.method ?? 'GET' };
    calls.push(request);
    if (request.path === '/api/breedings/record-sync' && request.method === 'GET') {
      return Response.json(remote.deletedAt ? [] : [remote]);
    }
    throw new Error(`Unexpected linked Free-edit request: ${request.method} ${request.path}`);
  }));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function freeEditAndResume() {
  context.plan = 'free';
  const saved = await updateBreeding(localId, freeInput) as Row;
  expect(getBreedingSyncStatus(saved)).toEqual({ pending: false });
  expect(calls).toEqual([]);
  const stock = await getAllRecords<SupplyMovement>('supplyInventory');
  expect(stock).toHaveLength(2);
  expect(stock.find(row => row.id === purchase.id)).toEqual(purchase);
  expect(stock.filter(row => row.action === '使用')).toEqual([expect.objectContaining({
    id: usage.id, quantity: 1, date: freeInput.transferDate, cowEarTag: input.cowEarTag,
  })]);
  const fees = await getAllRecords('expenses');
  expect(fees).toEqual([expect.objectContaining({ id: expense.id, amount: '2300' })]);
  expect(await getAllRecords('metadata')).toEqual([stockState]);
  context.plan = 'standard';
  return { saved, stock, fees };
}

describe('stock-linked breeding Free edits', () => {
  it.each(['newer record', 'deleted record'])('keeps Free C, its single stock use and its fee after a peer %s', async kind => {
    const { saved, stock, fees } = await freeEditAndResume();
    remote = kind === 'deleted record'
      ? { id: cloudId, deletedAt: '2026-11-04T00:00:00.000Z', cloudUpdatedAt: '2026-11-04T00:00:00.000Z' }
      : { ...remote, note: '別端末で更新したB', transferProcedureCost: '99000', cloudUpdatedAt: '2026-11-04T00:00:00.000Z' };

    expect(await getBreedingListForHomeSummary()).toEqual([saved]);
    expect(await getBreedingList()).toEqual([saved]);
    expect(await readSource()).toEqual(saved);
    expect(saved).toMatchObject({ ...freeInput, cloudSyncPending: true, cloudUpdatedAt: firstTime,
      localHistory: original.localHistory, createdAt: firstTime, updatedAt: '2026-11-03T01:00:00.000Z' });
    expect(saved.breedingSyncOrigin).toBeUndefined();
    expect(await retryPendingBreedingSync()).toBe(0);
    expect(calls.every(call => call.path === '/api/breedings/record-sync' && call.method === 'GET')).toBe(true);
    expect(await getAllRecords('supplyInventory')).toEqual(stock);
    expect(await getAllRecords('expenses')).toEqual(fees);
    expect(await getAllRecords('metadata')).toEqual([stockState]);
  });

  it('preserves an already-pending linked source and its proof without adopting its old ordinary retry origin', async () => {
    const pending: Row = { ...original, cloudUpdatedAt: undefined, cloudSyncPending: true,
      breedingSyncBase: { version: 1, record: null },
      breedingSyncAttempt: { version: 1, record: toCloudBreeding(original) } };
    await saveRecordPreservingTimestamps('breedings', pending);
    const { saved, stock, fees } = await freeEditAndResume();

    expect(await getBreedingListForHomeSummary()).toEqual([saved]);
    expect(await getBreedingList()).toEqual([saved]);
    expect(await readSource()).toMatchObject({ ...freeInput, cloudSyncPending: true,
      breedingSyncBase: pending.breedingSyncBase, breedingSyncAttempt: pending.breedingSyncAttempt });
    expect((await readSource())?.breedingSyncOrigin).toBeUndefined();
    expect(await retryPendingBreedingSync()).toBe(0);
    expect(calls.every(call => call.path === '/api/breedings/record-sync' && call.method === 'GET')).toBe(true);
    expect(await getAllRecords('supplyInventory')).toEqual(stock);
    expect(await getAllRecords('expenses')).toEqual(fees);
    expect(await getAllRecords('metadata')).toEqual([stockState]);
  });
});
