import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import * as repository from '../storage/repository';
import * as database from '../storage/db';
import { createMaster, getMasterListForPageOpen, updateMaster } from './masterApi';
import type { Master } from '../types/master';

const environment = vi.hoisted(() => ({ plan: 'standard', token: 'fixture-token', farmId: 'fixture-master-farm' }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => environment.plan }));
vi.mock('../plans/policy', () => ({ getFarmProPlan: () => ({ multiDeviceSync: environment.plan !== 'free' }) }));
vi.mock('./authClient', () => ({ getAuthToken: () => environment.token,
  getStoredAuthUser: () => ({ id: 'fixture-user', farmId: environment.farmId, plan: environment.plan }) }));

type Stored = Master & { syncId?: string; cloudUpdatedAt?: string; masterSyncFreeEditPending?: true; [key: string]: unknown };
type Cloud = Omit<Stored, 'id'> & { id: string; legacyId?: number; deletedAt?: string };
const input = { category: 'feed' as const, name: 'fixture feed', note: 'A' };
const future = '2099-01-01T00:00:00.000Z';
const originalDate = '2020-01-01T00:00:00.000Z';
const marker = 'masterSyncFreeEditPending';
const unrelated = ['cattle', 'calves', 'breedings', 'calvings', 'supplyInventory', 'expenses'] as const;
let cloud: Cloud | undefined;
let requests: { method: string; body?: Cloud }[];
let rejectPut: boolean;
let delayPut: Promise<void> | undefined;
let delayGet: Promise<void> | undefined;
let alterAck: ((record: Cloud) => Cloud) | undefined;

beforeEach(async () => {
  environment.plan = 'standard'; environment.token = 'fixture-token'; environment.farmId = 'fixture-master-farm';
  cloud = undefined; requests = []; rejectPut = false; delayPut = undefined; delayGet = undefined; alterAck = undefined;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  for (const store of ['masters', ...unrelated] as const) await clearStore(store);
  for (const store of unrelated) await saveRecordPreservingTimestamps(store, {
    id: `protected-${store}`, memo: 'unchanged', createdAt: originalDate, updatedAt: originalDate,
  });
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) as Cloud : undefined;
    requests.push({ method, ...(body ? { body } : {}) });
    if (method === 'GET' && String(url) === '/api/masters/record-sync') {
      const response = Response.json(cloud ? [cloud] : []);
      if (delayGet) await delayGet;
      return response;
    }
    if (method === 'PUT' && String(url).startsWith('/api/masters/record-sync/')) {
      if (rejectPut) return Response.json({ message: 'fixture rejection' }, { status: 409 });
      cloud = { ...body!, cloudUpdatedAt: new Date().toISOString() };
      const response = Response.json(alterAck ? alterAck(cloud) : cloud);
      if (delayPut) await delayPut;
      return response;
    }
    throw new Error(`Unexpected ${method} ${String(url)}`);
  }));
});

