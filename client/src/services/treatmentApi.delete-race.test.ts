import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, deleteRecord, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { Treatment, TreatmentInput } from '../types/treatment';
import { deleteTreatment, getTreatmentList, TreatmentSyncConflictError, updateTreatment } from './treatmentApi';
import { createSupplyMovement, getSupplyBatches, type SupplyInput, type SupplyMovement } from './supplyInventoryApi';
import { hasPendingSupplyLinkedRecord } from './supplyInventoryLinkedSync';

vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'standard' }));
vi.mock('./authClient', () => ({
  getAuthToken: () => 'fixture-treatment-race-token',
  getStoredAuthUser: () => ({ id: 'fixture-treatment-race-user', farmId: 'fixture-treatment-race-farm', plan: 'standard' }),
}));
// Stock saves and their linked queue remain real; this fixture holds transport
// offline so a pending ordinary DELETE cannot be hidden by a separate stock sync.
vi.mock('./supplyInventorySync', () => ({ syncSupplyInventorySafely: vi.fn(async () => false) }));

type SyncedTreatment = Treatment & { cloudUpdatedAt: string; cloudSyncPending: boolean };
const input: TreatmentInput = {
  targetNumber: 'FIXTURE-COW', targetName: '試験牛', treatmentDate: '2026-11-02',
  symptom: '試験症状', diagnosis: '', medicine: '', dosage: '', veterinarian: '',
  medicineSource: 'veterinarian', withdrawalEndDate: '', progress: '治療中', note: '削除開始時の原本',
};
const original: SyncedTreatment = {
  ...input, id: 123, syncRecordId: 'treatment:123', cloudSyncPending: false,
  cloudUpdatedAt: '2026-11-01T00:00:00.000Z', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};
const stockPurchase: SupplyInput = {
  kind: '医薬品', action: '購入', date: '2026-11-01', itemName: '試験薬', lotNumber: '', quantity: 10,
  unit: '分包', expiryDate: '', supplier: '', storageLocation: '試験棚', donorCow: '', sire: '', grade: '',
  cowEarTag: '', unitPrice: 0, amount: 0, paymentMethod: '', note: '',
};
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function useWebLocks() {
  const running = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: (name: string, optionsOrCallback: unknown, callback?: () => Promise<unknown>) => {
      const work = typeof optionsOrCallback === 'function' ? optionsOrCallback as () => Promise<unknown> : callback!;
      const result = (running.get(name) ?? Promise.resolve()).catch(() => undefined).then(work);
      running.set(name, result);
      return result;
    },
  } });
}
function heldDeletion() {
  const started = deferred<void>();
  const response = deferred<Response>();
  const deletedAt = '2026-11-03T00:00:00.000Z';
  const tombstone = { ...original, id: original.syncRecordId, deletedAt, cloudUpdatedAt: deletedAt };
  vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') { started.resolve(); return response.promise; }
    if (init?.method === 'PUT') {
      return Response.json({ ...JSON.parse(String(init.body)), deletedAt, cloudUpdatedAt: deletedAt });
    }
    return Response.json([tombstone]);
  }));
  return { started: started.promise, release: () => response.resolve(Response.json(tombstone)) };
}
async function read() { return getRecordById<SyncedTreatment>('treatments', original.id); }

beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  for (const store of ['treatments', 'supplyInventory', 'expenses', 'breedings', 'metadata'] as const) await clearStore(store);
  await saveRecordPreservingTimestamps('treatments', original);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks);
  else Reflect.deleteProperty(navigator, 'locks');
});

