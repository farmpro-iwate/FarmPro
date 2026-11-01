import 'fake-indexeddb/auto';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { openFarmProDatabase } from '../storage/db';
import { deleteRecord, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { Calf, CalfInput } from '../types/calf';
import { createCalf, deleteCalf, getCalfList, getCalfListForHomeSummary, promoteCalf, retryPendingCalfSync, updateCalf, type StoredCalf } from './calfApi';
import * as cattleApi from './api';
import * as acquisitionCost from './cattleAcquisitionCost';

type SyncedCalf = Calf & { syncRecordId: string; cloudUpdatedAt: string };
const beforeTime = '2026-10-30T08:00:00.000Z';
const cloudTime = '2026-10-31T08:00:00.000Z';
let sequence = 0;

function calfInput(note = 'Original calf'): CalfInput {
  return {
    calfNumber: 'FIXTURE-CALF', identificationNumber: '', name: 'Fixture calf',
    birthday: '2026-10-01', sex: '雌', motherName: 'Fixture mother', sireName: 'Fixture sire',
    startWeight: 30, currentWeight: 40, elapsedDays: 30, milkAmount: 0, starterAmount: 0,
    feedingMethod: '人工哺育', weaningPlannedDate: '', weaningDate: '', weaningStatus: '離乳前',
    weaningWeight: 0, weaningStarterAmount: 0, milkEndDate: '', managementStatus: '育成中', note,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(fulfill => { resolve = fulfill; });
  return { promise, resolve };
}

async function seedCalf(overrides: Partial<SyncedCalf> = {}): Promise<SyncedCalf> {
  return saveRecordPreservingTimestamps('calves', {
    ...calfInput(), id: 1, syncRecordId: 'manual-calf:fixture',
    createdAt: beforeTime, updatedAt: beforeTime, cloudUpdatedAt: beforeTime, ...overrides,
  });
}

function remoteCalf(record: SyncedCalf) {
  return { ...record, id: record.syncRecordId, cloudUpdatedAt: cloudTime };
}

beforeEach(async () => {
  window.history.replaceState({}, '', '/calves');
  window.localStorage.clear();
  window.localStorage.setItem('farmpro.authUser', JSON.stringify({
    id: 'calf-sync-fixture-user', farmId: `farm-calf-sync-fixture-${++sequence}`,
    farmName: 'Fixture farm', name: 'Fixture user', role: 'owner', active: true, plan: 'standard',
  }));
  window.localStorage.setItem('farmpro.authToken', 'calf-sync-fixture-token');
  await openFarmProDatabase();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  (await openFarmProDatabase()).close();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

it('keeps other calf reads and edits available while promotion cost lookup is stalled', async () => {
  await seedCalf();
  await saveRecordPreservingTimestamps('calves', {
    ...calfInput('Other calf'), id: 2, calfNumber: 'OTHER-CALF', syncRecordId: 'manual-calf:other',
    createdAt: beforeTime, updatedAt: beforeTime, cloudUpdatedAt: beforeTime,
  });
  const started = deferred<void>();
  const release = deferred<number>();
  vi.spyOn(acquisitionCost, 'getRetainedCalfProductionCost').mockImplementation(async () => {
    started.resolve(); return release.promise;
  });
  vi.spyOn(cattleApi, 'createCattle').mockResolvedValue({ id: 500 } as any);
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    Response.json(init?.method === 'PUT'
      ? { ...JSON.parse(String(init.body)), cloudUpdatedAt: cloudTime }
      : [])));

  const promoting = promoteCalf('1').catch(error => error);
  await started.promise;
  const listing = getCalfList();
  const editing = updateCalf('2', { ...calfInput('Other calf edited'), calfNumber: 'OTHER-CALF' });
  let ordinaryWorkFinished = false;
  const ordinaryWork = Promise.all([listing, editing]).then(() => { ordinaryWorkFinished = true; });
  try {
    await vi.waitFor(() => expect(ordinaryWorkFinished).toBe(true), { timeout: 500 });
    expect((await getRecordById<StoredCalf>('calves', 2))?.note).toBe('Other calf edited');
    expect((await getRecordById<StoredCalf>('calves', 1))?.promotedCattleId).toBeUndefined();
  } finally {
    release.resolve(100);
    await Promise.allSettled([promoting, ordinaryWork]);
  }
});

it.each(['edited', 'farm-switched'] as const)('does not promote a stale calf after cost lookup when %s', async (change) => {
  const original = await seedCalf();
  const started = deferred<void>();
  const release = deferred<number>();
  vi.spyOn(acquisitionCost, 'getRetainedCalfProductionCost').mockImplementation(async () => {
    started.resolve(); return release.promise;
  });
  const create = vi.spyOn(cattleApi, 'createCattle').mockResolvedValue({ id: 500 } as any);
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    Response.json(init?.method === 'PUT'
      ? { ...JSON.parse(String(init.body)), cloudUpdatedAt: cloudTime }
      : [])));

  const promoting = promoteCalf('1').catch(error => error);
  await started.promise;
  let expected = { ...original, note: 'Edited while computing cost', updatedAt: cloudTime };
  if (change === 'farm-switched') {
    const user = JSON.parse(window.localStorage.getItem('farmpro.authUser')!);
    window.localStorage.setItem('farmpro.authUser', JSON.stringify({ ...user, farmId: `${user.farmId}-other` }));
    expected = { ...original, note: 'Other farm calf', updatedAt: cloudTime };
  }
  await saveRecordPreservingTimestamps('calves', expected);
  release.resolve(100);
  expect(await promoting).toBeInstanceOf(Error);
  expect(create).not.toHaveBeenCalled();
  expect(await getAllRecords('calves')).toEqual([expected]);
});