afterEach(async () => {
  environment.plan = 'standard'; environment.farmId = 'fixture-master-farm'; environment.token = 'fixture-token';
  for (const store of unrelated) expect(await getAllRecords(store)).toEqual([{
    id: `protected-${store}`, memo: 'unchanged', createdAt: originalDate, updatedAt: originalDate,
  }]);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function acknowledged(): Promise<Stored> {
  const created = await createMaster(input);
  const saved = await getRecordById<Stored>('masters', created.id);
  const record: Stored = { ...saved!, createdAt: '2020-01-01T00:00:00.000Z',
    unknownBusiness: { price: '00012.50', values: [null, 'kept'] } };
  await saveRecordPreservingTimestamps('masters', record);
  requests = [];
  return record;
}

describe('master Free edits survive later cloud reads', () => {
  it.each(['create', 'update'] as const)('does not send or write a %s started in a different plan/account context', async operation => {
    for (const change of ['plan', 'farm', 'token'] as const) {
      environment.plan = 'standard'; environment.farmId = 'fixture-master-farm'; environment.token = 'fixture-token';
      await clearStore('masters');
      const original = await acknowledged(); environment.plan = 'free';
      const open = database.openFarmProDatabase; let armed = true;
      const spy = vi.spyOn(database, 'openFarmProDatabase').mockImplementation(async () => {
        const db = await open();
        if (armed) {
          armed = false;
          if (change === 'plan') environment.plan = 'standard';
          else if (change === 'farm') environment.farmId = 'different-farm';
          else environment.token = 'different-token';
        }
        return db;
      });
      const action = operation === 'create' ? createMaster({ ...input, name: 'different master' }) :
        updateMaster(original.id, { ...input, note: 'started in Free' });
      await expect(action).rejects.toThrow();
      spy.mockRestore();
      expect(requests).toEqual([]);
      if (change === 'farm') expect(await getAllRecords('masters')).toEqual([]);
      environment.plan = 'standard'; environment.farmId = 'fixture-master-farm'; environment.token = 'fixture-token';
      expect(await getAllRecords('masters')).toEqual([original]);
    }
  });

  it.each(['update', 'delete'] as const)('preserves Free C when the peer %s has a later timestamp', async change => {
    const original = await acknowledged(); environment.plan = 'free';
    await updateMaster(original.id, { ...input, note: 'Free C' });
    const edited = await getRecordById<Stored>('masters', original.id);
    expect(requests).toEqual([]);
    cloud = { ...cloud!, note: 'peer B', updatedAt: future, ...(change === 'delete' ? { deletedAt: future } : {}) };
    const peer = structuredClone(cloud);
    environment.plan = 'standard';
    expect(await getMasterListForPageOpen()).toEqual([edited]);
    expect(await getRecordById('masters', original.id)).toEqual(edited);
    expect(cloud).toEqual(peer);
    expect(requests.every(request => request.method === 'GET')).toBe(true);
  });

  it('keeps the edit after a failed explicit save, then clears only its protection after an accepted save', async () => {
    const original = await acknowledged(); environment.plan = 'free';
    await updateMaster(original.id, { ...input, note: 'Free C' });
    environment.plan = 'pro'; rejectPut = true;
    await updateMaster(original.id, { ...input, note: 'explicit C' });
    const pending = await getRecordById<Stored>('masters', original.id);
    cloud = { ...cloud!, note: 'peer later', updatedAt: future };
    expect(await getMasterListForPageOpen()).toEqual([pending]);
    rejectPut = false;
    await updateMaster(original.id, { ...input, note: 'confirmed C' });
    const confirmed = await getRecordById<Stored>('masters', original.id);
    expect(confirmed).toMatchObject({ id: original.id, syncId: original.syncId, note: 'confirmed C',
      createdAt: original.createdAt, unknownBusiness: original.unknownBusiness });
    expect(confirmed).not.toHaveProperty(marker);
    expect(requests.filter(request => request.method === 'PUT').every(request => !(marker in request.body!))).toBe(true);
    cloud = { ...cloud!, note: 'next ordinary peer edit', updatedAt: future };
    expect((await getMasterListForPageOpen())[0].note).toBe('next ordinary peer edit');
  });

  it.each(['edit', 'delete'] as const)('does not let a late paid acknowledgement undo a subsequent local %s', async action => {
    const original = await acknowledged();
    let release!: () => void; delayPut = new Promise(resolve => { release = resolve; });
    const pending = updateMaster(original.id, { ...input, note: 'paid B' });
    await vi.waitFor(() => expect(requests.some(request => request.method === 'PUT')).toBe(true));
    environment.plan = 'free';
    await updateMaster(original.id, { ...input, note: 'Free C after B request' });
    if (action === 'delete') await repository.deleteRecord('masters', original.id);
    const edited = await getRecordById<Stored>('masters', original.id);
    environment.plan = 'standard';
    release(); await pending;
    expect(await getRecordById('masters', original.id)).toEqual(edited);
  });

  it.each(['update', 'delete'] as const)('checks the current original after a delayed cloud %s response', async action => {
    const original = await acknowledged();
    cloud = { ...cloud!, note: 'peer B', updatedAt: future, ...(action === 'delete' ? { deletedAt: future } : {}) };
    let release!: () => void; delayGet = new Promise(resolve => { release = resolve; });
    let snapshotTaken!: () => void; const snapshot = new Promise<void>(resolve => { snapshotTaken = resolve; });
    const read = repository.getAllRecords;
    vi.spyOn(repository, 'getAllRecords').mockImplementation(async (...args) => {
      const rows = await read(...args);
      if (args[0] === 'masters') snapshotTaken();
      return rows as never;
    });
    const pending = getMasterListForPageOpen(); await snapshot;
    environment.plan = 'free';
    await updateMaster(original.id, { ...input, note: 'Free C after read started' });
    const edited = await getRecordById<Stored>('masters', original.id);
    environment.plan = 'standard';
    release(); await pending;
    expect(await getRecordById('masters', original.id)).toEqual(edited);
  });

  it.each(['tombstone', 'id', 'content'] as const)('keeps Free protection when a 200 ACK has invalid %s', async kind => {
    const original = await acknowledged(); environment.plan = 'free';
    await updateMaster(original.id, { ...input, note: 'Free C' });
    environment.plan = 'standard';
    alterAck = record => kind === 'tombstone' ? { ...record, deletedAt: future } :
      kind === 'id' ? { ...record, id: 'different-id' } : { ...record, note: 'unaccepted value' };
    await updateMaster(original.id, { ...input, note: 'explicit C' });
    const pending = await getRecordById<Stored>('masters', original.id);
    expect(pending).toMatchObject({ note: 'explicit C', [marker]: true, unknownBusiness: original.unknownBusiness });
    cloud = { ...cloud!, note: 'peer B', updatedAt: future, deletedAt: future };
    expect(await getMasterListForPageOpen()).toEqual([pending]);
  });

  it('keeps Free-only creation and editing local, including a same-name peer on upgrade', async () => {
    environment.plan = 'free';
    const local = await createMaster(input); await updateMaster(local.id, { ...input, note: 'local C' });
    const edited = await getRecordById<Stored>('masters', local.id);
    expect(requests).toEqual([]);
    cloud = { ...input, id: 'master:feed:fixture%20feed', active: true, note: 'same-name peer',
      createdAt: future, updatedAt: future, cloudUpdatedAt: future };
    environment.plan = 'standard';
    expect(await getMasterListForPageOpen()).toEqual([edited]);
    expect(requests.every(request => request.method === 'GET')).toBe(true);
  });
});
