import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, deleteRecord, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { Treatment, TreatmentInput } from '../types/treatment';
import {
  createManyTreatments, createTreatment, getTreatmentList, getTreatmentSyncStatus,
  retryPendingTreatmentSync, TREATMENT_SYNC_STATUS_EVENT, updateTreatment,
} from './treatmentApi';
import { toCloudTreatment, type CloudTreatmentRecord } from './treatmentSyncProtocol';

const context = vi.hoisted(() => ({
  plan: 'standard', token: 'retry-treatment-token', farmId: 'retry-treatment-farm', userId: 'retry-treatment-user',
}));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => context.plan }));
vi.mock('./authClient', () => ({
  getAuthToken: () => context.token,
  getStoredAuthUser: () => ({ id: context.userId, farmId: context.farmId }),
}));
vi.mock('./supplyInventorySync', () => ({ syncSupplyInventorySafely: vi.fn(async () => false) }));

type Row = Treatment & StoredRecord;
type RequestLog = { id: string; path: string; method: string; headers: Headers; body?: CloudTreatmentRecord; signal?: AbortSignal | null };
type Fixture = {
  records: Map<string, CloudTreatmentRecord>;
  calls: RequestLog[];
  failGet: boolean;
  failPut: boolean;
  losePutAck: boolean;
  get?: (request: RequestLog) => Promise<Response | undefined>;
  put?: (record: CloudTreatmentRecord, request: RequestLog) => Promise<Response | undefined>;
};
const input: TreatmentInput & Record<string, unknown> = {
  targetNumber: 'RETRY-COW', targetName: '再送検証牛', treatmentDate: '2026-11-02',
  symptom: '検証症状', diagnosis: '', medicine: '検証薬', medicineSource: 'veterinarian',
  dosage: '2', withdrawalEndDate: '', veterinarian: '', progress: '治療中', note: '正式保存',
  medicineCost: '1,000', medicalFee: '2000', localHistory: { values: ['将来の業務項目'] },
};
const ownerKey = 'farmpro.treatmentSyncOwner.retry-treatment-farm';
const queueKey = (row: Row) => `supply-linked-sync:treatments:${encodeURIComponent(row.syncRecordId!)}`;
const read = async (id: number) => (await getRecordById<Row>('treatments', id))!;
const writes = (fixture: Fixture) => fixture.calls.filter(call => call.method === 'PUT');
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function serve(): Fixture {
  const fixture: Fixture = { records: new Map(), calls: [], failGet: false, failPut: false, losePutAck: false };
  let revision = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    const method = init?.method ?? 'GET';
    if (path === '/api/treatments/record-sync' && method === 'GET') return Response.json([...fixture.records.values()]);
    if (!path.startsWith('/api/treatments/record-sync/')) throw new Error(`Unexpected background side effect: ${method} ${path}`);
    const id = decodeURIComponent(path.slice('/api/treatments/record-sync/'.length));
    const request: RequestLog = { id, path, method, headers: new Headers(init?.headers), signal: init?.signal,
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) };
    fixture.calls.push(request);
    if (method === 'GET') {
      if (fixture.failGet) throw new TypeError('offline');
      const supplied = await fixture.get?.(request);
      if (supplied) return supplied;
      const remote = fixture.records.get(id);
      return remote ? Response.json(remote) : new Response(null, { status: 404 });
    }
    if (method !== 'PUT') throw new Error(`Unexpected background method: ${method}`);
    const previous = fixture.records.get(id);
    if (previous?.deletedAt) return Response.json({ message: '別端末で削除済みです。' }, { status: 409 });
    if (previous ? request.headers.get('If-Match') !== JSON.stringify(previous.cloudUpdatedAt)
      : request.headers.get('If-None-Match') !== '*') return Response.json({ message: '別端末で更新済みです。' }, { status: 412 });
    if (fixture.failPut) return Response.json({ message: '一時的に送信できません。' }, { status: 503 });
    const saved = { ...request.body!, cloudUpdatedAt: new Date(Date.UTC(2026, 10, 2) + ++revision).toISOString() };
    fixture.records.set(id, saved);
    if (fixture.losePutAck) { fixture.losePutAck = false; throw new TypeError('ACK lost'); }
    return await fixture.put?.(saved, request) ?? Response.json(saved);
  }));
  return fixture;
}

async function createPending(fixture: Fixture, note = '通信前に正式保存'): Promise<Row> {
  let id = 0;
  fixture.failGet = true;
  await expect(createTreatment({ ...input, note }, { onLocalSaved: value => { id = value; } })).rejects.toThrow('offline');
  fixture.failGet = false;
  fixture.calls = [];
  return read(id);
}