it('keeps a Free edit local after upgrading, without giving it automatic retry ownership', async () => {
  const original = await seedCalf();
  const user = JSON.parse(window.localStorage.getItem('farmpro.authUser')!);
  window.localStorage.setItem('farmpro.authUser', JSON.stringify({ ...user, plan: 'free' }));
  const transport = vi.fn(async () => Response.json([{
    ...remoteCalf(original), note: 'Other device edit', updatedAt: '2099-01-01T00:00:00.000Z',
    cloudUpdatedAt: '2099-01-01T00:00:00.000Z',
  }]));
  vi.stubGlobal('fetch', transport);
  const saved = await updateCalf('1', calfInput('Free local edit'));
  expect(transport).not.toHaveBeenCalled();
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(user));
  await getCalfList();
  expect((await getRecordById<StoredCalf>('calves', 1))?.note).toBe('Free local edit');
  expect(await retryPendingCalfSync()).toBe(0);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(saved.cloudSyncPending).toBe(true);
  expect(saved.animalSyncOrigin).toBeUndefined();
});

it.each([undefined, beforeTime])('protects a legacy unconfirmed edit with cloud timestamp %s', async (cloudUpdatedAt) => {
  const original = await seedCalf({ note: 'Legacy local edit', updatedAt: cloudTime, cloudUpdatedAt });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([{
    ...remoteCalf(original), note: 'Other device edit', updatedAt: '2099-01-01T00:00:00.000Z',
    cloudUpdatedAt: '2099-01-01T00:00:00.000Z',
  }])));
  await getCalfList();
  expect(await getRecordById('calves', 1)).toEqual(original);
});

it('does not reinsert a calf deleted by an independent writer during GET', async () => {
  const original = await seedCalf();
  const started = deferred<void>();
  const release = deferred<Response>();
  vi.stubGlobal('fetch', vi.fn(async () => { started.resolve(); return release.promise; }));
  const receiving = getCalfList();
  await started.promise;
  await deleteRecord('calves', 1);
  release.resolve(Response.json([remoteCalf(original)]));
  await receiving;
  expect(await getAllRecords('calves')).toEqual([]);
});

it.each(['active', 'deleted'] as const)('keeps an unsent local edit when reconnecting returns an older %s cloud record', async (state) => {
  const original = await seedCalf();
  const cloud = { ...remoteCalf(original), ...(state === 'deleted' ? { deletedAt: cloudTime } : {}) };
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') throw new TypeError('Fixture: disconnected before sending');
    expect(String(input)).toBe('/api/calves/record-sync');
    return Response.json([cloud]);
  }));

  await updateCalf('1', calfInput('Unsent local edit'));
  expect((await getRecordById<SyncedCalf>('calves', 1))?.note).toBe('Unsent local edit');
  await getCalfList();
  expect((await getRecordById<SyncedCalf>('calves', 1))?.note).toBe('Unsent local edit');
  expect(await getAllRecords('calves')).toHaveLength(1);
});

it('does not recreate a calf when its local row is removed before the PUT acknowledgement arrives', async () => {
  await seedCalf();
  const started = deferred<void>();
  const release = deferred<Response>();
  let payload: Record<string, unknown> | undefined;
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method).toBe('PUT');
    payload = JSON.parse(String(init?.body));
    started.resolve();
    return release.promise;
  }));

  const editing = updateCalf('1', calfInput('Saved before deletion'));
  await started.promise;
  // An independent tab can remove the row while this response is in flight.
  await deleteRecord('calves', 1);
  release.resolve(Response.json({ ...payload, cloudUpdatedAt: cloudTime }));
  await editing;
  expect(await getRecordById('calves', 1)).toBeUndefined();
});

