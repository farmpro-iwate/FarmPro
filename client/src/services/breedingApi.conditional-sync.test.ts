import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { BreedingInput } from '../types/breeding';
import { BreedingSyncConflictError, createBreeding, deleteBreeding, updateBreeding } from './breedingApi';
import { toCloudBreeding } from './breedingSyncProtocol';
import type { ExpenseRecord } from './expensesApi';
import { batchKey, type SupplyMovement } from './supplyInventoryApi';
import { getSupplySyncIdentity } from './supplyInventorySyncState';

vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'standard' }));
vi.mock('./authClient', () => ({
  getAuthToken: () => 'conditional-breeding-fixture-token',
  getStoredAuthUser: () => ({ id: 'conditional-breeding-user', farmId: 'conditional-breeding-farm' }),
}));
vi.mock('./supplyInventorySync', () => ({ syncSupplyInventorySafely: vi.fn(async () => false) }));

const input = {
  cowEarTag: 'CONDITION-FIXTURE-COW', cowName: '条件検証牛', heatDate: '2026-11-01',
  breedingMethod: '種付', breedingStatus: '種付実施', inseminationDate: '2026-11-02', inseminationCost: '10000',
  bullName: '', inseminatorName: '', note: '原本A',
} as BreedingInput;
const revisionA = '2026-11-01T00:00:00.000Z';
const original = {
  ...input, id: 321, recordKind: 'standard', cloudRecordId: 'cloud-conditional-321', cloudSyncPending: false,
  cloudUpdatedAt: revisionA, createdAt: revisionA, updatedAt: revisionA,
  localHistory: { calvingId: 'local-history-must-survive' },
};
const expense: ExpenseRecord = {
  id: 'conditional-expense', syncRecordId: 'expense:conditional-expense', cloudSyncPending: false,
  paymentDate: '2026-11-02', category: '種付け・繁殖費', description: '人工授精・種付費', vendor: '',
  amount: '10000', paymentMethod: '', target: 'CONDITION-FIXTURE-COW 条件検証牛', memo: '原本経費',
  sourceType: 'breeding', sourceId: '321', sourceDetail: 'insemination', animalType: 'cattle',
  animalEarTag: input.cowEarTag, animalName: input.cowName, createdAt: revisionA, updatedAt: revisionA,
};
type RequestLog = { path: string; method: string; headers: Headers; body?: StoredRecord };
type Fixture = {
  remote: StoredRecord | null; calls: RequestLog[];
  beforeGet?: (fixture: Fixture) => void;
  beforePut?: (number: number, fixture: Fixture) => void;
  beforeDelete?: (fixture: Fixture) => void;
  loseAckAt?: number; failAt?: number; deleteStatus?: number;
};