beforeEach(async () => {
  Object.assign(context, { plan: 'standard', token: 'retry-treatment-token', farmId: 'retry-treatment-farm', userId: 'retry-treatment-user' });
  window.history.replaceState(null, '', '/treatments');
  window.localStorage.clear(); window.sessionStorage.clear();
  for (const store of ['treatments', 'metadata', 'expenses', 'schedules', 'calves', 'supplyInventory'] as const) await clearStore(store);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('owned ordinary treatment automatic retry', () => {
  it('sends a formal pending source once and only acknowledges source metadata, leaving fees and schedules untouched', async () => {
    const fixture = serve();
    const pending = await createPending(fixture);
    await saveRecordPreservingTimestamps('expenses', { id: 'fee', sourceId: pending.id, amount: 3000 });
    await saveRecordPreservingTimestamps('schedules', { id: 'followup', status: 'pending', sourceId: pending.id });
    const expenses = await getAllRecords('expenses');
    const schedules = await getAllRecords('schedules');
    const event = vi.fn();
    window.addEventListener(TREATMENT_SYNC_STATUS_EVENT, event);
    expect(pending.treatmentSyncOrigin).toMatchObject({ version: 1, farmId: context.farmId, userId: context.userId });
    expect(getTreatmentSyncStatus(pending)).toMatchObject({ pending: true });

    const results = await Promise.all([retryPendingTreatmentSync(), retryPendingTreatmentSync()]);

    expect(results.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(writes(fixture)).toHaveLength(1);
    expect(writes(fixture)[0].headers.get('If-None-Match')).toBe('*');
    expect(writes(fixture)[0].body).toMatchObject({ medicineCost: '1,000', medicalFee: '2000', localHistory: input.localHistory });
    expect(Object.keys(writes(fixture)[0].body!).some(key => key.startsWith('treatmentSync'))).toBe(false);
    const saved = await read(pending.id);
    expect(saved).toMatchObject({ id: pending.id, createdAt: pending.createdAt, updatedAt: pending.updatedAt, cloudSyncPending: false, localHistory: input.localHistory });
    for (const key of ['treatmentSyncOrigin', 'treatmentSyncBase', 'treatmentSyncAttempt', 'treatmentSyncWarning', 'treatmentSyncBlocked']) expect(saved).not.toHaveProperty(key);
    expect(getTreatmentSyncStatus(saved)).toEqual({ pending: false });
    expect(await getAllRecords('expenses')).toEqual(expenses);
    expect(await getAllRecords('schedules')).toEqual(schedules);
    expect(event).toHaveBeenCalledTimes(1);
    await getTreatmentList();
    expect(event).toHaveBeenCalledTimes(1);
    window.removeEventListener(TREATMENT_SYNC_STATUS_EVENT, event);
  });

  it('confirms a lost PUT ACK with a single GET and retains one source without repeating PUT', async () => {
    const fixture = serve(); fixture.losePutAck = true;
    let id = 0;
    await expect(createTreatment(input, { onLocalSaved: value => { id = value; } })).rejects.toThrow('ACK lost');
    const before = await read(id);
    fixture.calls = [];

    expect(await retryPendingTreatmentSync()).toBe(1);

    expect(fixture.calls.map(call => call.method)).toEqual(['GET']);
    expect(fixture.records.size).toBe(1);
    expect(await read(id)).toMatchObject({ cloudSyncPending: false, updatedAt: before.updatedAt });
  });

  it('retains the confirmed B basis through a lost ACK and failed formal C, then retries C conditionally', async () => {
    const fixture = serve();
    const original = await createTreatment(input);
    fixture.losePutAck = true;
    await expect(updateTreatment(original.id, { ...input, note: 'B' })).rejects.toThrow('ACK lost');
    const confirmedB = structuredClone(fixture.records.get(original.syncRecordId!)!);
    fixture.failPut = true;
    await expect(updateTreatment(original.id, { ...input, note: 'C', medicineCost: '4500' })).rejects.toThrow('一時的');
    const pendingC = await read(original.id);
    expect(pendingC).toMatchObject({ treatmentSyncBase: { record: confirmedB }, note: 'C' });
    fixture.failPut = false; fixture.calls = [];

    expect(await retryPendingTreatmentSync()).toBe(1);

    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(confirmedB.cloudUpdatedAt));
    expect(await read(original.id)).toMatchObject({ note: 'C', medicineCost: '4500', updatedAt: pendingC.updatedAt, cloudSyncPending: false });
  });

  it.each(['peer edit', 'peer delete'])('blocks an automatic %s conflict and stops later automatic attempts', async kind => {
    const fixture = serve();
    const pending = await createPending(fixture);
    fixture.records.set(pending.syncRecordId!, kind === 'peer delete'
      ? { id: pending.syncRecordId!, deletedAt: '2026-11-02T01:00:00.000Z', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' }
      : { ...toCloudTreatment(pending), note: '別端末の入力', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' });
    const peer = structuredClone(fixture.records.get(pending.syncRecordId!)!);

    expect(await retryPendingTreatmentSync()).toBe(0);
    const blocked = await read(pending.id);
    expect(blocked).toMatchObject({ note: pending.note, updatedAt: pending.updatedAt, cloudSyncPending: true, treatmentSyncBlocked: true });
    expect(getTreatmentSyncStatus(blocked)).toMatchObject({ pending: true, warning: expect.stringMatching(/クラウド/) });
    const requestCount = fixture.calls.length;
    expect(await retryPendingTreatmentSync()).toBe(0);
    expect(fixture.calls).toHaveLength(requestCount);
    expect(writes(fixture)).toHaveLength(0);
    expect(fixture.records.get(pending.syncRecordId!)).toEqual(peer);
  });

  it('permits a formal edit to clear its previous retry block while retaining the original conditional basis', async () => {
    const fixture = serve();
    const pending = await createPending(fixture);
    await saveRecordPreservingTimestamps('treatments', { ...pending, treatmentSyncBlocked: true, treatmentSyncWarning: '以前の競合' });
    const saved = await updateTreatment(pending.id, { ...input, note: '確認して正式保存' });
    expect(saved).toMatchObject({ id: pending.id, note: '確認して正式保存', cloudSyncPending: false });
    expect(writes(fixture)[0].headers.get('If-None-Match')).toBe('*');
    expect(await read(pending.id)).not.toHaveProperty('treatmentSyncBlocked');
  });

  it('excludes legacy, foreign origin, deletion, stock and raw invalid/foreign outbox records', async () => {
    const fixture = serve();
    const pending = await createPending(fixture);
    const origin = pending.treatmentSyncOrigin as Record<string, unknown>;
    const cases: Partial<Row>[] = [
      { treatmentSyncOrigin: undefined }, { treatmentSyncOrigin: { ...origin, ownerId: 'other-browser' } },
      { treatmentSyncOrigin: { ...origin, farmId: 'other-farm' } }, { treatmentSyncOrigin: { ...origin, userId: 'other-user' } },
      { treatmentSyncDeletePending: true }, { deletedAt: '2026-11-02T00:00:00.000Z' },
      { medicineSource: 'farm_stock' }, { medicineInventoryMovementId: 'inventory-use' },
      {}, {},
    ];
    await deleteRecord('treatments', pending.id);
    for (const [index, changes] of cases.entries()) {
      const row = { ...pending, ...changes, id: pending.id + index + 1, syncRecordId: `treatment:excluded-${index}` };
      await saveRecordPreservingTimestamps('treatments', row);
      if (index >= cases.length - 2) await saveRecordPreservingTimestamps('metadata', {
        id: queueKey(row), ...(index === cases.length - 1 ? { version: 1, ownerId: 'other-inventory-owner', store: 'treatments', record: row } : { invalid: true }),
      });
    }
    const rows = await getAllRecords('treatments');
    expect(await retryPendingTreatmentSync()).toBe(0);
    expect(fixture.calls).toHaveLength(0);
    expect(await getAllRecords('treatments')).toEqual(rows);
    expect(getTreatmentSyncStatus(rows[0] as Row)).toMatchObject({ pending: true, warning: expect.stringContaining('送信元') });
  });

  it.each(['/treatments/new', '/treatments/1/edit', '/device-sync', '/backup', '/expenses'])('does not auto-send from %s', async pathname => {
    const fixture = serve(); const pending = await createPending(fixture);
    window.history.replaceState(null, '', pathname);
    expect(await retryPendingTreatmentSync()).toBe(0);
    expect(fixture.calls).toHaveLength(0);
    expect(await read(pending.id)).toEqual(pending);
  });

  it.each(['Free', 'offline', 'hidden', 'missing owner'])('keeps pending records local when %s', async reason => {
    const fixture = serve(); const pending = await createPending(fixture);
    if (reason === 'Free') context.plan = 'free';
    if (reason === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    if (reason === 'hidden') vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    if (reason === 'missing owner') window.localStorage.removeItem(ownerKey);
    expect(await retryPendingTreatmentSync()).toBe(0);
    expect(fixture.calls).toHaveLength(0);
    expect(await read(pending.id)).toEqual(pending);
    if (reason === 'Free') expect(getTreatmentSyncStatus(pending)).toEqual({ pending: false });
    if (reason === 'missing owner') expect(window.localStorage.getItem(ownerKey)).toBeNull();
  });

  it.each(['token', 'owner', 'page'])('stops PUT, status writes and the next row after %s changes during GET', async field => {
    const fixture = serve(); fixture.failGet = true;
    await expect(createManyTreatments([input, { ...input, note: '次の記録' }])).rejects.toThrow('offline');
    fixture.failGet = false; fixture.calls = [];
    const rows = await getAllRecords<Row>('treatments');
    const started = deferred<void>(); const released = deferred<void>();
    fixture.get = async () => { started.resolve(); await released.promise; return undefined; };
    const retry = retryPendingTreatmentSync();
    await started.promise;
    if (field === 'token') context.token = 'changed-token';
    if (field === 'owner') window.localStorage.setItem(ownerKey, 'changed-owner');
    if (field === 'page') window.history.replaceState(null, '', '/');
    released.resolve();

    expect(await retry).toBe(0);
    expect(fixture.calls.map(call => call.method)).toEqual(['GET']);
    expect(await getAllRecords('treatments')).toEqual(rows);
  });

  it('binds the owner before the initial DB read and never adopts a newly selected owner from that snapshot', async () => {
    const fixture = serve(); const pending = await createPending(fixture);
    const other = { ...pending, treatmentSyncOrigin: { ...(pending.treatmentSyncOrigin as object), ownerId: 'owner-after-read' } };
    await saveRecordPreservingTimestamps('treatments', other);
    const originalGetAll = IDBObjectStore.prototype.getAll;
    const getAll = vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = originalGetAll.apply(this, args);
      if (this.name === 'treatments') request.addEventListener('success', () => {
        window.localStorage.setItem(ownerKey, 'owner-after-read');
      }, { once: true });
      return request;
    });
    expect(await retryPendingTreatmentSync()).toBe(0);
    getAll.mockRestore();
    expect(fixture.calls).toHaveLength(0);
    expect(await read(other.id)).toEqual(other);
  });

  it.each(['queue', 'edit', 'delete'])('does not send after an external %s changes the source while GET is pending', async change => {
    const fixture = serve(); const pending = await createPending(fixture);
    const started = deferred<void>(); const released = deferred<void>();
    fixture.get = async () => { started.resolve(); await released.promise; return undefined; };
    const retry = retryPendingTreatmentSync(); await started.promise;
    if (change === 'queue') await saveRecordPreservingTimestamps('metadata', { id: queueKey(pending), invalid: true });
    if (change === 'edit') await saveRecordPreservingTimestamps('treatments', { ...pending, note: '通信中の直接編集', customFuture: '保持' });
    if (change === 'delete') await deleteRecord('treatments', pending.id);
    const current = await getRecordById('treatments', pending.id);
    released.resolve();
    expect(await retry).toBe(0);
    expect(writes(fixture)).toHaveLength(0);
    expect(await getRecordById('treatments', pending.id)).toEqual(current);
  });

  it.each(['owner', 'page', 'queue', 'edit'])('does not acknowledge a PUT after %s changes while its response is pending', async change => {
    const fixture = serve(); const pending = await createPending(fixture);
    const started = deferred<void>(); const released = deferred<void>();
    fixture.put = async () => { started.resolve(); await released.promise; return undefined; };
    const retry = retryPendingTreatmentSync(); await started.promise;
    if (change === 'owner') window.localStorage.setItem(ownerKey, 'changed-owner');
    if (change === 'page') window.history.replaceState(null, '', '/treatments/new');
    if (change === 'queue') await saveRecordPreservingTimestamps('metadata', { id: queueKey(pending), invalid: true });
    if (change === 'edit') await saveRecordPreservingTimestamps('treatments', { ...await read(pending.id), note: '送信中の新編集' });
    const current = await read(pending.id);
    released.resolve();
    expect(await retry).toBe(0);
    expect(await read(pending.id)).toEqual(current);
    expect(current.cloudSyncPending).toBe(true);
    expect(writes(fixture)).toHaveLength(1);
  });

  it('times out an unresolved PUT JSON body without clearing pending, releases its lock and ignores the late body', async () => {
    const fixture = serve(); const pending = await createPending(fixture);
    const started = deferred<void>(); const body = deferred<unknown>();
    fixture.put = async () => {
      const response = Response.json({});
      vi.spyOn(response, 'json').mockImplementation(() => { started.resolve(); return body.promise; });
      return response;
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const retry = retryPendingTreatmentSync(); await started.promise;
    await vi.advanceTimersByTimeAsync(12000);
    expect(await retry).toBe(0);
    const stillPending = await read(pending.id);
    expect(stillPending.cloudSyncPending).toBe(true);
    expect(writes(fixture)[0].signal?.aborted).toBe(true);
    fixture.put = undefined;
    expect(await retryPendingTreatmentSync()).toBe(1);
    const acknowledged = await read(pending.id);
    expect(writes(fixture)).toHaveLength(1);
    body.resolve(fixture.records.get(pending.syncRecordId!)!);
    await vi.advanceTimersByTimeAsync(0);
    expect(await read(pending.id)).toEqual(acknowledged);
  });
});