it('does not restore a successfully deleted calf from an earlier active GET response', async () => {
  const original = await seedCalf();
  const cloud = remoteCalf(original);
  const started = deferred<void>();
  const release = deferred<Response>();
  let getCount = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || 'GET';
    if (String(input) === '/api/calves/record-sync' && method === 'GET') {
      getCount += 1;
      if (getCount === 1) { started.resolve(); return release.promise; }
      return Response.json([cloud]);
    }
    if (method === 'DELETE') return Response.json({ ...cloud, deletedAt: cloudTime });
    throw new Error(`Unexpected request: ${method} ${String(input)}`);
  }));

  const receiving = getCalfList();
  await started.promise;
  const deleting = deleteCalf(1);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(getCount).toBe(1);
  release.resolve(Response.json([cloud]));
  await receiving;
  await deleting;
  expect(await getAllRecords('calves')).toEqual([]);
});

it.each(['GET', 'PUT'] as const)('keeps both farms separate when switching accounts during a delayed %s', async (method) => {
  const userA = JSON.parse(window.localStorage.getItem('farmpro.authUser')!);
  const original = await seedCalf();
  const userB = { ...userA, id: 'other-fixture-user', farmId: `${userA.farmId}-other` };
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(userB));
  const other = await seedCalf({ syncRecordId: 'manual-calf:other', calfNumber: 'OTHER-CALF',
    name: 'Other farm calf', motherName: 'Other mother', note: 'Other farm record' });
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(userA));
  const started = deferred<void>();
  const release = deferred<Response>();
  let payload: Record<string, unknown> | undefined;
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method || 'GET').toBe(method);
    if (init?.body) payload = JSON.parse(String(init.body));
    started.resolve();
    return release.promise;
  }));

  const work = (method === 'GET' ? getCalfList() : updateCalf('1', calfInput('Original farm edit')))
    .catch((error: unknown) => error);
  await started.promise;
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(userB));
  window.localStorage.setItem('farmpro.authToken', 'other-farm-token');
  release.resolve(Response.json(method === 'GET' ? [remoteCalf(original)] : { ...payload, cloudUpdatedAt: cloudTime }));
  await work;

  expect(await getAllRecords('calves')).toEqual([other]);
  window.localStorage.setItem('farmpro.authUser', JSON.stringify(userA));
  const after = await getRecordById<SyncedCalf>('calves', 1);
  expect(after?.note).toBe(method === 'GET' ? original.note : 'Original farm edit');
  expect(after?.syncRecordId).toBe(original.syncRecordId);
});

it('retries a failed formal registration with the same ID and create-only condition, then stops resending', async () => {
  let connected = false;
  const cloud = new Map<string, Record<string, unknown>>();
  const puts: Array<{ id: string; headers: Headers }> = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      puts.push({ id: body.id, headers: new Headers(init.headers) });
      if (!connected) throw new TypeError('Fixture offline');
      const saved = { ...body, cloudUpdatedAt: cloudTime };
      cloud.set(body.id, saved);
      return Response.json(saved);
    }
    return Response.json([...cloud.values()]);
  }));
  const saved = await createCalf(calfInput('Offline registration'));
  expect(saved.cloudSyncPending).toBe(true);
  expect(saved.animalSyncOrigin?.farmId).toContain('farm-calf-sync-fixture-');
  expect(saved.animalSyncAttempt?.id).toBe(saved.syncRecordId);
  connected = true;
  expect(await retryPendingCalfSync()).toBe(1);
  expect(await retryPendingCalfSync()).toBe(0);
  expect(puts).toHaveLength(2);
  expect(puts.every(item => item.id === saved.syncRecordId && item.headers.get('If-None-Match') === '*')).toBe(true);
  expect(cloud.size).toBe(1);
  const local = await getAllRecords<StoredCalf>('calves');
  expect(local).toHaveLength(1);
  expect(local[0]).toMatchObject({ id: saved.id, note: saved.note, cloudSyncPending: false, cloudUpdatedAt: cloudTime });
  expect(local[0].animalSyncAttempt).toBeUndefined();
});

