import 'fake-indexeddb/auto';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openFarmProDatabase } from '../storage/db';
import { getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import {
  createCalving,
  deleteCalving,
  fetchCalving,
  fetchCalvings,
  getCalfRecoveryCandidates,
  pullNewerCalvingRecordsFromCloud as pullForCattlePlans,
  registerCalvingToCalfLedger,
  updateCalving,
  type CalvingRecord,
} from './calvingsApi';
import { pullNewerCalvingRecordsFromCloud as pullForCalvingList } from './calvingRecordSync';

let database: IDBDatabase;
let farmSequence = 0;
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');

beforeEach(async () => {
  window.localStorage.clear();
  window.localStorage.setItem('farmpro.authUser', JSON.stringify({
    id: 'calving-reader-fixture-user', farmId: `farm-calving-reader-fixture-${++farmSequence}`,
    farmName: 'Fixture farm', name: 'Fixture user', role: 'owner', active: true, plan: 'standard',
  }));
  window.localStorage.setItem('farmpro.authToken', 'calving-reader-fixture-token');
  database = await openFarmProDatabase();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks);
  else Reflect.deleteProperty(navigator, 'locks');
  (await openFarmProDatabase()).close();
  window.localStorage.clear();
});

function cloudRows(rows: unknown[]) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toBe('/api/calvings/record-sync');
    expect(init?.method || 'GET').toBe('GET');
    return new Response(JSON.stringify(rows), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function useWebLocks() {
  const running = new Map<string, Promise<unknown>>();
  const request = vi.fn((name: string, work: () => Promise<unknown>) => {
    const result = (running.get(name) ?? Promise.resolve()).catch(() => undefined).then(work);
    running.set(name, result);
    return result;
  });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
  return request;
}

it('does not restore a deleted calving when the cattle-plan reader runs before the calving-list reader', async () => {
  let cloud: (CalvingRecord & { id: string; deletedAt?: string }) | undefined;
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    requests.push(`${method} ${url}`);
    if (url === '/api/calvings/record-sync' && method === 'GET') {
      return new Response(JSON.stringify(cloud ? [cloud] : []), { status: 200 });
    }
    if (url.startsWith('/api/calvings/record-sync/') && method === 'PUT') {
      cloud = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(cloud), { status: 200 });
    }
    if (url.startsWith('/api/calvings/record-sync/') && method === 'DELETE' && cloud) {
      const deletedAt = new Date(Date.parse(cloud.updatedAt!) + 1000).toISOString();
      cloud = { ...cloud, deletedAt, updatedAt: deletedAt };
      return new Response(JSON.stringify(cloud), { status: 200 });
    }
    throw new Error(`Unexpected fixture request: ${method} ${url}`);
  }));

  const created = await createCalving({
    cowId: 'FIXTURE-COW', cowName: 'Fixture cow', actualCalvingDate: '2026-10-31',
    calfName: 'FIXTURE-CALF', calfSex: 'メス', birthWeightKg: 30,
    calvingResult: '自然分娩', colostrumStatus: '確認済み',
    // A calf which was already registered must never be generated again.
    registeredToCalfLedger: true, calfId: '41',
  });
  await deleteCalving(String(created.id));
  expect(await getAllRecords('calvings')).toEqual([]);
  expect(cloud?.deletedAt).toBeTruthy();

  // These are the real readers used by cattlePlanSnapshot and CalvingList.
  await pullForCattlePlans();
  await pullForCalvingList();
  expect(await fetchCalvings()).toEqual([]);
  expect(await getAllRecords('calvings')).toEqual([]);
  expect(await getAllRecords('calves')).toEqual([]);
  expect(requests.map(request => request.split(' ')[0])).toEqual(['PUT', 'DELETE', 'GET', 'GET']);
});

