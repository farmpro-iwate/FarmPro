import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FARM_PRO_STORE_NAMES } from '../storage/db';
import { clearStore, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord, StoreName } from '../storage/types';
import {
  createFeedingGuide, deleteFeedingGuide, emptyFeedingGuideInput, getFeedingGuideList, updateFeedingGuide,
} from './feedingGuideApi';
import { createFeeding, deleteFeeding, emptyFeedingInput, getFeedingsList, updateFeeding } from './feedingsApi';
import {
  createFeedInventory, deleteFeedInventory, emptyFeedInventoryInput, getFeedInventory, getFeedInventoryList,
  updateFeedInventory, updateFeedInventoryCosting,
} from './feedInventoryApi';
import {
  cancelSynchronizationProgram, completeSchedules, createSchedule, deleteSchedule, getScheduleList, updateSchedule,
} from './scheduleApi';
import type { FeedCostingSnapshot } from './feedCostAllocation';

const context = vi.hoisted(() => ({ plan: 'standard' }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => context.plan }));
vi.mock('./authClient', () => ({
  getAuthToken: () => 'fixture-feeding-schedule-free-token',
  getStoredAuthUser: () => ({ id: 'fixture-free-edit-user', farmId: 'fixture-feeding-schedule-free-farm' }),
}));

type Row = StoredRecord & { syncRecordId?: string; cloudUpdatedAt?: string; cloudSyncPending?: boolean };
type Resource = {
  store: StoreName;
  path: string;
  create: () => Promise<{ id: string | number }>;
  update: (id: string | number, text: string) => Promise<unknown>;
  remove: (id: string | number) => Promise<void>;
  list: () => Promise<unknown[]>;
};
type Fixture = {
  remote: Map<string, Row>;
  calls: Array<{ method: string; path: string }>;
  losePutAck: boolean;
};
const firstTime = '2026-11-01T00:00:00.000Z';
const freeTime = '2026-11-03T00:00:00.000Z';
const peerTime = '2026-11-02T00:00:00.000Z';
const unknownBusiness = { rawAmount: '00120.00', nested: [null, '', { fakeReference: 'fixture-retain' }] };
const withUnknown = <T extends object>(input: T) => ({ ...input, fixtureBusiness: unknownBusiness });
const guideInput = { ...emptyFeedingGuideInput, ageDays: '030', stageName: 'fixture-guide', memo: 'A' };
const feedingInput = { ...emptyFeedingInput, feedingDate: '2026-10-31', feedName: 'fixture-feed', amount: '02.50', memo: 'A' };
const inventoryInput = { ...emptyFeedInventoryInput, transactionDate: '2026-10-31', feedName: 'fixture-stock',
  transactionType: '出庫', quantity: '02.50', memo: 'A' };
const scheduleInput = { scheduleType: 'その他', title: 'fixture-schedule', targetNumber: 'FIXTURE-ONLY',
  targetName: 'fixture-animal', dueDate: '2026-11-10', status: '未完了', note: 'A',
  synchronizationProgramId: 'fixture-program' };
const resources: Resource[] = [
  { store: 'feedingGuide', path: '/api/feeding-guide/record-sync',
    create: () => createFeedingGuide(withUnknown(guideInput)),
    update: (id, text) => updateFeedingGuide(String(id), { ...guideInput, memo: text }),
    remove: id => deleteFeedingGuide(String(id)), list: getFeedingGuideList },
  { store: 'feedings', path: '/api/feedings/record-sync',
    create: () => createFeeding(withUnknown(feedingInput)),
    update: (id, text) => updateFeeding(String(id), { ...feedingInput, memo: text }),
    remove: id => deleteFeeding(String(id)), list: getFeedingsList },
  { store: 'feedInventory', path: '/api/feed-inventory/record-sync',
    create: () => createFeedInventory(withUnknown(inventoryInput)),
    update: (id, text) => updateFeedInventory(String(id), { ...inventoryInput, memo: text }),
    remove: id => deleteFeedInventory(String(id)), list: getFeedInventoryList },
  { store: 'schedules', path: '/api/schedules/record-sync',
    create: () => createSchedule(withUnknown(scheduleInput)),
    update: (id, text) => updateSchedule(id, { ...scheduleInput, note: text }),
    remove: id => deleteSchedule(Number(id)), list: getScheduleList },
];
const inventory = resources[2];
const schedules = resources[3];
const read = (resource: Resource, id: string | number) => getRecordById<Row>(resource.store, id);
const mutations = (fixture: Fixture) => fixture.calls.filter(call => call.method !== 'GET');
let activeStore: StoreName;
let untouched: Map<StoreName, string>;

