import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { Breeding, BreedingInput } from '../types/breeding';
import {
  BreedingSyncConflictError, createBreeding, deleteBreeding, getBreedingList,
  getBreedingListForHomeSummary, getBreedingSyncStatus, retryPendingBreedingSync, updateBreeding,
} from './breedingApi';
import { toCloudBreeding, type CloudBreedingRecord } from './breedingSyncProtocol';

const context = vi.hoisted(() => ({
  plan: 'standard', token: 'breeding-free-edit-token', farmId: 'breeding-free-edit-farm', userId: 'breeding-free-edit-user',
}));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => context.plan }));
vi.mock('./authClient', () => ({
  getAuthToken: () => context.token,
  getStoredAuthUser: () => ({ id: context.userId, farmId: context.farmId }),
}));
// Ordinary breeding/expense services and their transactions remain real. Stock
// delivery must not be reached by these ordinary breeding operations.
vi.mock('./supplyInventorySync', () => ({ syncSupplyInventorySafely: vi.fn(async () => false) }));

type Row = Breeding & StoredRecord & { cloudRecordId?: string | number; cloudUpdatedAt?: string };
type RequestLog = { path: string; method: string; headers: Headers; body?: StoredRecord };
type Fixture = { remote: Map<string, CloudBreedingRecord>; calls: RequestLog[]; losePutAck: boolean };
const input = {
  cowEarTag: 'FREE-EDIT-COW', cowName: '無料編集検証牛', heatDate: '2026-11-01',
  breedingMethod: '種付', breedingStatus: '種付実施', inseminationDate: '2026-11-02', inseminationCost: '01200',
  bullName: '', inseminatorName: '', note: '確認済み原本A',
} as BreedingInput;
const customInput = { ...input, localHistory: { calvingId: 'keep-local-history', amount: '00120', nested: [null, '10.00'] } };
const freeInput = { ...input, inseminationDate: '2026-11-03', inseminationCost: '02300',
  pregnancyCheckExpectedDate: '2026-12-03', note: 'Freeで明示編集したC' };
const firstTime = '2026-11-01T00:00:00.000Z';
const untouched = { id: 'unrelated-fixture', note: '繁殖同期から変更しない', createdAt: firstTime, updatedAt: firstTime };
const advanced = { ...untouched, id: 'advanced-breeding', recordKind: 'synchronization', unknownBusiness: 'keep' };
const read = (id: string | number) => getRecordById<Row>('breedings', id);
const writes = (fixture: Fixture) => fixture.calls.filter(call => call.method !== 'GET');
const breedingPuts = (fixture: Fixture) => writes(fixture).filter(call => call.path.startsWith('/api/breedings/'));
const expenseWrites = (fixture: Fixture) => writes(fixture).filter(call => call.path.startsWith('/api/expenses/'));

function serve(): Fixture {
  const fixture: Fixture = { remote: new Map(), calls: [], losePutAck: false };
  let generation = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    const request: RequestLog = { path, method: init?.method ?? 'GET', headers: new Headers(init?.headers),
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) };
    fixture.calls.push(request);
    if (path === '/api/breedings/record-sync' && request.method === 'GET') {
      // The real breeding list exposes live rows; a deleted source remains
      // available only from the individual readback endpoint.
      return Response.json([...fixture.remote.values()].filter(record => !record.deletedAt));
    }
    if (path.startsWith('/api/breedings/record-sync/')) {
      const id = decodeURIComponent(path.slice('/api/breedings/record-sync/'.length));
      const current = fixture.remote.get(id);
      if (request.method === 'GET') return current ? Response.json(current) : new Response(null, { status: 404 });
      if (request.method !== 'PUT') throw new Error(`Unexpected breeding mutation: ${request.method}`);
      if (current?.deletedAt) return Response.json({ message: '削除済みです。' }, { status: 409 });
      const matches = current ? request.headers.get('If-Match') === JSON.stringify(current.cloudUpdatedAt)
        : request.headers.get('If-None-Match') === '*';
      if (!matches) return Response.json({ message: '別端末で変更されています。' }, { status: 412 });
      const saved: CloudBreedingRecord = { ...request.body!, id,
        cloudUpdatedAt: new Date(Date.UTC(2026, 10, 3) + ++generation).toISOString() };
      fixture.remote.set(id, saved);
      if (fixture.losePutAck) { fixture.losePutAck = false; throw new TypeError('PUT ACK lost'); }
      return Response.json(saved);
    }
    if (path.startsWith('/api/expenses/record-sync/') && request.method === 'PUT') {
      return Response.json({ ...request.body!, id: decodeURIComponent(path.split('/').pop()!),
        cloudUpdatedAt: '2026-11-03T00:00:00.000Z' });
    }
    throw new Error(`Unexpected fixture request: ${request.method} ${path}`);
  }));
  return fixture;
}

