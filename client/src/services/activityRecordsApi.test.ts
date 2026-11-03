import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import { createFarmProBackup } from '../storage/backup';
import type { ActivityRecord, ActivityRecordInput } from '../types/activityRecord';
import {
  ActivityRecordLocalSaveError, createActivityRecord, deleteActivityRecord, getActivityRecord,
  getActivityRecords, retryPendingActivityRecordSync, updateActivityRecord,
} from './activityRecordsApi';
import { toCloudFeedingFattening } from './feedingFatteningSyncProtocol';

const context = vi.hoisted(() => ({ plan: 'standard', token: 'activity-fixture-token', farmId: 'activity-fixture-farm', userId: 'activity-fixture-user' }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => context.plan }));
vi.mock('./authClient', () => ({ getAuthToken: () => context.token,
  getStoredAuthUser: () => ({ id: context.userId, farmId: context.farmId }) }));

const input: ActivityRecordInput = {
  activityType: 'animal', recordDate: '2026-11-03', title: '様子を確認', note: '落ち着いている',
  animalKind: 'calf', animalId: '7', animalSyncId: 'calf:fixture-calf', animalIdentificationNumber: '0000000123',
  animalEarTag: '0123', animalName: '検証用子牛', animalBirthday: '2026-09-01',
};
const timestamp = '2026-11-01T00:00:00.000Z';
const unrelated = { id: 'unrelated', note: 'この記録は変更しない', createdAt: timestamp, updatedAt: timestamp };
const relatedStores = ['cattle', 'calves', 'schedules', 'treatments', 'expenses'] as const;
beforeEach(async () => {
  Object.assign(context, { plan: 'standard', token: 'activity-fixture-token', farmId: 'activity-fixture-farm', userId: 'activity-fixture-user' });
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, '', '/activity-records');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  await clearStore('activityRecords');
  for (const store of relatedStores) { await clearStore(store); await saveRecordPreservingTimestamps(store, unrelated); }
});
afterEach(async () => {
  context.farmId = 'activity-fixture-farm'; context.userId = 'activity-fixture-user';
  for (const store of relatedStores) expect(await getAllRecords(store)).toEqual([unrelated]);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

type CloudRow = Record<string, unknown> & { id: string; cloudUpdatedAt?: string; deletedAt?: string };
type Call = { method: string; id: string; headers: Headers; body?: CloudRow };
function cloud() {
  const rows = new Map<string, CloudRow>(); const calls: Call[] = [];
  const state = { offline: false };
  let counter = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const address = String(url); const path = '/api/activity-records/record-sync';
    if (address !== path && !address.startsWith(`${path}/`)) throw new Error(`Unexpected resource: ${address}`);
    const id = address === path ? '' : decodeURIComponent(address.slice(path.length + 1));
    const call: Call = { id, method: init?.method ?? 'GET', headers: new Headers(init?.headers),
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) };
    calls.push(call);
    if (state.offline) throw new TypeError('offline');
    const previous = rows.get(id);
    if (call.method === 'GET') return !id ? Response.json([...rows.values()]) : previous ? Response.json(previous) : new Response(null, { status: 404 });
    const match = previous ? call.headers.get('If-Match') === JSON.stringify(previous.cloudUpdatedAt) : call.headers.get('If-None-Match') === '*';
    if (!match) return Response.json({ message: '別の変更があります。' }, { status: 412 });
    const revision = new Date(Date.parse(timestamp) + ++counter).toISOString();
    const saved: CloudRow = call.method === 'DELETE'
      ? { ...previous, id, deletedAt: revision, cloudUpdatedAt: revision }
      : { ...previous, ...call.body!, cloudUpdatedAt: revision };
    if (call.method === 'PUT' && previous?.deletedAt) return Response.json({ message: '削除済みです。' }, { status: 409 });
    rows.set(id, saved);
    return Response.json(saved);
  }));
  return { rows, calls, state };
}
const read = (id: string) => getRecordById<ActivityRecord>('activityRecords', id);