function serve(): Fixture {
  const fixture: Fixture = { remote: { ...original, id: original.cloudRecordId }, calls: [] };
  let puts = 0;
  const conditionMatches = (request: RequestLog) => fixture.remote
    ? request.headers.get('If-Match') === JSON.stringify(fixture.remote.cloudUpdatedAt)
    : request.headers.get('If-None-Match') === '*';
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const request: RequestLog = {
      path: String(url), method: init?.method ?? 'GET', headers: new Headers(init?.headers),
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    };
    fixture.calls.push(request);
    if (request.path.startsWith('/api/breedings/record-sync/')) {
      if (request.method === 'GET') {
        fixture.beforeGet?.(fixture);
        return fixture.remote ? Response.json(fixture.remote) : new Response(null, { status: 404 });
      }
      if (request.method === 'PUT') {
        const count = ++puts;
        fixture.beforePut?.(count, fixture);
        if (fixture.remote?.deletedAt) return Response.json({ message: '削除済みです' }, { status: 409 });
        if (!conditionMatches(request)) return Response.json({ message: '別端末の変更があります' }, { status: 412 });
        if (fixture.failAt === count) return Response.json({ message: '一時的な送信失敗' }, { status: 503 });
        fixture.remote = { ...request.body!, cloudUpdatedAt: `2026-11-03T00:00:00.00${count}Z` };
        if (fixture.loseAckAt === count) throw new TypeError('PUT ACK lost');
        return Response.json(fixture.remote);
      }
    }
    if (request.path === `/api/breedings/${original.cloudRecordId}` && request.method === 'DELETE') {
      fixture.beforeDelete?.(fixture);
      if (fixture.deleteStatus) return new Response(null, { status: fixture.deleteStatus });
      if (!conditionMatches(request)) return Response.json({ message: '削除条件が一致しません' }, { status: 412 });
      fixture.remote = { id: original.cloudRecordId, deletedAt: '2026-11-04T00:00:00.000Z', cloudUpdatedAt: '2026-11-04T00:00:00.000Z' };
      return new Response(null, { status: 204 });
    }
    if (request.path.startsWith('/api/expenses/record-sync/')) {
      return Response.json({ ...request.body, id: decodeURIComponent(request.path.split('/').pop()!), cloudUpdatedAt: '2026-11-04T00:00:00.000Z' });
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${request.path}`);
  }));
  return fixture;
}
const breedingPuts = (fixture: Fixture) => fixture.calls.filter(call => call.path.startsWith('/api/breedings/') && call.method === 'PUT');
const expenseWrites = (fixture: Fixture) => fixture.calls.filter(call => call.path.startsWith('/api/expenses/') && call.method !== 'GET');
const read = () => getRecordById<StoredRecord>('breedings', original.id);

async function seedPendingLinkedDelete(fixture: Fixture) {
  const purchase: SupplyMovement = {
    id: 'conditional-embryo-purchase', kind: '受精卵', action: '購入', date: '2026-11-01',
    itemName: '削除条件検証卵', lotNumber: 'CONDITIONAL-EMBRYO', quantity: 2, unit: '個',
    expiryDate: '', supplier: '', storageLocation: '', donorCow: '', sire: '', grade: '',
    cowEarTag: '', unitPrice: 0, amount: 0, paymentMethod: '', note: '隔離fixture',
    expenseRecorded: false, createdAt: revisionA, updatedAt: revisionA,
  };
  const usage: SupplyMovement = {
    ...purchase, id: `embryo-stock-${original.id}`, action: '使用', quantity: 1, cowEarTag: input.cowEarTag,
  };
  const queuedSource = {
    ...original, breedingMethod: '受精卵移植', breedingStatus: '移植実施',
    embryoSource: 'farm_stock', embryoNumber: purchase.lotNumber, transferDate: '2026-11-02',
    embryoInventoryMovementId: usage.id, embryoInventoryBatchKey: batchKey(purchase),
    note: '未送信のC', cloudSyncPending: true, updatedAt: '2026-11-02T01:00:00.000Z',
  };
  const attempt = toCloudBreeding({ ...queuedSource, note: '応答を受け取れなかったB', updatedAt: '2026-11-02T00:00:00.000Z' });
  const queue = {
    id: `supply-linked-sync:breedings:${original.cloudRecordId}`, version: 1,
    operationId: 'conditional-source-C', ...getSupplySyncIdentity()!,
    store: 'breedings', sourceId: original.id, cloudId: original.cloudRecordId,
    record: queuedSource, movementIds: [usage.id], deleted: false,
    breedingSyncBase: { version: 1, record: toCloudBreeding(original), cloudUpdatedAt: revisionA },
    breedingSyncAttempt: { version: 1, record: attempt },
  };
  // A previous failed deletion marks the current source, but does not rewrite
  // its owned stock queue. Only that marker may differ from the queued source.
  const source = { ...queuedSource, breedingSyncDeletePending: true };
  await saveRecordPreservingTimestamps('breedings', source);
  await saveRecordPreservingTimestamps('supplyInventory', purchase);
  await saveRecordPreservingTimestamps('supplyInventory', usage);
  await saveRecordPreservingTimestamps('metadata', queue);
  fixture.remote = { ...attempt, cloudUpdatedAt: '2026-11-02T00:30:00.000Z' };
  return { source, queue, purchase, usage };
}

beforeEach(async () => {
  window.localStorage.clear(); window.sessionStorage.clear();
  for (const store of ['breedings', 'expenses', 'masters', 'supplyInventory', 'metadata'] as const) await clearStore(store);
  await saveRecordPreservingTimestamps('breedings', original);
  await saveRecordPreservingTimestamps('expenses', expense);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('conditional breeding saves and explicit retries', () => {
  it('keeps a peer edit and expenses when the remote changes between readback and PUT', async () => {
    const fixture = serve();
    const peer = { ...fixture.remote!, note: '別端末の新編集', inseminationCost: '45000', cloudUpdatedAt: '2026-11-03T01:00:00.000Z' };
    fixture.beforePut = () => { fixture.remote = peer; };

    await expect(updateBreeding(original.id, { ...input, note: 'この端末の編集', inseminationCost: '23000' })).rejects.toBeInstanceOf(BreedingSyncConflictError);

    expect(fixture.remote).toEqual(peer);
    expect(await read()).toMatchObject({ note: 'この端末の編集', inseminationCost: '23000', cloudSyncPending: true });
    expect(await getAllRecords('expenses')).toEqual([expense]);
    expect(breedingPuts(fixture)).toHaveLength(1);
    expect(breedingPuts(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(revisionA));
    expect(expenseWrites(fixture)).toEqual([]);
  });

  it('keeps the confirmed B base after its lost ACK, C failure and a later formal retry', async () => {
    const fixture = serve();
    fixture.loseAckAt = 1; fixture.failAt = 2;
    await expect(updateBreeding(original.id, { ...input, note: 'B', inseminationCost: '20000' })).rejects.toThrow('PUT ACK lost');
    const confirmedB = structuredClone(fixture.remote!);
    expect(await getAllRecords('expenses')).toEqual([expense]);

    await expect(updateBreeding(original.id, { ...input, note: 'C', inseminationCost: '30000' })).rejects.toThrow('一時的な送信失敗');
    expect(fixture.remote).toEqual(confirmedB);
    expect(await read()).toMatchObject({ cloudSyncPending: true, breedingSyncBase: { record: confirmedB, cloudUpdatedAt: confirmedB.cloudUpdatedAt } });
    expect(await getAllRecords('expenses')).toEqual([expense]);

    const saved = await updateBreeding(original.id, { ...input, note: 'C', inseminationCost: '30000' });

    expect(saved).toMatchObject({ id: original.id, note: 'C', inseminationCost: '30000', cloudSyncPending: false, localHistory: original.localHistory });
    expect(await read()).not.toHaveProperty('breedingSyncBase');
    expect(await read()).not.toHaveProperty('breedingSyncAttempt');
    expect(fixture.remote).toMatchObject({ id: original.cloudRecordId, note: 'C', inseminationCost: '30000' });
    expect(breedingPuts(fixture).map(call => call.headers.get('If-Match'))).toEqual([
      JSON.stringify(revisionA), JSON.stringify(confirmedB.cloudUpdatedAt), JSON.stringify(confirmedB.cloudUpdatedAt),
    ]);
    expect(await getAllRecords('expenses')).toEqual([expect.objectContaining({ id: expense.id, sourceId: '321', amount: '30000' })]);
    expect(expenseWrites(fixture)).toHaveLength(1);
  });

  it('does not treat a peer replacement of a lost attempt as an acknowledged base', async () => {
    const fixture = serve(); fixture.loseAckAt = 1;
    await expect(updateBreeding(original.id, { ...input, note: 'B', inseminationCost: '20000' })).rejects.toThrow('PUT ACK lost');
    fixture.remote = { ...fixture.remote!, inseminationCost: '99000', cloudUpdatedAt: '2026-11-04T00:00:00.000Z' };
    const peer = structuredClone(fixture.remote);

    await expect(updateBreeding(original.id, { ...input, note: 'C', inseminationCost: '30000' })).rejects.toBeInstanceOf(BreedingSyncConflictError);

    expect(fixture.remote).toEqual(peer);
    expect(breedingPuts(fixture)).toHaveLength(1);
    expect(await read()).toMatchObject({ note: 'C', inseminationCost: '30000', cloudSyncPending: true });
    expect(await getAllRecords('expenses')).toEqual([expense]);
    expect(expenseWrites(fixture)).toEqual([]);
  });

  it('uses the stable legacy date as its condition while preserving local history and numeric ID', async () => {
    const { cloudUpdatedAt: _revision, ...legacy } = original;
    await saveRecordPreservingTimestamps('breedings', legacy);
    const fixture = serve();
    fixture.remote = { ...legacy, id: original.cloudRecordId, cloudUpdatedAt: legacy.updatedAt };

    await updateBreeding(original.id, { ...input, inseminationCost: '25000' });

    const put = breedingPuts(fixture)[0];
    expect(put.headers.get('If-Match')).toBe(JSON.stringify(legacy.updatedAt));
    for (const key of ['localHistory', 'recordKind', 'breedingSyncBase']) expect(put.body).not.toHaveProperty(key);
    expect(put.body).toMatchObject({ id: original.cloudRecordId, bullMasterId: null, embryoInventoryMovementId: null });
    expect(await read()).toMatchObject({ id: 321, cloudRecordId: original.cloudRecordId, localHistory: original.localHistory, createdAt: original.createdAt });
  });

  it('uses create-only delivery for a new record without sending local synchronization metadata', async () => {
    await clearStore('breedings'); await clearStore('expenses');
    const fixture = serve(); fixture.remote = null;

    const saved = await createBreeding(input);

    expect(breedingPuts(fixture)).toHaveLength(1);
    expect(breedingPuts(fixture)[0].headers.get('If-None-Match')).toBe('*');
    expect(breedingPuts(fixture)[0].headers.has('If-Match')).toBe(false);
    expect(breedingPuts(fixture)[0].body).not.toHaveProperty('cloudSyncPending');
    expect(breedingPuts(fixture)[0].body).not.toHaveProperty('breedingSyncAttempt');
    expect(saved).toMatchObject({ id: fixture.remote!.id, cloudSyncPending: false });
  });

  it('does not clean up local records or expenses when a peer wins the DELETE condition', async () => {
    const fixture = serve();
    const peer = { ...fixture.remote!, note: '削除前に別端末が更新', inseminationCost: '44000', cloudUpdatedAt: '2026-11-04T00:00:00.000Z' };
    fixture.beforeDelete = () => { fixture.remote = peer; };

    await expect(deleteBreeding(original.id)).rejects.toBeInstanceOf(BreedingSyncConflictError);

    expect(fixture.remote).toEqual(peer);
    expect(await read()).toMatchObject({ id: original.id, cloudSyncPending: true, breedingSyncDeletePending: true });
    expect(await getAllRecords('expenses')).toEqual([expense]);
    const deletes = fixture.calls.filter(call => call.path.startsWith('/api/breedings/') && call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].headers.get('If-Match')).toBe(JSON.stringify(revisionA));
    expect(expenseWrites(fixture)).toEqual([]);
  });

  it('uses an owned linked attempt B to delete pending C only after confirming remote B', async () => {
    const fixture = serve();
    const { queue, purchase } = await seedPendingLinkedDelete(fixture);
    const confirmedRevision = fixture.remote!.cloudUpdatedAt;

    await deleteBreeding(original.id);

    expect(fixture.remote!.deletedAt).toBeDefined();
    expect(await read()).toBeUndefined();
    expect(await getAllRecords('expenses')).toEqual([]);
    expect(await getAllRecords('supplyInventory')).toEqual([purchase]);
    expect(await getRecordById('metadata', queue.id)).toMatchObject({ deleted: true, sourceId: original.id });
    const deletes = fixture.calls.filter(call => call.path.startsWith('/api/breedings/') && call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].headers.get('If-Match')).toBe(JSON.stringify(confirmedRevision));
    expect(breedingPuts(fixture)).toEqual([]);
    expect(expenseWrites(fixture)).toEqual([expect.objectContaining({ method: 'DELETE' })]);
  });

  it.each(['source mismatch', 'other owner'] as const)('rejects an untrusted linked deletion history: %s', async reason => {
    const fixture = serve();
    const { source, queue } = await seedPendingLinkedDelete(fixture);
    const untrusted = reason === 'other owner' ? { ...queue, ownerId: 'another-device-owner' } : {
      ...queue, record: { ...queue.record, localHistory: { calvingId: 'different-unknown-business-history' } },
    };
    const storedQueue = await saveRecordPreservingTimestamps('metadata', untrusted);
    const stockBefore = await getAllRecords('supplyInventory');
    const remoteBefore = structuredClone(fixture.remote);

    await expect(deleteBreeding(original.id)).rejects.toThrow('送信待ち原本を確認できません');

    expect(await read()).toEqual(source);
    expect(await getAllRecords('expenses')).toEqual([expense]);
    expect(await getAllRecords('supplyInventory')).toEqual(stockBefore);
    expect(await getRecordById('metadata', queue.id)).toEqual(storedQueue);
    expect(fixture.remote).toEqual(remoteBefore);
    expect(fixture.calls).toEqual([]);
  });

  it('keeps the source and fees when DELETE returns 404 without confirming a missing tombstone', async () => {
    const fixture = serve(); fixture.remote = null; fixture.deleteStatus = 404;

    await expect(deleteBreeding(original.id)).rejects.toThrow('404');

    expect(await read()).toEqual({ ...original, cloudSyncPending: true, breedingSyncDeletePending: true });
    expect(await getAllRecords('expenses')).toEqual([expense]);
    expect(fixture.remote).toBeNull();
    const deletes = fixture.calls.filter(call => call.path.startsWith('/api/breedings/') && call.method === 'DELETE');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].headers.get('If-None-Match')).toBe('*');
    expect(expenseWrites(fixture)).toEqual([]);
  });

  it('stops a linked deletion if its owner changes while the remote readback is in flight', async () => {
    const fixture = serve();
    const { source, queue } = await seedPendingLinkedDelete(fixture);
    const storedQueue = await getRecordById('metadata', queue.id);
    const stockBefore = await getAllRecords('supplyInventory');
    const remoteBefore = structuredClone(fixture.remote);
    fixture.beforeGet = () => {
      window.localStorage.setItem('farmpro.supplySyncOwner.conditional-breeding-farm', 'replacement-device-owner');
    };

    await expect(deleteBreeding(original.id)).rejects.toThrow('同期状態が変わりました');

    expect(await read()).toEqual(source);
    expect(await getAllRecords('expenses')).toEqual([expense]);
    expect(await getAllRecords('supplyInventory')).toEqual(stockBefore);
    expect(await getRecordById('metadata', queue.id)).toEqual(storedQueue);
    expect(fixture.remote).toEqual(remoteBefore);
    expect(fixture.calls).toEqual([expect.objectContaining({ method: 'GET' })]);
  });
});