async function editInFree(saved: Row, fixture: Fixture) {
  context.plan = 'free';
  fixture.calls = [];
  vi.setSystemTime(new Date('2026-11-03T01:00:00.000Z'));
  const edited = await updateBreeding(saved.id, freeInput) as Row;
  expect(getBreedingSyncStatus(edited)).toEqual({ pending: false });
  expect(fixture.calls).toEqual([]);
  const expenses = await getAllRecords('expenses');
  context.plan = 'standard';
  return { edited, expenses };
}

beforeEach(async () => {
  context.plan = 'standard';
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/breedings');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T00:00:00.000Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  for (const store of ['breedings', 'expenses', 'masters', 'metadata', 'supplyInventory', 'cattle', 'calves', 'schedules'] as const) await clearStore(store);
  for (const store of ['supplyInventory', 'cattle', 'calves', 'schedules'] as const) await saveRecordPreservingTimestamps(store, untouched);
  await saveRecordPreservingTimestamps('breedings', advanced);
});
afterEach(async () => {
  for (const store of ['supplyInventory', 'cattle', 'calves', 'schedules'] as const) expect(await getAllRecords(store)).toEqual([untouched]);
  expect(await getRecordById('breedings', advanced.id)).toEqual(advanced);
  expect(await getAllRecords('masters')).toEqual([]);
  expect(await getAllRecords('metadata')).toEqual([]);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('ordinary breeding edits while cloud sync is disabled', () => {
  describe.each([
    { name: 'record list', load: getBreedingList },
    { name: 'home summary', load: getBreedingListForHomeSummary },
  ])('$name', ({ load }) => {
    it.each(['newer live record', 'deleted record'])('keeps Free C against a peer %s and preserves expenses on the next rejected save', async kind => {
      const fixture = serve();
      const saved = await createBreeding(customInput) as Row;
      const confirmedA = structuredClone(fixture.remote.get(String(saved.cloudRecordId))!);
      const { edited, expenses } = await editInFree(saved, fixture);
      const peer: CloudBreedingRecord = kind === 'deleted record'
        ? { id: confirmedA.id, deletedAt: '2026-11-04T00:00:00.000Z', cloudUpdatedAt: '2026-11-04T00:00:00.000Z' }
        : { ...confirmedA, note: '別端末の変更B', inseminationCost: '99000', cloudUpdatedAt: '2026-11-04T00:00:00.000Z' };
      fixture.remote.set(String(confirmedA.id), peer);

      expect(await load()).toEqual([edited]);
      expect(await read(saved.id)).toEqual(edited);
      expect(await retryPendingBreedingSync()).toBe(0);
      expect(writes(fixture)).toEqual([]);
      expect(await getAllRecords('expenses')).toEqual(expenses);
      expect(await read(saved.id)).toMatchObject({ ...freeInput, localHistory: customInput.localHistory,
        createdAt: saved.createdAt, updatedAt: '2026-11-03T01:00:00.000Z', cloudUpdatedAt: saved.cloudUpdatedAt,
        cloudSyncPending: true, breedingSyncBase: { version: 1, record: toCloudBreeding(saved), cloudUpdatedAt: saved.cloudUpdatedAt } });
      expect((await read(saved.id))?.breedingSyncOrigin).toBeUndefined();

      await expect(updateBreeding(saved.id, freeInput)).rejects.toBeInstanceOf(BreedingSyncConflictError);
      expect(toCloudBreeding((await read(saved.id))!)).toEqual(toCloudBreeding(edited));
      expect((await read(saved.id))?.localHistory).toEqual(customInput.localHistory);
      expect(await getAllRecords('expenses')).toEqual(expenses);
      expect(fixture.remote.get(String(confirmedA.id))).toEqual(peer);
      expect(writes(fixture)).toEqual([]);
    });
  });

  it('preserves A through repeated Free edits and sends C plus its expense only on the next explicit paid save', async () => {
    const fixture = serve();
    const saved = await createBreeding(customInput) as Row;
    const remoteA = structuredClone(fixture.remote.get(String(saved.cloudRecordId))!);
    context.plan = 'free'; fixture.calls = [];
    await updateBreeding(saved.id, { ...freeInput, note: 'Freeの一度目の編集' });
    const { edited, expenses } = await editInFree(saved, fixture);

    expect(await getBreedingListForHomeSummary()).toEqual([edited]);
    expect(await getBreedingList()).toEqual([edited]);
    expect(await retryPendingBreedingSync()).toBe(0);
    expect(await getAllRecords('expenses')).toEqual(expenses);
    expect(writes(fixture)).toEqual([]);
    expect(fixture.remote.get(String(saved.cloudRecordId))).toEqual(remoteA);
    expect((await read(saved.id))?.breedingSyncBase).toEqual({ version: 1, record: toCloudBreeding(saved), cloudUpdatedAt: saved.cloudUpdatedAt });

    const acknowledged = await updateBreeding(saved.id, freeInput) as Row;

    expect(breedingPuts(fixture)).toHaveLength(1);
    expect(breedingPuts(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(remoteA.cloudUpdatedAt));
    expect(acknowledged).toMatchObject({ ...freeInput, cloudSyncPending: false,
      localHistory: customInput.localHistory, createdAt: saved.createdAt });
    expect(fixture.remote.get(String(saved.cloudRecordId))).toMatchObject({ ...freeInput,
      createdAt: saved.createdAt, updatedAt: acknowledged.updatedAt });
    expect(expenseWrites(fixture)).toHaveLength(1);
    expect((await getAllRecords('expenses')).map(row => row.id)).toEqual(expenses.map(row => row.id));
    expect((await getAllRecords('expenses'))[0].amount).toBe('2300');
    for (const key of ['breedingSyncBase', 'breedingSyncAttempt', 'breedingSyncOrigin']) expect(acknowledged).not.toHaveProperty(key);
  });

  it.each(['creation', 'update'])('keeps a lost %s ACK as proof through Free C until a same-ID explicit paid save', async operation => {
    const fixture = serve();
    let id: string | number;
    if (operation === 'creation') {
      fixture.losePutAck = true;
      await expect(createBreeding({ ...customInput, note: '応答を失ったB' })).rejects.toThrow('PUT ACK lost');
      id = (await getAllRecords<Row>('breedings')).find(row => row.recordKind === 'standard')!.id;
    } else {
      const saved = await createBreeding(customInput) as Row;
      id = saved.id;
      fixture.losePutAck = true;
      await expect(updateBreeding(id, { ...input, note: '応答を失ったB' })).rejects.toThrow('PUT ACK lost');
    }
    const attempted = (await read(id))!;
    const remoteB = structuredClone(fixture.remote.get(String(attempted.cloudRecordId ?? attempted.id))!);
    const { edited, expenses } = await editInFree(attempted, fixture);

    expect(await getBreedingListForHomeSummary()).toEqual([edited]);
    expect(await getBreedingList()).toEqual([edited]);
    expect(await retryPendingBreedingSync()).toBe(0);
    expect(writes(fixture)).toEqual([]);
    expect(await getAllRecords('expenses')).toEqual(expenses);
    expect(await read(id)).toMatchObject({ cloudSyncPending: true,
      breedingSyncBase: attempted.breedingSyncBase, breedingSyncAttempt: attempted.breedingSyncAttempt });
    expect((await read(id))?.breedingSyncOrigin).toBeUndefined();

    const acknowledged = await updateBreeding(id, freeInput);

    expect(breedingPuts(fixture)).toHaveLength(1);
    expect(breedingPuts(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(remoteB.cloudUpdatedAt));
    expect(acknowledged).toMatchObject({ ...freeInput, id, cloudSyncPending: false,
      localHistory: customInput.localHistory, createdAt: attempted.createdAt });
    expect((await getAllRecords('breedings')).filter(row => row.recordKind === 'standard')).toHaveLength(1);
    expect(fixture.remote.size).toBe(1);
    expect(expenseWrites(fixture)).toHaveLength(1);
  });

  it('keeps new and never-synced Free records local through create, edit, read and delete', async () => {
    const fixture = serve(); context.plan = 'free';
    const saved = await createBreeding(customInput);
    const edited = await updateBreeding(saved.id, freeInput);
    expect(edited.cloudSyncPending).toBe(false);
    expect(getBreedingSyncStatus(edited)).toEqual({ pending: false });
    expect(await getBreedingList()).toEqual([edited]);
    expect(await getBreedingListForHomeSummary()).toEqual([edited]);
    expect(await retryPendingBreedingSync()).toBe(0);
    await deleteBreeding(edited.id);
    expect(await read(edited.id)).toBeUndefined();
    expect(await getAllRecords('expenses')).toEqual([]);
    expect(fixture.calls).toEqual([]);
  });
});