describe.each(['fallback', 'Web Locks'] as const)('ordinary treatment DELETE race with %s', mode => {
  beforeEach(() => { if (mode === 'Web Locks') useWebLocks(); });

  it('keeps a newer formal edit and rejects the later tombstone ACK before either form can change its expense', async () => {
    const cloud = heldDeletion();
    const deleteExpenseAfterSuccess = vi.fn();
    const updateExpenseAfterSuccess = vi.fn();
    const deleting = deleteTreatment(original.id).then(deleteExpenseAfterSuccess).catch(error => error);
    await cloud.started;
    const saving = updateTreatment(original.id, { ...input, note: 'DELETE待ち中の正式編集' })
      .then(updateExpenseAfterSuccess).catch(error => error);
    await vi.waitFor(async () => expect(await read()).toMatchObject({ note: 'DELETE待ち中の正式編集', cloudSyncPending: true }));
    const newer = await read();
    cloud.release();

    const [deleteResult, saveResult] = await Promise.all([deleting, saving]);

    expect.soft(deleteResult).toBeInstanceOf(TreatmentSyncConflictError);
    expect.soft(saveResult).toBeInstanceOf(TreatmentSyncConflictError);
    expect.soft(await read()).toEqual(newer);
    expect.soft(deleteExpenseAfterSuccess).not.toHaveBeenCalled();
    expect.soft(updateExpenseAfterSuccess).not.toHaveBeenCalled();
    expect(await getTreatmentList()).toEqual([newer]);
  });

  it.each([
    { name: 'old writer without a pending marker', changes: { note: '旧 writer の直接編集' } },
    { name: 'sync metadata only', changes: { cloudSyncPending: true, cloudUpdatedAt: '2026-11-02T00:00:00.000Z' } },
  ])('does not delete a newer row changed by $name', async ({ changes }) => {
    const cloud = heldDeletion();
    const deleteExpenseAfterSuccess = vi.fn();
    const deleting = deleteTreatment(original.id).then(deleteExpenseAfterSuccess).catch(error => error);
    await cloud.started;
    const newer = await saveRecordPreservingTimestamps('treatments', { ...original, ...changes });
    cloud.release();

    expect(await deleting).toBeInstanceOf(TreatmentSyncConflictError);
    expect(await read()).toEqual({ ...newer, cloudSyncPending: true });
    expect(deleteExpenseAfterSuccess).not.toHaveBeenCalled();
    expect(await getTreatmentList()).toEqual([{ ...newer, cloudSyncPending: true }]);
  });

  it('keeps an unmarked edit after a lost DELETE ACK and allows expense cleanup only after another explicit delete', async () => {
    const started = deferred<void>();
    const response = deferred<Response>();
    const tombstone = {
      ...original, id: original.syncRecordId,
      deletedAt: '2026-11-03T00:00:00.000Z', cloudUpdatedAt: '2026-11-03T00:00:00.000Z',
    };
    let deletes = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        if (++deletes === 1) { started.resolve(); return response.promise; }
        return Response.json(tombstone);
      }
      return Response.json([tombstone]);
    }));
    const deleteExpenseAfterSuccess = vi.fn();
    const deleting = deleteTreatment(original.id).then(deleteExpenseAfterSuccess).catch(error => error);
    await started.promise;
    const newer = await saveRecordPreservingTimestamps('treatments', {
      ...original, note: 'DELETE ACK 喪失前の旧 writer 編集', cloudSyncPending: false,
    });
    response.reject(new TypeError('DELETE ACK lost'));

    expect(await deleting).toEqual(expect.objectContaining({ message: 'DELETE ACK lost' }));
    expect(await read()).toEqual({ ...newer, cloudSyncPending: true });
    expect(await getTreatmentList()).toEqual([{ ...newer, cloudSyncPending: true }]);
    expect(deleteExpenseAfterSuccess).not.toHaveBeenCalled();

    await deleteTreatment(original.id).then(deleteExpenseAfterSuccess);
    expect(await read()).toBeUndefined();
    expect(deleteExpenseAfterSuccess).toHaveBeenCalledTimes(1);
    expect(deletes).toBe(2);
  });

  it('protects an unmarked edit made during a PUT that returns a tombstone from the next GET', async () => {
    const started = deferred<void>();
    const response = deferred<Response>();
    const tombstone = {
      ...original, id: original.syncRecordId,
      deletedAt: '2026-11-03T00:00:00.000Z', cloudUpdatedAt: '2026-11-03T00:00:00.000Z',
    };
    vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') { started.resolve(); return response.promise; }
      return Response.json([tombstone]);
    }));
    const updateExpenseAfterSuccess = vi.fn();
    const saving = updateTreatment(original.id, { ...input, note: 'PUT送信時の正式編集' })
      .then(updateExpenseAfterSuccess).catch(error => error);
    await started.promise;
    const pending = (await read())!;
    const newer = await saveRecordPreservingTimestamps('treatments', {
      ...pending, note: 'PUT応答待ち中の旧 writer 編集', cloudSyncPending: false,
    });
    response.resolve(Response.json(tombstone));

    expect(await saving).toBeInstanceOf(TreatmentSyncConflictError);
    expect(await read()).toEqual({ ...newer, cloudSyncPending: true });
    expect(await getTreatmentList()).toEqual([{ ...newer, cloudSyncPending: true }]);
    expect(updateExpenseAfterSuccess).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.map(([, init]) => init?.method ?? 'GET')).toEqual(['PUT', 'GET']);
  });

  it('keeps the treatment, stock usage and durable linked queue when an ordinary treatment changes to farm stock', async () => {
    await createSupplyMovement(stockPurchase, false);
    const [batch] = getSupplyBatches(await getAllRecords<SupplyMovement>('supplyInventory'), '医薬品');
    const cloud = heldDeletion();
    const deleteExpenseAfterSuccess = vi.fn();
    const deleting = deleteTreatment(original.id).then(deleteExpenseAfterSuccess).catch(error => error);
    await cloud.started;
    const newer = await updateTreatment(original.id, {
      ...input, medicineSource: 'farm_stock', medicine: '試験薬',
      medicineInventoryBatchKey: batch.key, medicineInventoryQuantity: 2,
    });
    const before = await getAllRecords<SupplyMovement>('supplyInventory');
    const metadata = await getAllRecords('metadata');
    expect(newer.medicineInventoryMovementId).toBeTruthy();
    expect(await hasPendingSupplyLinkedRecord('treatments', original.syncRecordId!)).toBe(true);
    cloud.release();

    expect(await deleting).toBeInstanceOf(TreatmentSyncConflictError);
    expect(deleteExpenseAfterSuccess).not.toHaveBeenCalled();
    expect(await read()).toEqual(newer);
    expect(await getAllRecords('supplyInventory')).toEqual(before);
    expect(before.filter(row => row.action === '使用')).toEqual([expect.objectContaining({
      id: newer.medicineInventoryMovementId, quantity: 2, cowEarTag: input.targetNumber,
    })]);
    expect(getSupplyBatches(before, '医薬品')).toEqual([expect.objectContaining({ balance: 8 })]);
    expect(await getAllRecords('metadata')).toEqual(metadata);
    expect(await hasPendingSupplyLinkedRecord('treatments', original.syncRecordId!)).toBe(true);
    expect(await getTreatmentList()).toEqual([newer]);
  });

  it('does not apply a live PUT acknowledgement over a newer metadata-only write', async () => {
    const started = deferred<void>();
    const response = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(async () => { started.resolve(); return response.promise; }));
    const updateExpenseAfterSuccess = vi.fn();
    const saving = updateTreatment(original.id, { ...input, note: 'PUT応答待ちの編集' })
      .then(updateExpenseAfterSuccess).catch(error => error);
    await started.promise;
    const pending = (await read())!;
    const newer = await saveRecordPreservingTimestamps('treatments', {
      ...pending, cloudUpdatedAt: '2026-11-04T00:00:00.000Z',
    });
    response.resolve(Response.json({
      ...pending, id: original.syncRecordId, cloudUpdatedAt: '2026-11-03T00:00:00.000Z',
    }));

    expect(await saving).toBeInstanceOf(TreatmentSyncConflictError);
    expect(await read()).toEqual(newer);
    expect(updateExpenseAfterSuccess).not.toHaveBeenCalled();
  });

  it.each([
    { localChange: 'edit', cloudChange: 'live' },
    { localChange: 'edit', cloudChange: 'tombstone' },
    { localChange: 'delete', cloudChange: 'live' },
    { localChange: 'delete', cloudChange: 'tombstone' },
  ])('does not overwrite a direct local $localChange with an older in-flight GET returning $cloudChange', async ({ localChange, cloudChange }) => {
    const started = deferred<void>();
    const response = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(async () => { started.resolve(); return response.promise; }));
    const loading = getTreatmentList();
    await started.promise;
    const newer = { ...original, note: 'GET応答待ち中に旧 writer が編集' };
    if (localChange === 'edit') await saveRecordPreservingTimestamps('treatments', newer);
    else await deleteRecord('treatments', original.id);
    response.resolve(Response.json([{
      ...original, id: original.syncRecordId, cloudUpdatedAt: '2026-11-03T00:00:00.000Z',
      note: 'GET開始時のクラウド内容',
      ...(cloudChange === 'tombstone' ? { deletedAt: '2026-11-03T00:00:00.000Z' } : {}),
    }]));

    expect(await loading).toEqual(localChange === 'edit' ? [newer] : []);
    expect(await getAllRecords('treatments')).toEqual(localChange === 'edit' ? [newer] : []);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('times out an unresolved DELETE response, keeps the record and releases the lock for a later explicit delete', async () => {
    const started = deferred<void>();
    const lateResponse = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce(async () => { started.resolve(); return lateResponse.promise; })
      .mockImplementation(async () => Response.json({
        id: original.syncRecordId, deletedAt: '2026-11-03T00:00:00.000Z', cloudUpdatedAt: '2026-11-03T00:00:00.000Z',
      })));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const deleting = deleteTreatment(original.id).catch(error => error);
    await started.promise;
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    await vi.advanceTimersByTimeAsync(12000);

    expect(await deleting).toEqual(expect.objectContaining({ message: expect.stringContaining('時間切れ') }));
    expect(signal.aborted).toBe(true);
    expect(await read()).toEqual({ ...original, cloudSyncPending: true });
    await deleteTreatment(original.id);
    expect(await read()).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);

    // Completion after the timeout cannot perform another local deletion.
    const replacement = { ...original, note: '再削除後の別記録' };
    await saveRecordPreservingTimestamps('treatments', replacement);
    lateResponse.resolve(Response.json({ id: original.syncRecordId }));
    await vi.advanceTimersByTimeAsync(0);
    expect(await read()).toEqual(replacement);
  });

  it('times out an unresolved PUT body, keeps the pending edit and lets a later save finish through the released lock', async () => {
    const bodyStarted = deferred<void>();
    const body = deferred<unknown>();
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce(async () => {
        const response = Response.json({});
        vi.spyOn(response, 'json').mockImplementation(() => { bodyStarted.resolve(); return body.promise; });
        return response;
      })
      .mockImplementation(async (_url: RequestInfo | URL, init?: RequestInit) => Response.json({
        ...JSON.parse(String(init?.body)), cloudUpdatedAt: '2026-11-03T00:00:00.000Z',
      })));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const saving = updateTreatment(original.id, { ...input, note: 'PUT body 応答待ちの編集' });
    await bodyStarted.promise;
    const pending = (await read())!;
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    await vi.advanceTimersByTimeAsync(12000);

    expect(await saving).toMatchObject({ note: pending.note, cloudSyncPending: true });
    expect(signal.aborted).toBe(true);
    expect(await read()).toEqual(pending);
    await updateTreatment(original.id, { ...input, note: '復帰後の正式編集' });
    const acknowledged = await read();
    expect(acknowledged).toMatchObject({ note: '復帰後の正式編集', cloudSyncPending: false });
    expect(fetch).toHaveBeenCalledTimes(2);

    body.resolve({ ...pending, id: original.syncRecordId, cloudUpdatedAt: '2026-11-02T00:00:00.000Z' });
    await vi.advanceTimersByTimeAsync(0);
    expect(await read()).toEqual(acknowledged);
  });
});