describe('farm and individual activity persistence', () => {
  it('Free reads do not create records; explicit farm saves clear all animal fields and remain local', async () => {
    context.plan = 'free'; vi.stubGlobal('fetch', vi.fn());
    expect(await getActivityRecords()).toEqual([]);
    const saved = await createActivityRecord({ ...input, activityType: 'farm', title: ' 牛舎清掃 ' });
    expect(saved).toMatchObject({ activityType: 'farm', title: '牛舎清掃', animalKind: '', animalId: '', animalSyncId: '',
      animalIdentificationNumber: '', animalEarTag: '', animalName: '', animalBirthday: '', cloudSyncPending: false });
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await getActivityRecords()).map(record => record.id)).toEqual([saved.id]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves animal identity, leading zeros, notes and unknown existing fields during an explicit edit', async () => {
    context.plan = 'free'; vi.stubGlobal('fetch', vi.fn());
    const saved = await createActivityRecord(input);
    await saveRecordPreservingTimestamps('activityRecords', { ...saved, future: { precision: '001.20', value: null } });
    const edited = await updateActivityRecord(saved.id, { ...input, note: '再確認\n変わりなし' });
    expect(edited).toMatchObject({ id: saved.id, animalEarTag: '0123', animalIdentificationNumber: '0000000123',
      note: '再確認\n変わりなし', future: { precision: '001.20', value: null } });
    expect((await getActivityRecords())).toHaveLength(1);
    const backup = await createFarmProBackup('activity-test');
    expect(backup.stores.activityRecords).toEqual([edited]);
    await deleteActivityRecord(saved.id);
    expect(await getActivityRecords()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { recordDate: '2026-02-30' }, { title: '  ' }, { activityType: 'unknown' },
    { animalKind: '' }, { animalId: '', animalSyncId: '', animalIdentificationNumber: '', animalEarTag: '' },
  ])('rejects invalid formal input before creating any record: %j', async change => {
    context.plan = 'free'; vi.stubGlobal('fetch', vi.fn());
    await expect(createActivityRecord({ ...input, ...change } as ActivityRecordInput)).rejects.toThrow();
    expect(await getActivityRecords()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('paid saves use create-only and revision conditions; deletion leaves a cloud tombstone', async () => {
    const fixture = cloud();
    const saved = await createActivityRecord(input);
    expect(fixture.calls.find(call => call.method === 'PUT')?.headers.get('If-None-Match')).toBe('*');
    const edited = await updateActivityRecord(saved.id, { ...input, note: '確認済み' });
    const writes = fixture.calls.filter(call => call.method === 'PUT');
    expect(writes[1].headers.get('If-Match')).toBe(JSON.stringify(saved.cloudUpdatedAt));
    expect(writes[1].body?.animalEarTag).toBe('0123');
    expect(writes[1].body?.activityRecordSyncOrigin).toBeUndefined();
    await deleteActivityRecord(saved.id);
    expect(fixture.calls.find(call => call.method === 'DELETE')?.headers.get('If-Match')).toBe(JSON.stringify(edited.cloudUpdatedAt));
    expect(fixture.rows.get(saved.id)?.deletedAt).toBeTruthy();
    expect(await read(saved.id)).toBeUndefined();
    await expect(updateActivityRecord(saved.id, input)).rejects.toThrow('削除後の記録');
  });

  it('retains an offline formal save under its original ID and retries it once without creating a duplicate', async () => {
    const fixture = cloud(); fixture.state.offline = true;
    const failure = await createActivityRecord(input).catch(error => error) as ActivityRecordLocalSaveError;
    expect(failure).toBeInstanceOf(ActivityRecordLocalSaveError);
    const pending = await getActivityRecord(failure.record.id);
    expect(pending).toMatchObject({ title: input.title, cloudSyncPending: true, animalEarTag: '0123' });
    fixture.state.offline = false;
    expect(await retryPendingActivityRecordSync()).toBe(1);
    expect(await retryPendingActivityRecordSync()).toBe(0);
    expect(fixture.rows.size).toBe(1);
    expect((await read(pending.id))?.cloudSyncPending).toBe(false);
  });

  it('does not upload old or restored rows during a list read or retry', async () => {
    const fixture = cloud();
    await saveRecordPreservingTimestamps('activityRecords', { ...input, id: 'old-activity', cloudSyncPending: true,
      createdAt: timestamp, updatedAt: timestamp });
    expect(await getActivityRecords()).toHaveLength(1);
    expect(await retryPendingActivityRecordSync()).toBe(0);
    expect(fixture.calls.every(call => call.method === 'GET')).toBe(true);
    expect(fixture.rows.size).toBe(0);
  });

  it('keeps the local edit when another device has changed the cloud record', async () => {
    const fixture = cloud(); const saved = await createActivityRecord(input);
    fixture.rows.set(saved.id, { ...fixture.rows.get(saved.id)!, note: '別端末の記録', cloudUpdatedAt: '2026-11-04T00:00:00.000Z' });
    await expect(updateActivityRecord(saved.id, { ...input, note: 'この端末の入力' })).rejects.toThrow('変更があります');
    expect(await read(saved.id)).toMatchObject({ note: 'この端末の入力', cloudSyncPending: true, activityRecordSyncBlocked: true });
    expect(fixture.rows.get(saved.id)?.note).toBe('別端末の記録');
    expect(await retryPendingActivityRecordSync()).toBe(0);
  });

  it('holds a Free edit of a previously synced record when the plan becomes paid again', async () => {
    const fixture = cloud(); const saved = await createActivityRecord(input);
    context.plan = 'free';
    await updateActivityRecord(saved.id, { ...input, note: 'Freeで確認して保存' });
    context.plan = 'standard';
    fixture.rows.set(saved.id, { ...fixture.rows.get(saved.id)!, note: '別端末が変更', cloudUpdatedAt: '2026-11-04T00:00:00.000Z' });
    expect((await getActivityRecords())[0].note).toBe('Freeで確認して保存');
    expect(await retryPendingActivityRecordSync()).toBe(0);
    expect(fixture.rows.get(saved.id)?.note).toBe('別端末が変更');
  });

  it('does not import a response into another farm if the account changes during the request', async () => {
    context.farmId = 'activity-other-farm'; await clearStore('activityRecords'); context.farmId = 'activity-fixture-farm';
    let resolve!: (response: Response) => void;
    let started!: () => void;
    const requested = new Promise<void>(done => { started = done; });
    vi.stubGlobal('fetch', vi.fn(() => { started(); return new Promise<Response>(done => { resolve = done; }); }));
    const loading = getActivityRecords().catch(error => error);
    await requested;
    context.farmId = 'activity-other-farm';
    resolve(Response.json([{ ...toCloudFeedingFattening('activityRecords', { ...input, id: 'old-farm-record' }),
      createdAt: timestamp, updatedAt: timestamp, cloudUpdatedAt: '2026-11-03T00:00:00.000Z' }]));
    expect(await loading).toBeInstanceOf(Error);
    expect(await getAllRecords('activityRecords')).toEqual([]);
    context.farmId = 'activity-fixture-farm';
    expect(await getAllRecords('activityRecords')).toEqual([]);
  });
});