it.each([false, true])('recognizes its lost response before %s a later edit, without another create', async (editAgain) => {
  let cloud: Record<string, unknown> | undefined;
  const puts: Array<{ payload: Record<string, unknown>; headers: Headers }> = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      const payload = JSON.parse(String(init.body));
      puts.push({ payload, headers: new Headers(init.headers) });
      cloud = { ...payload, cloudUpdatedAt: cloudTime };
      if (puts.length === 1) throw new TypeError('Fixture lost response after commit');
      return Response.json(cloud);
    }
    return Response.json(cloud ? [cloud] : []);
  }));
  const first = await createCalf(calfInput('First save reached cloud'));
  expect(first.cloudSyncPending).toBe(true);
  if (editAgain) {
    const edited = await updateCalf(String(first.id), calfInput('Second formal edit'));
    expect(edited.cloudSyncPending).toBe(false);
    expect(puts).toHaveLength(2);
    expect(puts[1].headers.get('If-Match')).toBe(JSON.stringify(cloudTime));
    expect(puts[1].headers.has('If-None-Match')).toBe(false);
    expect(cloud?.note).toBe('Second formal edit');
  } else {
    expect(await retryPendingCalfSync()).toBe(1);
    expect(puts).toHaveLength(1);
  }
  const local = await getAllRecords<StoredCalf>('calves');
  expect(local).toHaveLength(1);
  expect(local[0].id).toBe(first.id);
  expect(local[0].syncRecordId).toBe(first.syncRecordId);
  expect(local[0].cloudSyncPending).toBe(false);
});

it.each(['edited', 'deleted'] as const)('holds pending edits when another device has %s the cloud record', async (remoteState) => {
  const original = await seedCalf();
  let putCount = 0;
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') { putCount += 1; throw new TypeError('Fixture offline'); }
    return Response.json([{ ...remoteCalf(original), note: 'Another device edit',
      ...(remoteState === 'deleted' ? { deletedAt: cloudTime } : {}) }]);
  }));
  const saved = await updateCalf('1', calfInput('Unsent source stays here'));
  expect(await retryPendingCalfSync()).toBe(0);
  expect(putCount).toBe(1);
  const local = await getRecordById<StoredCalf>('calves', 1);
  expect(local?.note).toBe(saved.note);
  expect(local?.cloudSyncPending).toBe(true);
  const home = await getCalfListForHomeSummary();
  expect(home).toHaveLength(1);
  expect(home[0].note).toBe(saved.note);
});

it.each(['owner', 'user'] as const)('does not resend a pending row copied from a different %s', async (changed) => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Fixture offline'); }));
  const saved = await createCalf(calfInput());
  const user = JSON.parse(window.localStorage.getItem('farmpro.authUser')!);
  if (changed === 'owner') window.localStorage.setItem(`farmpro.animalSyncOwner.${encodeURIComponent(user.farmId)}`, 'other-browser');
  else window.localStorage.setItem('farmpro.authUser', JSON.stringify({ ...user, id: 'other-account' }));
  const transport = vi.fn();
  vi.stubGlobal('fetch', transport);
  expect(await retryPendingCalfSync()).toBe(0);
  expect(transport).not.toHaveBeenCalled();
  expect((await getRecordById<StoredCalf>('calves', saved.id))?.cloudSyncPending).toBe(true);
});

it('holds its queue when navigation enters the backup screen during retry GET', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Fixture offline'); }));
  const saved = await createCalf(calfInput());
  const started = deferred<void>();
  const release = deferred<Response>();
  const transport = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method || 'GET').toBe('GET');
    started.resolve();
    return release.promise;
  });
  vi.stubGlobal('fetch', transport);
  const retry = retryPendingCalfSync().catch(error => error);
  await started.promise;
  window.history.replaceState({}, '', '/backups');
  release.resolve(Response.json([]));
  expect(await retry).toBeInstanceOf(Error);
  expect(transport).toHaveBeenCalledTimes(1);
  expect((await getRecordById<StoredCalf>('calves', saved.id))?.cloudSyncPending).toBe(true);
});

it.each([true, false])('conditionally updates an older row only when its recorded before-content matches: %s', async (sameBefore) => {
  const original = await seedCalf({ cloudUpdatedAt: undefined });
  const puts: Headers[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      puts.push(new Headers(init.headers));
      return Response.json({ ...JSON.parse(String(init.body)), cloudUpdatedAt: cloudTime });
    }
    return Response.json([{ ...remoteCalf(original), note: sameBefore ? original.note : 'Different remote content' }]);
  }));
  const saved = await updateCalf('1', calfInput('Explicit local edit'));
  expect(puts).toHaveLength(sameBefore ? 1 : 0);
  if (sameBefore) expect(puts[0].get('If-Match')).toBe(JSON.stringify(cloudTime));
  expect(saved.cloudSyncPending).toBe(!sameBefore);
  expect((await getRecordById<StoredCalf>('calves', 1))?.note).toBe('Explicit local edit');
});

