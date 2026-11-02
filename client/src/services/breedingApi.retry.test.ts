import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { Breeding, BreedingInput } from '../types/breeding';
import {
  BREEDING_SYNC_STATUS_EVENT, createBreeding, getBreedingSyncContext, getBreedingSyncStatus,
  retryPendingBreedingSync, syncBreedingRecordToCloud, updateBreeding,
} from './breedingApi';
import { toCloudBreeding } from './breedingSyncProtocol';

const { context } = vi.hoisted(() => ({ context: {
  planId: 'standard', token: 'breeding-retry-token',
  user: { id: 'breeding-retry-user', farmId: 'breeding-retry-farm' },
} }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => context.planId }));
vi.mock('./authClient', () => ({ getAuthToken: () => context.token, getStoredAuthUser: () => context.user }));
vi.mock('./supplyInventorySync', () => ({ syncSupplyInventorySafely: vi.fn(async () => false) }));

const input = {
  cowEarTag: 'RETRY-COW', cowName: '再送検証牛', heatDate: '2026-11-01',
  breedingMethod: '種付', breedingStatus: '種付実施', inseminationDate: '2026-11-02',
  inseminationCost: '01200', bullName: '', inseminatorName: '', note: 'fixture local change',
} as BreedingInput;
const firstTime = '2026-11-01T00:00:00.000Z';
const expense = {
  id: 'breeding-retry-expense', sourceType: 'breeding', sourceId: 'existing-fee-source',
  sourceDetail: 'insemination', amount: '00120', note: 'must remain byte-for-byte identical',
  createdAt: firstTime, updatedAt: firstTime,
};
const ownerKey = 'farmpro.breedingSyncOwner.breeding-retry-farm';
const queueId = (record: StoredRecord) => `supply-linked-sync:breedings:${encodeURIComponent(String(record.cloudRecordId ?? record.id))}`;
const read = (id: string | number) => getRecordById<StoredRecord>('breedings', id);

type Call = { id: string; method: string; body?: StoredRecord; headers: Headers };
type Fixture = {
  remote: Map<string, StoredRecord>;
  calls: Call[];
  beforeGet?: (call: Call) => void | Promise<void>;
  beforePut?: (call: Call) => void | Promise<void>;
  failPut?: boolean;
  loseAck?: boolean;
};

function serve(): Fixture {
  const fixture: Fixture = { remote: new Map(), calls: [] };
  let revision = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (!path.startsWith('/api/breedings/record-sync/')) throw new Error(`Unexpected retry endpoint: ${path}`);
    const call: Call = { id: decodeURIComponent(path.split('/').pop()!), method: init?.method ?? 'GET',
      headers: new Headers(init?.headers), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) };
    fixture.calls.push(call);
    if (call.method === 'GET') {
      await fixture.beforeGet?.(call);
      const remote = fixture.remote.get(call.id);
      return remote ? Response.json(remote) : new Response(null, { status: 404 });
    }
    if (call.method !== 'PUT') throw new Error(`Unexpected retry mutation: ${call.method}`);
    await fixture.beforePut?.(call);
    const remote = fixture.remote.get(call.id);
    const matches = remote ? call.headers.get('If-Match') === JSON.stringify(remote.cloudUpdatedAt)
      : call.headers.get('If-None-Match') === '*';
    if (remote?.deletedAt || !matches) return Response.json({ message: 'fixture competing change' }, { status: 412 });
    if (fixture.failPut) return Response.json({ message: 'fixture unavailable' }, { status: 503 });
    const saved = { ...call.body!, cloudUpdatedAt: new Date(Date.parse('2026-11-03T00:00:00Z') + ++revision).toISOString() };
    fixture.remote.set(call.id, saved);
    if (fixture.loseAck) throw new TypeError('fixture ACK lost');
    return Response.json(saved);
  }));
  return fixture;
}