it.each(['fallback', 'Web Locks'])('serializes a delayed active GET with deletion so the calving stays deleted (%s)', async (mode) => {
  const requestLock = mode === 'Web Locks' ? useWebLocks() : undefined;
  const local = await saveRecordPreservingTimestamps('calvings', {
    id: 'delayed-active-response', memo: 'Delete this record', registeredToCalfLedger: true,
    updatedAt: '2026-10-31T08:00:00.000Z',
  });
  let started!: () => void;
  let release!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || 'GET';
    requests.push(method);
    if (String(input) === '/api/calvings/record-sync' && method === 'GET') {
      started();
      await resume;
      return new Response(JSON.stringify([local]), { status: 200 });
    }
    if (String(input) === '/api/calvings/record-sync/delayed-active-response' && method === 'DELETE') {
      return new Response(JSON.stringify({ ...local,
        deletedAt: '2026-10-31T09:00:00.000Z', updatedAt: '2026-10-31T09:00:00.000Z',
      }), { status: 200 });
    }
    throw new Error(`Unexpected request: ${method} ${String(input)}`);
  }));

  const receiving = pullForCalvingList();
  await requested;
  const deleting = deleteCalving(local.id);
  // Let deletion enter the shared lock while the earlier GET remains held.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  const requestsBeforeGetCompleted = [...requests];
  release();
  await Promise.all([receiving, deleting]);
  expect(requestsBeforeGetCompleted).toEqual(['GET']);
  expect(requests).toEqual(['GET', 'DELETE']);
  expect(await getAllRecords('calvings')).toEqual([]);
  if (requestLock) {
    expect(requestLock).toHaveBeenCalledTimes(2);
    expect(new Set(requestLock.mock.calls.map(([name]) => name)).size).toBe(1);
  }
});

it('does not report an edit as saved while an earlier deletion of the same calving is waiting', async () => {
  const local = await saveRecordPreservingTimestamps('calvings', {
    id: 'edit-during-deletion', memo: 'Before deletion', registeredToCalfLedger: true,
    updatedAt: '2026-10-31T08:00:00.000Z',
  });
  let started!: () => void;
  let release!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || 'GET';
    requests.push(method);
    if (method === 'DELETE') { started(); await resume; }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }));

  const deleting = deleteCalving(local.id);
  await requested;
  const editing = updateCalving(local.id, { ...local, memo: 'Edit made during deletion' })
    .catch((error: unknown) => error);
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  const requestsBeforeDeleteCompleted = [...requests];
  release();
  await deleting;
  const result = await editing;
  expect(requestsBeforeDeleteCompleted).toEqual(['DELETE']);
  expect(result).toBeInstanceOf(Error);
  expect((result as Error).message).toBe('分娩記録が見つかりません。');
  expect(requests).toEqual(['DELETE']);
  expect(await getAllRecords('calvings')).toEqual([]);
});