function serve(resource: Resource): Fixture {
  activeStore = resource.store;
  const fixture: Fixture = { remote: new Map(), calls: [], losePutAck: false };
  let generation = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    const method = init?.method ?? 'GET';

    if (resource.store === 'feedings' && path.startsWith('/api/feed-inventory/record-sync/')) {
      const body = init?.body ? JSON.parse(String(init.body)) as Row : {};
      return Response.json({
        ...body,
        cloudUpdatedAt: new Date(Date.UTC(2026, 10, 1, 1) + ++generation).toISOString(),
      });
    }

    fixture.calls.push({ method, path });
    if (path === resource.path && method === 'GET') return Response.json([...fixture.remote.values()]);
    if (path.startsWith(`${resource.path}/`) && method === 'PUT') {
      const id = decodeURIComponent(path.slice(resource.path.length + 1));
      const body = JSON.parse(String(init?.body)) as Row;
      const revision = Math.max(Date.UTC(2026, 10, 1, 1) + ++generation,
        Date.parse(fixture.remote.get(id)?.cloudUpdatedAt ?? firstTime) + 1);
      const saved = { ...body, id, cloudUpdatedAt: new Date(revision).toISOString() };
      fixture.remote.set(id, saved);
      if (fixture.losePutAck) { fixture.losePutAck = false; throw new TypeError('fixture PUT acknowledgement lost'); }
      return Response.json(saved);
    }
    throw new Error(`Unexpected fixture request: ${method} ${path}`);
  }));
  return fixture;
}

function changePeer(fixture: Fixture, saved: Row, deleted: boolean) {
  const id = saved.syncRecordId!;
  const remote = fixture.remote.get(id)!;
  fixture.remote.set(id, { ...remote, memo: 'peer B', note: 'peer B', cloudUpdatedAt: peerTime,
    ...(deleted ? { deletedAt: peerTime } : {}) });
}

async function freeEdit(resource: Resource, id: string | number, fixture: Fixture): Promise<Row> {
  context.plan = 'free';
  fixture.calls = [];
  vi.setSystemTime(new Date(freeTime));
  await resource.update(id, 'Free C1');
  await resource.update(id, 'Free C2');
  expect(fixture.calls).toEqual([]);
  return (await read(resource, id))!;
}

async function expectRetained(resource: Resource, fixture: Fixture, edited: Row[]) {
  const before = JSON.stringify(edited);
  context.plan = 'standard';
  const listed = await resource.list();
  expect(listed).toEqual(edited);
  expect(JSON.stringify(await getAllRecords(resource.store))).toBe(before);
  expect(mutations(fixture)).toEqual([]);
  for (const record of edited) {
    expect(record.cloudSyncPending).toBe(true);
    expect(record.fixtureBusiness).toEqual(unknownBusiness);
  }
}

