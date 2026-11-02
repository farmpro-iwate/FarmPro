import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { TreatmentInput } from '../types/treatment';
import {
  createManyTreatments, createTreatment, deleteTreatment, getTreatmentList, getTreatmentSyncStatus,
  retryPendingTreatmentSync, TreatmentSyncConflictError, updateTreatment,
} from './treatmentApi';
import { toCloudTreatment, type CloudTreatmentRecord } from './treatmentSyncProtocol';
import { batchKey, type SupplyMovement } from './supplyInventoryApi';

const context = vi.hoisted(() => ({ plan: 'standard', token: 'conditional-treatment-token' }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => context.plan }));
vi.mock('./authClient', () => ({
  getAuthToken: () => context.token,
  getStoredAuthUser: () => ({ id: 'conditional-treatment-user', farmId: 'conditional-treatment-farm' }),
}));
vi.mock('./supplyInventorySync', () => ({ syncSupplyInventorySafely: vi.fn(async () => false) }));

const revisionA = '2026-11-01T00:00:00.000Z';
const input: TreatmentInput = {
  targetNumber: 'CONDITIONAL-TREATMENT-COW', targetName: '条件検証牛', treatmentDate: '2026-11-02',
  symptom: '検証症状', diagnosis: '', medicine: '検証薬', medicineSource: 'veterinarian',
  dosage: '1', withdrawalEndDate: '', veterinarian: '', progress: '治療中', note: '原本A',
  medicineCost: '1000', medicalFee: '2000',
};
const original = {
  ...input, id: 321, syncRecordId: 'treatment:conditional-321', cloudSyncPending: false,
  cloudUpdatedAt: revisionA, createdAt: revisionA, updatedAt: revisionA,
  localHistory: { followup: ['unknown-business-must-survive'] },
  diseaseMasterId: 11, treatmentCourseId: 'treatment:earlier-course',
};
type RequestLog = { path: string; method: string; headers: Headers; body?: StoredRecord };
type Fixture = {
  remote: CloudTreatmentRecord | null; calls: RequestLog[];
  beforePut?: (fixture: Fixture) => void; beforeDelete?: (fixture: Fixture) => void;
  losePutAck?: number; failPut?: number; loseDeleteAck?: boolean; deleteStatus?: number;
};
const sourcePath = `/api/treatments/record-sync/${encodeURIComponent(original.syncRecordId)}`;