it('hides an already imported tombstone and removes its actual numeric key without changing its calf or breeding', async () => {
  const time = '2026-10-31T08:00:00.000Z';
  const deleted = await saveRecordPreservingTimestamps('calvings', {
    id: 42, cowId: 'FIXTURE-COW', actualCalvingDate: '2026-10-31',
    calfName: 'FIXTURE-CALF', calvingResult: '自然分娩', registeredToCalfLedger: false,
    calfId: '41', breedingId: 'fixture-breeding', deletedAt: time, updatedAt: time,
  });
  const calf = await saveRecordPreservingTimestamps('calves', {
    id: 41, calvingId: '42', name: 'Keep linked calf', updatedAt: time,
  });
  const breeding = await saveRecordPreservingTimestamps('breedings', {
    id: 'fixture-breeding', calvingId: '42', breedingStatus: '分娩済み', updatedAt: time,
  });
  const untouched = await saveRecordPreservingTimestamps('calvings', {
    id: 'unrelated-calving', memo: 'Keep unrelated record', registeredToCalfLedger: true, updatedAt: time,
  });
  const fetchMock = cloudRows([{ ...deleted, id: '42' }]);

  expect(await fetchCalvings()).toEqual([expect.objectContaining({ id: untouched.id })]);
  expect(await getCalfRecoveryCandidates()).toEqual([]);
  // Direct callers must not revive a deletion by registering another calf.
  await expect(registerCalvingToCalfLedger(42 as unknown as string)).rejects.toThrow('分娩記録が見つかりません。');
  await expect(fetchCalving(42 as unknown as string)).rejects.toThrow('分娩記録が見つかりません。');
  expect(fetchMock).not.toHaveBeenCalled();

  await expect(pullForCalvingList()).resolves.toEqual({ applied: 1 });
  await expect(pullForCattlePlans()).resolves.toBe(0);
  expect(await getAllRecords('calvings')).toEqual([untouched]);
  expect(await getRecordById('calvings', 42)).toBeUndefined();
  expect(await getRecordById('calvings', '42')).toBeUndefined();
  expect(await getAllRecords('calves')).toEqual([calf]);
  expect(await getAllRecords('breedings')).toEqual([breeding]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('keeps a legacy numeric key on active receive so the following deletion cannot leave a duplicate behind', async () => {
  const local = await saveRecordPreservingTimestamps('calvings', {
    id: 42, memo: 'Original numeric key', registeredToCalfLedger: true,
    updatedAt: '2026-10-31T08:00:00.000Z',
  });
  const updated = { ...local, id: '42', memo: 'Updated remotely', updatedAt: '2026-10-31T09:00:00.000Z' };
  cloudRows([updated]);
  await pullForCattlePlans();
  expect(await getAllRecords('calvings')).toEqual([{ ...updated, id: 42 }]);
  cloudRows([{ ...updated, deletedAt: '2026-10-31T10:00:00.000Z', updatedAt: '2026-10-31T10:00:00.000Z' }]);
  await pullForCalvingList();
  expect(await getAllRecords('calvings')).toEqual([]);
});

it.each(['2026-10-31T09:00:00.000Z', '2026-10-31T10:00:00.000Z'])(
  'keeps an active local edit at %s when the cloud deletion is not newer', async (updatedAt) => {
    const deletedAt = '2026-10-31T09:00:00.000Z';
    const local = await saveRecordPreservingTimestamps('calvings', {
      id: 'locally-edited', memo: 'Unsent local edit', actualCalvingDate: '2026-10-30',
      registeredToCalfLedger: true, updatedAt,
    });
    cloudRows([{ ...local, memo: 'Older cloud value', deletedAt, updatedAt: deletedAt }]);

    await expect(pullForCattlePlans()).resolves.toBe(0);
    await expect(pullForCalvingList()).resolves.toEqual({ applied: 0 });
    expect(await getAllRecords('calvings')).toEqual([local]);
    expect((await fetchCalvings())[0].memo).toBe('Unsent local edit');
  },
);

it('rechecks the current row in the deletion transaction when a local save follows the initial read', async () => {
  const local = await saveRecordPreservingTimestamps('calvings', {
    id: 'editing-during-pull', memo: 'Before edit', registeredToCalfLedger: true,
    updatedAt: '2026-10-31T08:00:00.000Z',
  });
  const latest = { ...local, memo: 'Saved during receive', updatedAt: '2026-10-31T10:00:00.000Z' };
  cloudRows([{ ...local, deletedAt: '2026-10-31T09:00:00.000Z', updatedAt: '2026-10-31T09:00:00.000Z' }]);
  const originalTransaction = database.transaction;
  let intervened = false;
  vi.spyOn(database, 'transaction').mockImplementation(function (this: IDBDatabase, names, mode, options) {
    const stores = typeof names === 'string' ? [names] : Array.from(names);
    if (!intervened && mode === 'readwrite' && stores.length === 1 && stores[0] === 'calvings') {
      intervened = true;
      const edit = originalTransaction.call(this, 'calvings', 'readwrite');
      edit.objectStore('calvings').put(latest);
    }
    return originalTransaction.call(this, names, mode, options);
  });

  await expect(pullForCalvingList()).resolves.toEqual({ applied: 0 });
  expect(intervened).toBe(true);
  expect(await getAllRecords('calvings')).toEqual([latest]);
});

it.each(['farm', 'user', 'token', 'plan'] as const)(
  'rejects a delayed receive after the %s changes, without importing or deleting records', async (changed) => {
    const originalUser = JSON.parse(window.localStorage.getItem('farmpro.authUser')!);
    const local = await saveRecordPreservingTimestamps('calvings', {
      id: 'shared-local-id', memo: 'Original farm record', updatedAt: '2026-10-31T08:00:00.000Z',
    });
    const otherUser = { ...originalUser, farmId: `${originalUser.farmId}-other` };
    window.localStorage.setItem('farmpro.authUser', JSON.stringify(otherUser));
    const other = await saveRecordPreservingTimestamps('calvings', {
      ...local, memo: 'Other farm record with the same local ID',
    });
    window.localStorage.setItem('farmpro.authUser', JSON.stringify(originalUser));
    await getAllRecords('calvings');

    let started!: () => void;
    let release!: () => void;
    const requested = new Promise<void>(resolve => { started = resolve; });
    const resume = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async () => {
      started();
      await resume;
      return new Response(JSON.stringify([
        { ...local, deletedAt: '2026-10-31T09:00:00.000Z', updatedAt: '2026-10-31T09:00:00.000Z' },
        { id: 'cloud-only', memo: 'Must not enter the new context', updatedAt: '2026-10-31T09:00:00.000Z' },
      ]), { status: 200 });
    }));
    const pending = pullForCalvingList();
    const rejected = expect(pending).rejects.toThrow('ログインまたは農場の情報が変わったため');
    await requested;
    if (changed === 'token') window.localStorage.setItem('farmpro.authToken', 'changed-token');
    else window.localStorage.setItem('farmpro.authUser', JSON.stringify({
      ...originalUser,
      ...(changed === 'farm' ? { farmId: otherUser.farmId } :
        changed === 'user' ? { id: 'changed-user' } : { plan: 'free' }),
    }));
    release();
    await rejected;

    window.localStorage.setItem('farmpro.authUser', JSON.stringify(originalUser));
    expect(await getAllRecords('calvings')).toEqual([local]);
    window.localStorage.setItem('farmpro.authUser', JSON.stringify(otherUser));
    expect(await getAllRecords('calvings')).toEqual([other]);
  },
);

it.each(['lock wait', 'DELETE response'] as const)('keeps both farms unchanged when switching farms during %s', async (phase) => {
  const originalUser = JSON.parse(window.localStorage.getItem('farmpro.authUser')!);
  const local = await saveRecordPreservingTimestamps('calvings', {
    id: 'shared-local-id', memo: 'Original farm', updatedAt: '2026-10-31T08:00:00.000Z',
  });
  const otherUser = { ...originalUser, id: 'other-user', farmId: `${originalUser.farmId}-other` };
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(otherUser));
  const other = await saveRecordPreservingTimestamps('calvings', { ...local, memo: 'Other farm' });
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(originalUser));
  await getAllRecords('calvings');

  let started!: () => void;
  let release!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  const resume = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || 'GET';
    requests.push(method);
    started();
    await resume;
    return new Response(JSON.stringify(method === 'GET' ? [local] : { ok: true }), { status: 200 });
  }));
  const receiving = phase === 'lock wait' ? pullForCalvingList() : undefined;
  const received = receiving ? expect(receiving).rejects.toThrow('ログインまたは農場の情報が変わったため') : undefined;
  if (receiving) await requested;
  const deleting = deleteCalving(local.id);
  const deleted = expect(deleting).rejects.toThrow('ログインまたは農場の情報が変わったため');
  if (!receiving) await requested;
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(otherUser));
  window.localStorage.setItem('farmpro.authToken', 'other-farm-token');
  release();
  await Promise.all([received, deleted]);

  expect(requests).toEqual([phase === 'lock wait' ? 'GET' : 'DELETE']);
  expect(await getAllRecords('calvings')).toEqual([other]);
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(originalUser));
  expect(await getAllRecords('calvings')).toEqual([local]);
});