beforeEach(async () => {
  context.plan = 'standard';
  localStorage.clear(); sessionStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(firstTime));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  untouched = new Map();
  for (const store of FARM_PRO_STORE_NAMES) {
    await clearStore(store);
    if (!resources.some(resource => resource.store === store)) {
      await saveRecordPreservingTimestamps(store, { id: `fixture-untouched-${store}`,
        fixtureBusiness: unknownBusiness, createdAt: firstTime, updatedAt: firstTime });
    }
    untouched.set(store, JSON.stringify(await getAllRecords(store)));
  }
});
afterEach(async () => {
  for (const store of FARM_PRO_STORE_NAMES) {
    const linkedFeedingStore = activeStore === 'feedings' && store === 'feedInventory';
    if (store !== activeStore && !linkedFeedingStore) {
      expect(JSON.stringify(await getAllRecords(store)), store).toBe(untouched.get(store));
    }
  }
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe.each(resources)('$store Free edits', resource => {
  it.each([false, true])('retains acknowledged A edited to Free C against remote deletion=%s', async deleted => {
    const fixture = serve(resource);
    const { id } = await resource.create();
    const saved = (await read(resource, id))!;
    expect(saved.cloudSyncPending).toBe(false);
    expect(saved.cloudUpdatedAt).toBeTruthy();
    const edited = await freeEdit(resource, id, fixture);
    expect(edited).toMatchObject({ id, createdAt: firstTime, updatedAt: freeTime,
      cloudUpdatedAt: saved.cloudUpdatedAt, fixtureBusiness: unknownBusiness });
    changePeer(fixture, saved, deleted);
    const peer = JSON.stringify([...fixture.remote.values()]);

    await expectRetained(resource, fixture, [edited]);

    expect(JSON.stringify([...fixture.remote.values()])).toBe(peer);
  });

  it('retains an existing pending save without an acknowledgement through repeated Free edits', async () => {
    const fixture = serve(resource);
    fixture.losePutAck = true;
    const { id } = await resource.create();
    const pending = (await read(resource, id))!;
    expect(pending.cloudUpdatedAt).toBeUndefined();
    expect(pending.cloudSyncPending).toBe(true);
    const edited = await freeEdit(resource, id, fixture);
    changePeer(fixture, pending, false);

    await expectRetained(resource, fixture, [edited]);
  });

  it('keeps never-synced Free CRUD local with pending=false and no HTTP', async () => {
    const fixture = serve(resource);
    context.plan = 'free';
    const { id } = await resource.create();
    const edited = await freeEdit(resource, id, fixture);
    expect(edited.cloudSyncPending).toBe(false);
    expect(edited.cloudUpdatedAt).toBeUndefined();
    expect(edited.fixtureBusiness).toEqual(unknownBusiness);
    expect(await resource.list()).toEqual([edited]);
    await resource.remove(id);
    expect(await getAllRecords(resource.store)).toEqual([]);
    expect(fixture.calls).toEqual([]);
  });

  it('acknowledges the next explicit paid save and permits later normal cloud receive', async () => {
    const fixture = serve(resource);
    const { id } = await resource.create();
    const edited = await freeEdit(resource, id, fixture);
    await expectRetained(resource, fixture, [edited]);
    fixture.calls = [];
    vi.setSystemTime(new Date('2026-11-04T00:00:00.000Z'));
    await resource.update(id, 'explicit paid D');
    const acknowledged = (await read(resource, id))!;
    expect(mutations(fixture)).toHaveLength(1);
    expect(acknowledged).toMatchObject({ id, createdAt: firstTime,
      cloudSyncPending: false, fixtureBusiness: unknownBusiness });
    expect(acknowledged.cloudUpdatedAt).not.toBe(edited.cloudUpdatedAt);
    const cloudId = acknowledged.syncRecordId!;
    fixture.remote.set(cloudId, { ...fixture.remote.get(cloudId)!, memo: 'later remote E', note: 'later remote E',
      cloudUpdatedAt: '2026-11-05T00:00:00.000Z' });
    fixture.calls = [];
    await resource.list();
    const received = (await read(resource, id))!;
    expect(received[resource.store === 'schedules' ? 'note' : 'memo']).toBe('later remote E');
    expect(received.cloudSyncPending).toBe(false);
    expect(mutations(fixture)).toEqual([]);
  });
});

function costing(method: FeedCostingSnapshot['allocationMethod'] = 'individual'): FeedCostingSnapshot {
  return { targetType: method === 'manual' ? 'calfGroup' : 'individual', allocationMethod: method,
    costUnit: 'kg', averageUnitCost: 11, usedQuantity: 2, usedCost: 22,
    allocations: [{ animalType: 'calf', animalId: 'fixture-calf', earTag: 'FIXTURE-CALF', animalName: 'fixture-calf',
      weight: 1, allocatedQuantity: 2, allocatedCost: 22 }], calculatedAt: firstTime };
}

describe('additional existing-record writers', () => {
  it.each([false, true])('protects a Free costing update against remote deletion=%s', async deleted => {
    const fixture = serve(inventory);
    const { id } = await inventory.create();
    const saved = (await read(inventory, id))!;
    context.plan = 'free'; fixture.calls = [];
    vi.setSystemTime(new Date(freeTime));
    await updateFeedInventoryCosting(String(id), costing());
    const edited = (await read(inventory, id))!;
    expect(edited.costing).toEqual(costing());
    expect(fixture.calls).toEqual([]);
    changePeer(fixture, saved, deleted);

    await expectRetained(inventory, fixture, [edited]);
  });

  describe.each(['complete', 'cancel'] as const)('%s schedule batch', operation => {
    it.each([false, true])('protects every Free-edited row against remote deletion=%s', async deleted => {
      const fixture = serve(schedules);
      const first = await schedules.create();
      vi.setSystemTime(new Date('2026-11-01T00:00:01.000Z'));
      const second = await schedules.create();
      const saved = [(await read(schedules, first.id))!, (await read(schedules, second.id))!];
      context.plan = 'free'; fixture.calls = [];
      vi.setSystemTime(new Date(freeTime));
      if (operation === 'complete') await completeSchedules([first.id, second.id]);
      else await cancelSynchronizationProgram('fixture-program');
      const edited = await getAllRecords<Row>('schedules');
      for (const row of edited) expect(row.status).toBe(operation === 'complete' ? '完了' : '中止');
      expect(fixture.calls).toEqual([]);
      for (const row of saved) changePeer(fixture, row, deleted);

      await expectRetained(schedules, fixture, edited);
    });
  });

  it.each(['single legacy costing', 'list legacy costing', 'tax cost reconciliation'] as const)(
    'does not clear existing Free receive protection during %s', async operation => {
      const fixture = serve(inventory);
      if (operation === 'tax cost reconciliation') {
        await createFeedInventory(withUnknown({ ...inventoryInput, transactionDate: '2026-10-30',
          transactionType: '入庫', quantity: '10', totalPrice: '110', taxExcludedPrice: '100' }));
      }
      const { id } = await createFeedInventory(withUnknown({ ...inventoryInput,
        costing: costing(operation === 'tax cost reconciliation' ? 'individual' : 'manual') }));
      const saved = (await read(inventory, id))!;
      context.plan = 'free'; fixture.calls = [];
      vi.setSystemTime(new Date(freeTime));
      await updateFeedInventory(String(id), { ...inventoryInput, memo: 'Free C' });
      if (operation === 'single legacy costing') await getFeedInventory(String(id));
      else await getFeedInventoryList();
      const edited = await getAllRecords<Row>('feedInventory');
      expect(fixture.calls).toEqual([]);
      expect((await read(inventory, id))!.costing).not.toEqual(saved.costing);
      changePeer(fixture, saved, false);
      context.plan = 'standard';
      expect(await getFeedInventoryList()).toEqual(edited);
      expect(JSON.stringify(await getAllRecords('feedInventory'))).toBe(JSON.stringify(edited));
      expect((await read(inventory, id))!.cloudSyncPending).toBe(true);
      expect(mutations(fixture)).toEqual([]);
    },
  );
});

describe.each(['single legacy costing', 'list legacy costing', 'tax cost reconciliation'] as const)(
  'paid reads with unconverted %s', operation => {
    async function original() {
      const fixture = serve(inventory);
      if (operation === 'tax cost reconciliation') {
        await createFeedInventory(withUnknown({ ...inventoryInput, transactionDate: '2026-10-30',
          transactionType: '入庫', quantity: '10', totalPrice: '110', taxExcludedPrice: '100' }));
      }
      const { id } = await createFeedInventory(withUnknown({ ...inventoryInput,
        costing: costing(operation === 'tax cost reconciliation' ? 'individual' : 'manual') }));
      return { fixture, id: String(id), saved: (await read(inventory, id))! };
    }

    async function load(id: string) {
      if (operation === 'single legacy costing') await getFeedInventory(id);
      else await getFeedInventoryList();
    }

    it('keeps raw Free C and remote B unchanged until an explicit paid update', async () => {
      const { fixture, id, saved } = await original();
      const edited = await freeEdit(inventory, id, fixture);
      expect(edited.costing).toEqual(saved.costing);
      const localBytes = JSON.stringify(await getAllRecords('feedInventory'));
      changePeer(fixture, saved, false);
      const remoteBytes = JSON.stringify([...fixture.remote.values()]);
      context.plan = 'standard';

      await load(id);

      expect(JSON.stringify(await getAllRecords('feedInventory'))).toBe(localBytes);
      expect(JSON.stringify([...fixture.remote.values()])).toBe(remoteBytes);
      expect(fixture.calls).toEqual(operation === 'single legacy costing' ? [] : [{ method: 'GET', path: inventory.path }]);
      expect((await read(inventory, id))!.cloudSyncPending).toBe(true);
      await inventory.update(id, 'explicit paid D');
      expect(mutations(fixture)).toEqual([{ method: 'PUT', path: `${inventory.path}/${encodeURIComponent(saved.syncRecordId!)}` }]);
      expect(await read(inventory, id)).toMatchObject({ id, memo: 'explicit paid D', cloudSyncPending: false,
        createdAt: saved.createdAt, fixtureBusiness: unknownBusiness, costing: saved.costing });
    });

    it('still corrects and synchronizes an acknowledged paid row', async () => {
      const { fixture, id, saved } = await original();
      expect(saved.cloudSyncPending).toBe(false);
      fixture.calls = [];
      vi.setSystemTime(new Date(freeTime));

      await load(id);

      const corrected = (await read(inventory, id))!;
      expect(corrected).toMatchObject({ id, createdAt: saved.createdAt, updatedAt: freeTime,
        fixtureBusiness: unknownBusiness, cloudSyncPending: false });
      expect(corrected.costing).not.toEqual(saved.costing);
      expect(corrected.costing).toMatchObject(operation === 'tax cost reconciliation'
        ? { averageUnitCost: 10, usedCost: 20 }
        : { allocationMethod: 'calfAgeWeighted' });
      expect(mutations(fixture)).toEqual([{ method: 'PUT', path: `${inventory.path}/${encodeURIComponent(saved.syncRecordId!)}` }]);
      expect(fixture.remote.get(saved.syncRecordId!)!.costing).toEqual(corrected.costing);
    });
  },
);