async function createPending(suffix = 'one'): Promise<StoredRecord> {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fixture offline'); }));
  await expect(createBreeding({ ...input, cowEarTag: `RETRY-COW-${suffix}` })).rejects.toThrow('fixture offline');
  const saved = (await getAllRecords<StoredRecord>('breedings')).find(record => record.cowEarTag === `RETRY-COW-${suffix}`)!;
  expect(saved).toMatchObject({ recordKind: 'standard', cloudSyncPending: true,
    breedingSyncOrigin: { version: 1, farmId: context.user.farmId, userId: context.user.id, ownerId: expect.any(String) } });
  return saved;
}

beforeEach(async () => {
  context.planId = 'standard'; context.token = 'breeding-retry-token';
  context.user = { id: 'breeding-retry-user', farmId: 'breeding-retry-farm' };
  window.localStorage.clear(); window.sessionStorage.clear();
  window.history.replaceState({}, '', '/breedings');
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  for (const store of ['breedings', 'expenses', 'masters', 'metadata', 'supplyInventory'] as const) await clearStore(store);
  await saveRecordPreservingTimestamps('expenses', expense);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('ordinary breeding automatic retries', () => {
  it('retries only the formally saved source, preserving costs, timestamps, unknown local history and all expenses', async () => {
    const saved = await createPending();
    const pending = { ...saved, localHistory: { calvingId: 'local-only', amount: '00120' } };
    await saveRecordPreservingTimestamps('breedings', pending);
    const fixture = serve();
    const events = vi.fn();
    window.addEventListener(BREEDING_SYNC_STATUS_EVENT, events);
    try {
      expect(getBreedingSyncContext()).toMatchObject({ farmId: context.user.farmId, userId: context.user.id, cloudEnabled: true });
      expect(getBreedingSyncStatus(pending as unknown as Breeding)).toMatchObject({ pending: true });
      expect(events).not.toHaveBeenCalled();
      expect(await retryPendingBreedingSync()).toBe(1);
      const acknowledged = await read(pending.id);
      expect(acknowledged).toMatchObject({ id: pending.id, cloudSyncPending: false,
        inseminationCost: '01200', createdAt: pending.createdAt, updatedAt: pending.updatedAt, localHistory: pending.localHistory });
      for (const field of ['breedingSyncOrigin', 'breedingSyncBase', 'breedingSyncAttempt', 'breedingSyncWarning', 'breedingSyncBlocked']) {
        expect(acknowledged).not.toHaveProperty(field);
      }
      expect(getBreedingSyncStatus(acknowledged as Breeding)).toEqual({ pending: false });
      const put = fixture.calls.find(call => call.method === 'PUT')!;
      expect(put.headers.get('If-None-Match')).toBe('*');
      expect(put.body).toMatchObject({ inseminationCost: '01200', createdAt: pending.createdAt, updatedAt: pending.updatedAt });
      expect(Object.keys(put.body!).some(key => key.startsWith('breedingSync'))).toBe(false);
      expect(put.body).not.toHaveProperty('localHistory');
      expect(await getAllRecords('expenses')).toEqual([expense]);
      expect(events).toHaveBeenCalled();
      expect(await retryPendingBreedingSync()).toBe(0);
      expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(1);
    } finally { window.removeEventListener(BREEDING_SYNC_STATUS_EVENT, events); }
  });

  it('retries a formal edit with its server revision without updating its related expenses', async () => {
    const original = { ...input, id: 'retry-edit', recordKind: 'standard', cloudRecordId: 'cloud-retry-edit',
      cloudSyncPending: false, cloudUpdatedAt: firstTime, createdAt: firstTime, updatedAt: firstTime };
    await saveRecordPreservingTimestamps('breedings', original);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fixture offline'); }));
    await expect(updateBreeding(original.id, { ...input, note: 'edited offline', inseminationCost: '25000' })).rejects.toThrow('fixture offline');
    const pending = await read(original.id);
    expect(pending).toHaveProperty('breedingSyncOrigin');
    const fixture = serve();
    fixture.remote.set(original.cloudRecordId, { ...toCloudBreeding(original), cloudUpdatedAt: firstTime });
    expect(await retryPendingBreedingSync()).toBe(1);
    const put = fixture.calls.find(call => call.method === 'PUT')!;
    expect(put.headers.get('If-Match')).toBe(JSON.stringify(firstTime));
    expect(await read(original.id)).toMatchObject({ note: 'edited offline', inseminationCost: '25000', cloudSyncPending: false });
    expect(await getAllRecords('expenses')).toEqual([expense]);
  });

  it('confirms a lost PUT acknowledgement by readback without another PUT', async () => {
    const saved = await createPending();
    const fixture = serve(); fixture.loseAck = true;
    expect(await retryPendingBreedingSync()).toBe(0);
    const attempted = await read(saved.id);
    expect(attempted).toMatchObject({ cloudSyncPending: true, breedingSyncAttempt: { version: 1 } });
    expect(getBreedingSyncStatus(attempted as Breeding).warning).toContain('ACK lost');
    fixture.loseAck = false;
    expect(await retryPendingBreedingSync()).toBe(1);
    expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(1);
    expect(await getAllRecords('expenses')).toEqual([expense]);
  });

  it('retains a failed conditional attempt and retries the same source after communication recovers', async () => {
    const saved = await createPending();
    const fixture = serve(); fixture.failPut = true;
    expect(await retryPendingBreedingSync()).toBe(0);
    expect(await read(saved.id)).toMatchObject({ cloudSyncPending: true, breedingSyncWarning: 'fixture unavailable',
      breedingSyncBase: { version: 1, record: null }, breedingSyncAttempt: { version: 1 } });
    expect((await read(saved.id))?.breedingSyncBlocked).not.toBe(true);
    fixture.failPut = false;
    expect(await retryPendingBreedingSync()).toBe(1);
    expect(fixture.calls.filter(call => call.method === 'PUT').every(call => call.headers.get('If-None-Match') === '*')).toBe(true);
    expect(await getAllRecords('expenses')).toEqual([expense]);
  });

  it('holds a 412 as blocked without unconditional resend, and only a formal edit clears the block', async () => {
    const saved = await createPending();
    const fixture = serve();
    const peer = { ...toCloudBreeding(saved), note: 'peer record', cloudUpdatedAt: firstTime };
    fixture.beforePut = call => { fixture.remote.set(call.id, peer); };
    expect(await retryPendingBreedingSync()).toBe(0);
    const blocked = await read(saved.id);
    expect(blocked).toMatchObject({ cloudSyncPending: true, breedingSyncBlocked: true, breedingSyncWarning: 'fixture competing change' });
    const count = fixture.calls.length;
    expect(await retryPendingBreedingSync()).toBe(0);
    expect(fixture.calls).toHaveLength(count);
    expect(fixture.remote.get(String(saved.id))).toEqual(peer);
    expect(await getAllRecords('expenses')).toEqual([expense]);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fixture offline'); }));
    await expect(updateBreeding(saved.id, { ...input, cowEarTag: String(saved.cowEarTag), note: 'formal edit' })).rejects.toThrow('fixture offline');
    expect((await read(saved.id))?.breedingSyncBlocked).not.toBe(true);
  });

  it.each(['peer', 'deleted'] as const)('does not overwrite a %s record found during automatic readback', async kind => {
    const saved = await createPending();
    const fixture = serve();
    const peer = { ...toCloudBreeding(saved), note: 'peer-owned content', cloudUpdatedAt: firstTime,
      ...(kind === 'deleted' ? { deletedAt: firstTime } : {}) };
    fixture.remote.set(String(saved.id), peer);
    expect(await retryPendingBreedingSync()).toBe(0);
    expect(await read(saved.id)).toMatchObject({ note: saved.note, cloudSyncPending: true, breedingSyncBlocked: true });
    expect(fixture.calls.map(call => call.method)).toEqual(['GET']);
    expect(fixture.remote.get(String(saved.id))).toEqual(peer);
    expect(await getAllRecords('expenses')).toEqual([expense]);
  });

  it('excludes legacy, foreign, nonstandard, deleted and inventory-linked records including malformed or foreign queues', async () => {
    const saved = await createPending();
    await clearStore('breedings');
    const origin = saved.breedingSyncOrigin as Record<string, unknown>;
    const changes: Array<Record<string, unknown>> = [
      { breedingSyncOrigin: undefined }, { breedingSyncOrigin: { ...origin, ownerId: 'another-browser' } },
      { breedingSyncOrigin: { ...origin, farmId: 'another-farm' } }, { breedingSyncOrigin: { ...origin, userId: 'another-user' } },
      { breedingSyncOrigin: { ...origin, version: 2 } }, { recordKind: undefined }, { recordKind: 'synchronization' },
      { deletedAt: firstTime }, { breedingSyncDeletePending: true }, { breedingSyncBlocked: true },
      { embryoSource: 'farm_stock' }, { embryoInventoryMovementId: 'stock-use' }, { embryoInventoryBatchKey: 'stock-batch' },
      { note: 'foreign queue' }, { note: 'malformed queue' },
    ];
    for (const [index, change] of changes.entries()) {
      const row = { ...saved, ...change, id: `excluded-${index}`, cowEarTag: `excluded-cow-${index}` };
      await saveRecordPreservingTimestamps('breedings', row);
      if (index >= changes.length - 2) await saveRecordPreservingTimestamps('metadata', {
        id: queueId(row), ...(index === changes.length - 2 ? { ownerId: 'foreign-owner', version: 1 } : { invalid: true }),
      });
    }
    const before = await getAllRecords('breedings');
    const fixture = serve();
    expect(await retryPendingBreedingSync()).toBe(0);
    expect(fixture.calls).toEqual([]);
    expect(await getAllRecords('breedings')).toEqual(before);
    expect(await getAllRecords('expenses')).toEqual([expense]);
    expect(getBreedingSyncStatus({ ...saved, breedingSyncDeletePending: true } as unknown as Breeding)).toMatchObject({ pending: false, warning: expect.any(String) });
  });

  it('does not claim a Free save or an old manual sync as a new automatic origin', async () => {
    context.planId = 'free';
    const free = await createBreeding({ ...input, inseminationCost: '' });
    expect((free as StoredRecord).breedingSyncOrigin).toBeUndefined();
    expect(getBreedingSyncStatus({ ...free, cloudSyncPending: true })).toEqual({ pending: false });
    context.planId = 'standard';
    await saveRecordPreservingTimestamps('breedings', { ...free, cloudSyncPending: true });
    const fixture = serve();
    expect(await retryPendingBreedingSync()).toBe(0);
    expect(fixture.calls).toEqual([]);
    const legacy = { ...free, cloudSyncPending: true, breedingSyncBase: { version: 1, record: null } };
    await saveRecordPreservingTimestamps('breedings', legacy);
    const saved = await syncBreedingRecordToCloud(legacy);
    expect(saved.cloudSyncPending).toBe(false);
    expect((saved as StoredRecord).breedingSyncOrigin).toBeUndefined();
    expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(1);
  });

  it.each(['/breedings/new', '/breedings/one/edit', '/device-sync', '/backups', '/settlements', '/treatments'])('does not retry on %s', async pathname => {
    await createPending();
    const fixture = serve();
    window.history.replaceState({}, '', pathname);
    expect(await retryPendingBreedingSync()).toBe(0);
    expect(fixture.calls).toEqual([]);
  });

  it.each(['/', '/breedings/'])('allows a source-only retry on %s', async pathname => {
    await createPending();
    const fixture = serve();
    window.history.replaceState({}, '', pathname);
    expect(await retryPendingBreedingSync()).toBe(1);
    expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(1);
    expect(await getAllRecords('expenses')).toEqual([expense]);
  });

  it('serializes concurrent retry triggers so only one PUT acknowledges the pending record', async () => {
    await createPending();
    const fixture = serve();
    expect((await Promise.all([retryPendingBreedingSync(), retryPendingBreedingSync()])).sort()).toEqual([0, 1]);
    expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(1);
    expect(await getAllRecords('expenses')).toEqual([expense]);
  });

  it('does not send a captured row or write its warning over a newer local edit', async () => {
    const saved = await createPending();
    const fixture = serve();
    const newer = { ...saved, note: 'newer local edit', updatedAt: '2026-11-04T00:00:00.000Z' };
    fixture.beforeGet = async () => { await saveRecordPreservingTimestamps('breedings', newer); };
    expect(await retryPendingBreedingSync()).toBe(0);
    expect(await read(saved.id)).toEqual(newer);
    expect(fixture.calls.map(call => call.method)).toEqual(['GET']);
  });

  it.each(['GET', 'PUT'] as const)('keeps a linked queue that appears while the %s response is pending', async phase => {
    const saved = await createPending();
    const fixture = serve();
    const insertQueue = async () => { await saveRecordPreservingTimestamps('metadata', { id: queueId(saved), invalid: 'must not bypass' }); };
    if (phase === 'GET') fixture.beforeGet = insertQueue;
    else fixture.beforePut = insertQueue;
    expect(await retryPendingBreedingSync()).toBe(0);
    expect(await read(saved.id)).toMatchObject({ cloudSyncPending: true });
    expect((await read(saved.id))?.breedingSyncBlocked).not.toBe(true);
    expect(fixture.calls.filter(call => call.method === 'PUT')).toHaveLength(phase === 'GET' ? 0 : 1);
    expect(await getRecordById('metadata', queueId(saved))).toMatchObject({ invalid: 'must not bypass' });
    expect(await getAllRecords('expenses')).toEqual([expense]);
  });
});

describe('breeding automatic retry interruption boundaries', () => {
  function changeContext(kind: string) {
    if (kind === 'farm') context.user = { ...context.user, farmId: 'another-farm' };
    else if (kind === 'user') context.user = { ...context.user, id: 'another-user' };
    else if (kind === 'token') context.token = 'replacement-token';
    else if (kind === 'plan') context.planId = 'pro';
    else if (kind === 'owner') window.localStorage.setItem(ownerKey, 'replacement-owner');
    else if (kind === 'page') window.history.replaceState({}, '', '/breedings/new');
    else if (kind === 'allowed page') window.history.replaceState({}, '', '/');
    else if (kind === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    else vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  }

  it.each(['farm', 'user', 'token', 'plan', 'owner', 'page', 'allowed page', 'offline', 'hidden'])('stops PUT and the next row after %s changes during GET', async kind => {
    const first = await createPending('one'); await createPending('two');
    const before = await getAllRecords('breedings');
    const fixture = serve();
    fixture.beforeGet = () => { changeContext(kind); };
    await expect(retryPendingBreedingSync()).rejects.toBeInstanceOf(Error);
    expect(fixture.calls).toHaveLength(1);
    expect(fixture.calls[0].method).toBe('GET');
    context.user = { id: 'breeding-retry-user', farmId: 'breeding-retry-farm' };
    expect(await getAllRecords('breedings')).toEqual(before);
    expect((await read(first.id))?.cloudSyncPending).toBe(true);
    expect(await getAllRecords('expenses')).toEqual([expense]);
  });

  it.each(['owner', 'page', 'allowed page'])('stops ACK and the next row after %s changes during PUT', async kind => {
    await createPending('one'); await createPending('two');
    const fixture = serve();
    fixture.beforePut = () => { changeContext(kind); };
    await expect(retryPendingBreedingSync()).rejects.toBeInstanceOf(Error);
    expect(fixture.calls.map(call => call.method)).toEqual(['GET', 'PUT']);
    const rows = await getAllRecords<StoredRecord>('breedings');
    expect(rows.every(row => row.cloudSyncPending === true && row.breedingSyncOrigin)).toBe(true);
    expect(await getAllRecords('expenses')).toEqual([expense]);
  });
});