it.each(['GET', 'DELETE'] as const)('aborts a stalled %s at its deadline and releases the shared lock', async (method) => {
  const local = await saveRecordPreservingTimestamps('calvings', {
    id: 'timeout-fixture', memo: 'Keep until deletion succeeds', registeredToCalfLedger: true,
    updatedAt: '2026-10-31T08:00:00.000Z',
  });
  const originalSetTimeout = globalThis.setTimeout;
  let expire!: () => void;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, delay, ...args) => {
    if (delay === 12000 && typeof callback === 'function') expire = () => callback(...args);
    return originalSetTimeout(callback, delay, ...args);
  });
  let started!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const currentMethod = init?.method || 'GET';
    requests.push(currentMethod);
    if (requests.length === 1) {
      started();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
    }
    return new Response(JSON.stringify(currentMethod === 'GET' ? [local] : { ok: true }), { status: 200 });
  }));

  const blocked = method === 'GET' ? pullForCalvingList() : deleteCalving(local.id);
  const failed = expect(blocked).rejects.toThrow('時間切れ');
  await requested;
  const queued = method === 'GET' ? deleteCalving(local.id) : pullForCalvingList();
  expect(expire).toBeTypeOf('function');
  expire();
  await failed;
  await queued;
  expect(requests).toEqual(method === 'GET' ? ['GET', 'DELETE'] : ['DELETE', 'GET']);
  expect(await getAllRecords('calvings')).toEqual(method === 'GET' ? [] : [local]);
});