function serve(): Fixture {
  const fixture: Fixture = { remote: { ...toCloudTreatment(original), cloudUpdatedAt: revisionA }, calls: [] };
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
    if (request.path === '/api/treatments/record-sync' && request.method === 'GET') return Response.json(fixture.remote ? [fixture.remote] : []);
    if (request.method === 'GET') return fixture.remote ? Response.json(fixture.remote) : new Response(null, { status: 404 });
    if (request.method === 'PUT') {
      const count = ++puts;
      fixture.beforePut?.(fixture);
      if (fixture.remote?.deletedAt) return Response.json({ message: '治療は削除済みです' }, { status: 409 });
      if (!conditionMatches(request)) return Response.json({ message: '別端末の変更があります' }, { status: 412 });
      if (fixture.failPut === count) return Response.json({ message: '送信を確認できません' }, { status: 503 });
      fixture.remote = { ...request.body!, id: String(request.body!.id), cloudUpdatedAt: `2026-11-03T00:00:00.00${count}Z` };
      if (fixture.losePutAck === count) throw new TypeError('PUT ACK lost');
      return Response.json(fixture.remote);
    }
    if (request.method === 'DELETE') {
      fixture.beforeDelete?.(fixture);
      if (fixture.deleteStatus) return new Response(null, { status: fixture.deleteStatus });
      if (!conditionMatches(request)) return Response.json({ message: '削除条件が一致しません' }, { status: 412 });
      fixture.remote = { id: original.syncRecordId, deletedAt: '2026-11-04T00:00:00.000Z', cloudUpdatedAt: '2026-11-04T00:00:00.000Z' };
      if (fixture.loseDeleteAck) { fixture.loseDeleteAck = false; throw new TypeError('DELETE ACK lost'); }
      return Response.json(fixture.remote);
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${request.path}`);
  }));
  return fixture;
}
const writes = (fixture: Fixture) => fixture.calls.filter(call => call.method !== 'GET');
const read = () => getRecordById<StoredRecord>('treatments', original.id);

beforeEach(async () => {
  context.plan = 'standard';
  context.token = 'conditional-treatment-token';
  window.history.replaceState(null, '', '/treatments');
  window.localStorage.clear(); window.sessionStorage.clear();
  for (const store of ['treatments', 'expenses', 'calves', 'metadata', 'supplyInventory'] as const) await clearStore(store);
  await saveRecordPreservingTimestamps('treatments', original);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('conditional treatment synchronization', () => {
  it('keeps a stale local edit pending and stops its expense continuation before overwriting a peer', async () => {
    const fixture = serve();
    fixture.remote = { ...fixture.remote!, medicineCost: '8000', medicalFee: '9000', note: '別端末の新編集', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' };
    const peer = structuredClone(fixture.remote);
    const expenses = vi.fn();

    await expect(updateTreatment(original.id, { ...input, note: 'この端末の入力', medicineCost: '4000' }).then(expenses)).rejects.toBeInstanceOf(TreatmentSyncConflictError);

    expect(fixture.remote).toEqual(peer);
    expect(await read()).toMatchObject({ note: 'この端末の入力', medicineCost: '4000', medicalFee: '2000', cloudSyncPending: true, localHistory: original.localHistory });
    expect(expenses).not.toHaveBeenCalled();
    expect(writes(fixture)).toEqual([]);
  });

  it('uses a revision condition when a peer updates between readback and PUT', async () => {
    const fixture = serve();
    const peer = { ...fixture.remote!, note: '送信直前の別端末更新', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' };
    fixture.beforePut = () => { fixture.remote = peer; };
    const expenses = vi.fn();

    await expect(updateTreatment(original.id, { ...input, medicineCost: '4000' }).then(expenses)).rejects.toBeInstanceOf(TreatmentSyncConflictError);

    expect(fixture.remote).toEqual(peer);
    expect(writes(fixture)).toHaveLength(1);
    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(revisionA));
    expect(await read()).toMatchObject({ medicineCost: '4000', cloudSyncPending: true });
    expect(expenses).not.toHaveBeenCalled();
  });

  it('retains confirmed B after its lost ACK and failed C, then completes only a formal retry', async () => {
    const fixture = serve(); fixture.losePutAck = 1; fixture.failPut = 2;
    const expenses = vi.fn();
    await expect(updateTreatment(original.id, { ...input, note: 'B', medicalFee: '5000' }).then(expenses)).rejects.toThrow('PUT ACK lost');
    const confirmedB = structuredClone(fixture.remote!);
    await expect(updateTreatment(original.id, { ...input, note: 'C', medicalFee: '6000' }).then(expenses)).rejects.toThrow('送信を確認できません');
    expect(await read()).toMatchObject({ note: 'C', cloudSyncPending: true, treatmentSyncBase: { record: confirmedB, cloudUpdatedAt: confirmedB.cloudUpdatedAt } });
    expect(expenses).not.toHaveBeenCalled();

    const saved = await updateTreatment(original.id, { ...input, note: 'C', medicalFee: '6000' });
    expenses(saved);

    expect(saved).toMatchObject({ id: original.id, note: 'C', medicalFee: '6000', cloudSyncPending: false, localHistory: original.localHistory });
    expect(await read()).not.toHaveProperty('treatmentSyncBase');
    expect(await read()).not.toHaveProperty('treatmentSyncAttempt');
    expect(writes(fixture).map(call => call.headers.get('If-Match'))).toEqual([
      JSON.stringify(revisionA), JSON.stringify(confirmedB.cloudUpdatedAt), JSON.stringify(confirmedB.cloudUpdatedAt),
    ]);
    expect(expenses).toHaveBeenCalledTimes(1);
  });

  it('preserves unknown business and numeric identity while clearing optional links and excluding retry metadata', async () => {
    const fixture = serve();
    const { cloudUpdatedAt: _revision, ...legacy } = original;
    await saveRecordPreservingTimestamps('treatments', legacy);

    await updateTreatment(original.id, { ...input, diseaseMasterId: undefined, treatmentCourseId: undefined });

    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(original.updatedAt));
    expect(writes(fixture)[0].path).toBe(sourcePath);
    expect(writes(fixture)[0].body).toMatchObject({ id: original.syncRecordId, localHistory: original.localHistory, medicineCost: '1000', medicalFee: '2000', diseaseMasterId: null, treatmentCourseId: null });
    for (const key of ['syncRecordId', 'cloudUpdatedAt', 'cloudSyncPending', 'treatmentSyncBase', 'treatmentSyncAttempt']) expect(writes(fixture)[0].body).not.toHaveProperty(key);
    expect(await read()).toMatchObject({ id: original.id, syncRecordId: original.syncRecordId, localHistory: original.localHistory, cloudSyncPending: false });
  });

  it('keeps a delete pending when a peer wins its condition and prevents a queued save from recreating fees', async () => {
    const fixture = serve();
    const peer = { ...fixture.remote!, note: '削除直前の別端末更新', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' };
    fixture.beforeDelete = () => { fixture.remote = peer; };
    const expenses = vi.fn();

    await expect(deleteTreatment(original.id).then(expenses)).rejects.toBeInstanceOf(TreatmentSyncConflictError);
    await expect(updateTreatment(original.id, { ...input, note: '削除待ちの再保存' }).then(expenses)).rejects.toBeInstanceOf(TreatmentSyncConflictError);

    expect(await read()).toMatchObject({ ...original, cloudSyncPending: true, treatmentSyncDeletePending: true });
    expect(fixture.remote).toEqual(peer);
    expect(writes(fixture)).toEqual([expect.objectContaining({ method: 'DELETE' })]);
    expect(expenses).not.toHaveBeenCalled();
  });

  it('keeps a lost deletion pending through tombstone GET and completes its expense continuation once after explicit retry', async () => {
    const fixture = serve(); fixture.loseDeleteAck = true;
    const expenses = vi.fn();
    await expect(deleteTreatment(original.id).then(expenses)).rejects.toThrow('DELETE ACK lost');
    expect(await getTreatmentList()).toEqual([expect.objectContaining({ id: original.id, treatmentSyncDeletePending: true })]);
    expect(expenses).not.toHaveBeenCalled();

    await deleteTreatment(original.id).then(expenses);

    expect(await read()).toBeUndefined();
    expect(expenses).toHaveBeenCalledTimes(1);
    expect(writes(fixture).map(call => call.method)).toEqual(['DELETE', 'DELETE']);
  });

  it('does not remove the local source when a missing remote DELETE has not confirmed a tombstone', async () => {
    const fixture = serve(); fixture.remote = null; fixture.deleteStatus = 404;
    const expenses = vi.fn();
    await expect(deleteTreatment(original.id).then(expenses)).rejects.toThrow('404');
    expect(await read()).toMatchObject({ id: original.id, cloudSyncPending: true, treatmentSyncDeletePending: true });
    expect(writes(fixture)[0].headers.get('If-None-Match')).toBe('*');
    expect(expenses).not.toHaveBeenCalled();
  });

  it('creates only absent cloud records and preserves Free records when numeric allocation shares a clock tick', async () => {
    const fixture = serve(); fixture.remote = null;
    const saved = await createTreatment(input);
    expect(writes(fixture)[0].headers.get('If-None-Match')).toBe('*');
    expect(saved.cloudSyncPending).toBe(false);
    context.plan = 'free';
    vi.spyOn(Date, 'now').mockReturnValue(saved.id);
    const beforeRequests = fixture.calls.length;

    const batch = await createManyTreatments([{ ...input, note: 'Free A' }, { ...input, note: 'Free B' }]);

    expect(new Set([original.id, saved.id, ...batch.map(row => row.id)]).size).toBe(4);
    expect(await getAllRecords('treatments')).toHaveLength(4);
    expect(batch.every(row => row.cloudSyncPending === false)).toBe(true);
    expect(fixture.calls).toHaveLength(beforeRequests);
  });

  it('reports the committed local ID before sending a new treatment and keeps it usable after a lost ACK', async () => {
    const fixture = serve(); fixture.remote = null; fixture.losePutAck = 1;
    const onLocalSaved = vi.fn();
    fixture.beforePut = () => { expect(onLocalSaved).toHaveBeenCalledTimes(1); };

    await expect(createTreatment(input, { onLocalSaved })).rejects.toThrow('PUT ACK lost');
    const localId = onLocalSaved.mock.calls[0][0] as number;
    expect(fixture.remote!.id).toBe(`treatment:${localId}`);
    expect(await getRecordById('treatments', localId)).toMatchObject({ id: localId, cloudSyncPending: true });

    await updateTreatment(localId, { ...input, note: '同じ新規記録を再確認' });

    expect(await getAllRecords('treatments')).toHaveLength(2);
    expect(await getRecordById('treatments', localId)).toMatchObject({ cloudSyncPending: false, note: '同じ新規記録を再確認' });
    expect(onLocalSaved).toHaveBeenCalledTimes(1);
  });

  it('reports every committed bulk ID in input order before the first cloud failure', async () => {
    const fixture = serve(); fixture.remote = null; fixture.failPut = 1;
    const onLocalSaved = vi.fn();
    fixture.beforePut = () => { expect(onLocalSaved).toHaveBeenCalledTimes(1); };

    await expect(createManyTreatments([{ ...input, note: '一括A' }, { ...input, note: '一括B' }], { onLocalSaved })).rejects.toThrow('送信を確認できません');

    const ids = onLocalSaved.mock.calls[0][0] as number[];
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(await getRecordById('treatments', ids[0])).toMatchObject({ note: '一括A', cloudSyncPending: true });
    expect(await getRecordById('treatments', ids[1])).toMatchObject({ note: '一括B', cloudSyncPending: true });
    expect(writes(fixture)).toHaveLength(1);
    expect(await getAllRecords('treatments')).toHaveLength(3);
  });

  it('reports a committed ID before rejecting a context change at transaction completion', async () => {
    const fixture = serve(); fixture.remote = null;
    const onLocalSaved = vi.fn();
    const originalTransaction = IDBDatabase.prototype.transaction;
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, stores, mode, options) {
      const tx = originalTransaction.call(this, stores, mode, options);
      if (stores === 'treatments' && mode === 'readwrite') {
        tx.addEventListener('complete', () => { context.token = 'changed-after-commit'; }, { once: true });
      }
      return tx;
    });

    await expect(createTreatment(input, { onLocalSaved })).rejects.toThrow('ログインまたは農場');

    transaction.mockRestore();
    expect(onLocalSaved).toHaveBeenCalledTimes(1);
    const id = onLocalSaved.mock.calls[0][0] as number;
    expect(await getRecordById('treatments', id)).toMatchObject({ id, cloudSyncPending: true });
    expect(fixture.calls).toEqual([]);
    context.token = 'conditional-treatment-token';
    await updateTreatment(id, input);
    expect(await getAllRecords('treatments')).toHaveLength(2);
    expect(await getRecordById('treatments', id)).toMatchObject({ cloudSyncPending: false });
  });
});

describe('treatment edits while cloud sync is disabled', () => {
  const customInput = { ...input, localHistory: original.localHistory };
  const freeInput = { ...input, note: 'Freeで確認した原本C', treatmentDate: '2026-11-03',
    nextScheduledDate: '2026-11-25', medicineCost: '1,400', medicalFee: '6,000' };
  const unrelatedStores = ['expenses', 'schedules', 'cattle', 'calves', 'breedings'] as const;
  let unrelatedBefore: StoredRecord[][];

  beforeEach(async () => {
    for (const store of unrelatedStores) {
      await clearStore(store);
      await saveRecordPreservingTimestamps(store, { id: `${store}-keep`, value: { exact: '1,200', nullable: null },
        createdAt: revisionA, updatedAt: revisionA });
    }
    unrelatedBefore = await Promise.all(unrelatedStores.map(store => getAllRecords(store)));
  });
  afterEach(async () => {
    expect(await Promise.all(unrelatedStores.map(store => getAllRecords(store)))).toEqual(unrelatedBefore);
  });

  it.each(['newer live record', 'tombstone'])('keeps a Free edit when Standard resumes with a peer %s', async kind => {
    const fixture = serve();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T00:00:00.000Z'));
    context.plan = 'free';
    const edited = await updateTreatment(original.id, freeInput);
    expect(getTreatmentSyncStatus(edited)).toEqual({ pending: false });
    expect(fixture.calls).toEqual([]);
    const peer = kind === 'tombstone'
      ? { id: original.syncRecordId, deletedAt: '2026-11-02T01:00:00.000Z', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' }
      : { ...fixture.remote!, note: '別端末で確定したB', medicalFee: '9000', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' };
    fixture.remote = peer;
    context.plan = 'standard';

    expect.soft(await getTreatmentList()).toEqual([edited]);
    expect.soft(await read()).toEqual(edited);
    const afterListRequests = fixture.calls.length;
    expect(await retryPendingTreatmentSync()).toBe(0);
    expect(fixture.calls).toHaveLength(afterListRequests);
    expect(writes(fixture)).toEqual([]);
    expect.soft(await read()).toMatchObject({ ...freeInput, localHistory: original.localHistory,
      createdAt: original.createdAt, updatedAt: '2026-11-04T00:00:00.000Z', cloudUpdatedAt: revisionA,
      cloudSyncPending: true, treatmentSyncBase: { version: 1, record: toCloudTreatment(original), cloudUpdatedAt: revisionA } });
    expect((await read())?.treatmentSyncOrigin).toBeUndefined();
    if (!await read()) return;

    const expenses = vi.fn();
    await expect(updateTreatment(original.id, freeInput).then(expenses)).rejects.toBeInstanceOf(TreatmentSyncConflictError);
    expect(toCloudTreatment((await read())!)).toEqual(toCloudTreatment(edited));
    expect(fixture.remote).toEqual(peer);
    expect(writes(fixture)).toEqual([]);
    expect(expenses).not.toHaveBeenCalled();
  });

  it('keeps the A basis through repeated Free edits and sends C only on the next explicit paid save', async () => {
    const fixture = serve();
    const remoteA = structuredClone(fixture.remote);
    context.plan = 'free';
    await updateTreatment(original.id, { ...freeInput, note: 'Freeでの最初の編集' });
    const edited = await updateTreatment(original.id, freeInput);
    expect(await getTreatmentList()).toEqual([edited]);
    expect(await retryPendingTreatmentSync()).toBe(0);
    expect(fixture.calls).toEqual([]);
    context.plan = 'standard';

    expect(await getTreatmentList()).toEqual([edited]);
    const afterListRequests = fixture.calls.length;
    expect(await retryPendingTreatmentSync()).toBe(0);
    expect(fixture.calls).toHaveLength(afterListRequests);
    expect(fixture.remote).toEqual(remoteA);
    expect.soft((await read())?.treatmentSyncBase).toEqual({ version: 1, record: toCloudTreatment(original), cloudUpdatedAt: revisionA });
    const saved = await updateTreatment(original.id, freeInput);

    expect(writes(fixture)).toHaveLength(1);
    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(revisionA));
    expect(saved).toMatchObject({ ...freeInput, cloudSyncPending: false, localHistory: original.localHistory,
      createdAt: original.createdAt, diseaseMasterId: original.diseaseMasterId, treatmentCourseId: original.treatmentCourseId });
    expect(fixture.remote).toMatchObject({ ...freeInput, localHistory: original.localHistory,
      createdAt: original.createdAt, updatedAt: saved.updatedAt });
    for (const key of ['treatmentSyncOrigin', 'treatmentSyncBase', 'treatmentSyncAttempt']) expect(saved).not.toHaveProperty(key);
  });

  it.each(['creation', 'update'])('retains a lost %s ACK through a Free edit without uploading it on plan restoration', async operation => {
    const fixture = serve(); fixture.losePutAck = 1;
    let id = original.id;
    if (operation === 'creation') {
      await clearStore('treatments'); fixture.remote = null;
      await expect(createTreatment({ ...customInput, note: '応答を失ったB' },
        { onLocalSaved: value => { id = value; } })).rejects.toThrow('PUT ACK lost');
    } else {
      await expect(updateTreatment(id, { ...input, note: '応答を失ったB' })).rejects.toThrow('PUT ACK lost');
    }
    const attempted = (await getRecordById<StoredRecord>('treatments', id))!;
    const remoteB = structuredClone(fixture.remote!);
    context.plan = 'free'; fixture.calls = [];
    const edited = await updateTreatment(id, freeInput);
    expect(fixture.calls).toEqual([]);
    expect(getTreatmentSyncStatus(edited)).toEqual({ pending: false });
    context.plan = 'standard';

    expect.soft(await getTreatmentList()).toEqual([edited]);
    const afterListRequests = fixture.calls.length;
    expect(await retryPendingTreatmentSync()).toBe(0);
    expect(fixture.calls).toHaveLength(afterListRequests);
    const current = await getRecordById<StoredRecord>('treatments', id);
    expect.soft(current).toMatchObject({ cloudSyncPending: true,
      treatmentSyncBase: attempted.treatmentSyncBase, treatmentSyncAttempt: attempted.treatmentSyncAttempt });
    expect(current?.treatmentSyncOrigin).toBeUndefined();
    const saved = await updateTreatment(id, freeInput);

    expect(writes(fixture)).toHaveLength(1);
    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(remoteB.cloudUpdatedAt));
    expect(saved).toMatchObject({ ...freeInput, cloudSyncPending: false, localHistory: original.localHistory, createdAt: attempted.createdAt });
    expect(await getAllRecords('treatments')).toHaveLength(1);
  });

  it('keeps new and never-synced Free CRUD local without introducing pending proof or an origin', async () => {
    const fixture = serve();
    await clearStore('treatments'); context.plan = 'free';
    const created = await createTreatment(customInput);
    const saved = await updateTreatment(created.id, freeInput);
    expect(await getTreatmentList()).toEqual([saved]);
    expect(getTreatmentSyncStatus(saved)).toEqual({ pending: false });
    expect(saved).toMatchObject({ ...freeInput, cloudSyncPending: false, localHistory: original.localHistory, createdAt: created.createdAt });
    const stored = (await getRecordById<StoredRecord>('treatments', saved.id))!;
    for (const key of ['cloudUpdatedAt', 'treatmentSyncBase', 'treatmentSyncAttempt', 'treatmentSyncOrigin']) expect(stored[key]).toBeUndefined();
    expect(await retryPendingTreatmentSync()).toBe(0);
    await deleteTreatment(created.id);
    expect(await getAllRecords('treatments')).toEqual([]);
    expect(fixture.calls).toEqual([]);
  });

  it('protects the acknowledged stock-linked source during a Free edit and keeps its single usage on paid list receipt', async () => {
    const fixture = serve();
    const purchase: SupplyMovement = { id: 'free-plan-medicine-purchase', kind: '医薬品', action: '購入', date: '2026-11-01',
      itemName: input.medicine, lotNumber: '', quantity: 10, unit: '分包', expiryDate: '', supplier: '', storageLocation: '検証棚',
      donorCow: '', sire: '', grade: '', cowEarTag: '', unitPrice: 0, amount: 0, paymentMethod: '', note: '', expenseRecorded: false,
      createdAt: revisionA, updatedAt: revisionA };
    const usage: SupplyMovement = { ...purchase, id: 'treatment-stock-321', action: '使用', quantity: 2, cowEarTag: input.targetNumber };
    const stockOriginal = { ...original, medicineSource: 'farm_stock' as const, medicineInventoryMovementId: usage.id,
      medicineInventoryBatchKey: batchKey(purchase), medicineInventoryQuantity: 2 };
    await saveRecordPreservingTimestamps('supplyInventory', purchase);
    await saveRecordPreservingTimestamps('supplyInventory', usage);
    await saveRecordPreservingTimestamps('treatments', stockOriginal);
    fixture.remote = { ...toCloudTreatment(stockOriginal), cloudUpdatedAt: revisionA };
    context.plan = 'free';
    const edited = await updateTreatment(original.id, { ...freeInput, medicineSource: 'farm_stock',
      medicineInventoryBatchKey: batchKey(purchase), medicineInventoryQuantity: 2 });
    expect(fixture.calls).toEqual([]);
    expect(getTreatmentSyncStatus(edited)).toEqual({ pending: false });
    const stockAfterEdit = await getAllRecords<SupplyMovement>('supplyInventory');
    expect(stockAfterEdit.filter(row => row.action === '使用')).toEqual([expect.objectContaining({ id: usage.id, quantity: 2 })]);
    expect(stockAfterEdit.find(row => row.id === purchase.id)).toEqual(purchase);
    expect(await getAllRecords('metadata')).toEqual([]);
    fixture.remote = { ...fixture.remote!, note: '別端末の在庫治療B', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' };
    context.plan = 'standard';

    expect.soft(await getTreatmentList()).toEqual([edited]);
    expect.soft(await read()).toMatchObject({ ...freeInput, medicineSource: 'farm_stock', cloudSyncPending: true,
      localHistory: original.localHistory, createdAt: original.createdAt,
      treatmentSyncBase: { record: toCloudTreatment(stockOriginal), cloudUpdatedAt: revisionA } });
    expect((await read())?.treatmentSyncOrigin).toBeUndefined();
    const afterListRequests = fixture.calls.length;
    expect(await retryPendingTreatmentSync()).toBe(0);
    expect(fixture.calls).toHaveLength(afterListRequests);
    expect(writes(fixture)).toEqual([]);
    expect(await getAllRecords('supplyInventory')).toEqual(stockAfterEdit);
  });
});