it('deletes only the known stable ID when another calf shares birthday, mother and sex', async () => {
  const original = await seedCalf();
  const deletions: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') {
      deletions.push(decodeURIComponent(String(input).split('/').pop()!));
      expect(new Headers(init.headers).get('If-Match')).toBe(JSON.stringify(beforeTime));
      return Response.json({ id: original.syncRecordId, deletedAt: cloudTime });
    }
    return Response.json([
      { ...original, id: original.syncRecordId },
      { ...original, id: 'manual-calf:another-twin', calfNumber: 'ANOTHER-CALF' },
    ]);
  }));
  await deleteCalf(1);
  expect(deletions).toEqual([original.syncRecordId]);
  expect(await getAllRecords('calves')).toEqual([]);
});

it('holds deletion of an unidentified legacy row instead of guessing a cloud ID from its appearance', async () => {
  const original = await seedCalf({ syncRecordId: undefined, cloudUpdatedAt: undefined });
  const transport = vi.fn();
  vi.stubGlobal('fetch', transport);
  await expect(deleteCalf(1)).rejects.toThrow('同期先の子牛を特定できない');
  expect(transport).not.toHaveBeenCalled();
  expect(await getRecordById('calves', 1)).toEqual(original);
});

it.each(['createdAt', 'memo'] as const)('does not acknowledge a lost response if the cloud %s has changed independently', async (field) => {
  let cloud: Record<string, unknown> | undefined;
  let putCount = 0;
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PUT') {
      putCount += 1;
      cloud = { ...JSON.parse(String(init.body)), cloudUpdatedAt: cloudTime };
      throw new TypeError('Fixture response lost');
    }
    return Response.json([{ ...cloud, [field]: field === 'createdAt' ? beforeTime : 'Different cloud memo' }]);
  }));
  const local = await createCalf(calfInput('Saved content'));
  expect(await retryPendingCalfSync()).toBe(0);
  expect(putCount).toBe(1);
  expect((await getRecordById<StoredCalf>('calves', local.id))?.cloudSyncPending).toBe(true);
});

it('does not assign another calf cloud ID to a legacy row when the same ear tag has a conflicting identification number', async () => {
  const local = await seedCalf({ syncRecordId: undefined, cloudUpdatedAt: undefined,
    calfNumber: '6613', identificationNumber: '1111111111' });
  const transport = vi.fn(async () => Response.json([{
    ...local, id: 'manual-calf:other-identity', identificationNumber: '2222222222',
    updatedAt: cloudTime, cloudUpdatedAt: cloudTime,
  }]));
  vi.stubGlobal('fetch', transport);
  await getCalfList();
  expect(await getAllRecords('calves')).toEqual([local]);
  await expect(deleteCalf(local.id)).rejects.toThrow('同期先の子牛を特定できない');
  expect(transport).toHaveBeenCalledTimes(1);
});

it('can receive an ear-tag correction for a legacy row when its nonempty identification number agrees', async () => {
  // Legacy identity format with a confirmed baseline; unconfirmed edits are
  // protected by the separate legacy tests above.
  const local = await seedCalf({ syncRecordId: undefined, cloudUpdatedAt: beforeTime,
    calfNumber: '6613', identificationNumber: '1111111111' });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([{
    ...local, id: 'manual-calf:matching-identity', calfNumber: '6614', updatedAt: cloudTime, cloudUpdatedAt: cloudTime,
  }])));
  await getCalfList();
  const rows = await getAllRecords<StoredCalf>('calves');
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ id: local.id, identificationNumber: local.identificationNumber,
    syncRecordId: 'manual-calf:matching-identity', calfNumber: '6614' });
});

it.each(['wrong-id', 'active-row'] as const)('keeps the original calf when a successful DELETE response contains a %s', async (invalidResponse) => {
  const local = await seedCalf();
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'DELETE') return Response.json({
      ...local, id: invalidResponse === 'wrong-id' ? 'manual-calf:unrelated' : local.syncRecordId,
      ...(invalidResponse === 'wrong-id' ? { deletedAt: cloudTime } : {}),
    });
    return Response.json([{ ...local, id: local.syncRecordId }]);
  }));
  await expect(deleteCalf(local.id)).rejects.toThrow('削除結果を確認できない');
  expect(await getAllRecords('calves')).toEqual([local]);
});
