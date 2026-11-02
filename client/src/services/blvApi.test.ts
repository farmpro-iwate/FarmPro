import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, deleteRecord, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import type { BlvTest, BlvTestInput } from '../types/blv';
import {
  BlvLocalSaveError, BlvSyncConflictError, BLV_SYNC_STATUS_EVENT, createBlvTest, deleteBlvTest,
  getBlvTest, getBlvTestList, getBlvSyncStatus, retryPendingBlvSync, updateBlvTest,
} from './blvApi';
import { toCloudBlv, type CloudBlvRecord } from './blvSyncProtocol';

const context = vi.hoisted(() => ({ plan: 'standard', token: 'blv-client-token', farmId: 'blv-client-farm', userId: 'blv-client-user' }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => context.plan }));
vi.mock('./authClient', () => ({
  getAuthToken: () => context.token,
  getStoredAuthUser: () => ({ id: context.userId, farmId: context.farmId }),
}));

type Row = BlvTest & StoredRecord;
type RequestLog = { id: string; method: string; path: string; headers: Headers; body?: CloudBlvRecord; signal?: AbortSignal | null };
type Fixture = {
  records: Map<string, CloudBlvRecord>; calls: RequestLog[];
  failGet: boolean; failPut: boolean; losePutAck: boolean; loseDeleteAck: boolean;
  intercept?: (request: RequestLog) => Promise<Response | undefined>;
  afterWrite?: (record: CloudBlvRecord, request: RequestLog) => Promise<Response | undefined>;
};
const input: BlvTestInput = { cowEarTag: 'BLV-001', cowName: '検証牛', testDate: '2026-11-02', result: '陰性',
  nextTestDate: '2027-05-02', isolationMemo: '', note: '正式保存' };
const firstTime = '2026-11-01T00:00:00.000Z';
const ownerKey = 'farmpro.blvSyncOwner.blv-client-farm';
const related = { id: 777, note: 'BLV同期から変更しない', createdAt: firstTime, updatedAt: firstTime };
const read = (id: number) => getRecordById<Row>('blvTests', id);
const writes = (fixture: Fixture) => fixture.calls.filter(call => call.method !== 'GET');
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function serve(): Fixture {
  const fixture: Fixture = { records: new Map(), calls: [], failGet: false, failPut: false, losePutAck: false, loseDeleteAck: false };
  let generation = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    if (!path.startsWith('/api/blv-tests/record-sync')) throw new Error(`Unexpected BLV side effect: ${path}`);
    const id = path === '/api/blv-tests/record-sync' ? '' : decodeURIComponent(path.slice('/api/blv-tests/record-sync/'.length));
    const request: RequestLog = { id, path, method: init?.method ?? 'GET', headers: new Headers(init?.headers), signal: init?.signal,
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) };
    fixture.calls.push(request);
    const intercepted = await fixture.intercept?.(request);
    if (intercepted) return intercepted;
    if (request.method === 'GET') {
      if (fixture.failGet) throw new TypeError('offline');
      if (!id) return Response.json([...fixture.records.values()]);
      const record = fixture.records.get(id);
      return record ? Response.json(record) : new Response(null, { status: 404 });
    }
    const current = fixture.records.get(id);
    if (!request.headers.has('If-Match') && !request.headers.has('If-None-Match')) return Response.json({ message: '条件が必要です。' }, { status: 428 });
    if (request.method === 'DELETE' && current?.deletedAt && request.headers.has('If-Match')) return Response.json(current);
    const matches = current ? request.headers.get('If-Match') === JSON.stringify(current.cloudUpdatedAt)
      : request.headers.get('If-None-Match') === '*';
    if (!matches) return Response.json({ message: '別端末の更新と競合しています。' }, { status: 412 });
    const revision = new Date(Date.UTC(2026, 10, 2) + ++generation).toISOString();
    let saved: CloudBlvRecord;
    if (request.method === 'PUT') {
      if (current?.deletedAt) return Response.json({ message: 'クラウドで削除済みです。' }, { status: 409 });
      if (fixture.failPut) return Response.json({ message: '一時的に送信できません。' }, { status: 503 });
      saved = { ...current, ...request.body!, id, cloudUpdatedAt: revision };
      fixture.records.set(id, saved);
      if (fixture.losePutAck) { fixture.losePutAck = false; throw new TypeError('PUT ACK lost'); }
    } else if (request.method === 'DELETE') {
      saved = { ...current, id, deletedAt: revision, cloudUpdatedAt: revision };
      fixture.records.set(id, saved);
      if (fixture.loseDeleteAck) { fixture.loseDeleteAck = false; throw new TypeError('DELETE ACK lost'); }
    } else throw new Error(`Unexpected BLV method: ${request.method}`);
    return await fixture.afterWrite?.(saved, request) ?? Response.json(saved);
  }));
  return fixture;
}

async function pendingCreation(fixture: Fixture, note = '通信できない状態で正式保存'): Promise<Row> {
  fixture.failGet = true;
  const failed = await createBlvTest({ ...input, note }).catch(error => error);
  expect(failed).toBeInstanceOf(BlvLocalSaveError);
  fixture.failGet = false;
  fixture.calls = [];
  return (await read((failed as BlvLocalSaveError).record.id))!;
}

beforeEach(async () => {
  Object.assign(context, { plan: 'standard', token: 'blv-client-token', farmId: 'blv-client-farm', userId: 'blv-client-user' });
  window.history.replaceState(null, '', '/blv');
  localStorage.clear(); sessionStorage.clear();
  for (const store of ['blvTests', 'expenses', 'schedules', 'cattle', 'metadata'] as const) await clearStore(store);
  for (const store of ['expenses', 'schedules', 'cattle'] as const) await saveRecordPreservingTimestamps(store, related);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(async () => {
  context.farmId = 'blv-client-farm'; context.userId = 'blv-client-user';
  for (const store of ['expenses', 'schedules', 'cattle'] as const) expect(await getAllRecords(store)).toEqual([related]);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('BLV formal synchronization', () => {
  it('keeps Free CRUD local, allocates unique numeric IDs under a frozen clock and never overwrites an existing row', async () => {
    const fixture = serve(); context.plan = 'free';
    await saveRecordPreservingTimestamps('blvTests', { ...input, id: 6000 });
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const [first, second] = await Promise.all([createBlvTest(input), createBlvTest({ ...input, testDate: '2026-10-31' })]);
    expect([first.id, second.id]).toEqual([6001, 6002]);
    expect(first.syncRecordId).toMatch(/^blv:[0-9a-f-]{36}$/);
    expect(second.syncRecordId).not.toBe(first.syncRecordId);
    await updateBlvTest(first.id, { ...input, result: '陽性' });
    expect(await getBlvTest(first.id)).toMatchObject({ result: '陽性', cloudSyncPending: false });
    await deleteBlvTest(first.id);
    expect((await getBlvTestList()).map(row => row.id)).toEqual([6000, 6002]);
    expect(await retryPendingBlvSync()).toBe(0);
    expect(getBlvSyncStatus(second)).toEqual({ pending: false });
    expect(fixture.calls).toEqual([]);
  });

  it.each(['standard', 'pro'])('conditionally creates, updates and deletes on %s while preserving unknown business', async plan => {
    context.plan = plan;
    const fixture = serve();
    const custom = { ...input, customAssay: { precision: '10.00', note: null }, futureAmount: '1,200' };
    const created = await createBlvTest(custom);
    const initialRevision = created.cloudUpdatedAt;
    expect(writes(fixture)[0].headers.get('If-None-Match')).toBe('*');
    expect(writes(fixture)[0].body).toMatchObject({ id: created.syncRecordId, customAssay: custom.customAssay });
    expect(Object.keys(writes(fixture)[0].body!).some(key => key.startsWith('blvSync') || key.startsWith('cloudSync'))).toBe(false);
    fixture.calls = [];
    expect(await getBlvTest(created.id)).toMatchObject({ id: created.id, cloudSyncPending: false });
    expect(fixture.calls).toEqual([]);

    const updated = await updateBlvTest(created.id, { ...input, result: '陽性' });

    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(initialRevision));
    expect(updated).toMatchObject({ id: created.id, result: '陽性', customAssay: custom.customAssay, futureAmount: '1,200', createdAt: created.createdAt });
    await deleteBlvTest(created.id);
    expect(writes(fixture)[1].headers.get('If-Match')).toBe(JSON.stringify(updated.cloudUpdatedAt));
    expect(await read(created.id)).toBeUndefined();
    expect(fixture.records.get(created.syncRecordId!)?.deletedAt).toBeDefined();
  });

  it('leaves a legacy local-only row untouched on list reads and uploads it only on formal edit with its numeric fallback identity', async () => {
    const fixture = serve();
    const original = await saveRecordPreservingTimestamps('blvTests', { ...input, id: 17, customAssay: { dilution: '1:10' } });
    expect(await getBlvTestList()).toEqual([original]);
    expect(writes(fixture)).toHaveLength(0);
    const saved = await updateBlvTest(17, { ...input, note: '旧記録を正式保存' });
    expect(saved).toMatchObject({ id: 17, syncRecordId: 'blv:17', cloudSyncPending: false, customAssay: original.customAssay });
    expect(writes(fixture)[0].headers.get('If-None-Match')).toBe('*');
  });

  it('does not recreate a previously confirmed record when its cloud generation disappears', async () => {
    const fixture = serve(); const saved = await createBlvTest(input);
    fixture.records.clear(); fixture.calls = [];
    await expect(updateBlvTest(saved.id, { ...input, note: '元記録不明の編集' })).rejects.toBeInstanceOf(BlvSyncConflictError);
    expect(writes(fixture)).toHaveLength(0);
    expect(await read(saved.id)).toMatchObject({ note: '元記録不明の編集', cloudSyncPending: true, blvSyncBlocked: true });
  });

  it('returns the committed ID on lost create ACK and permits a same-ID formal retry', async () => {
    const fixture = serve(); fixture.losePutAck = true;
    const error = await createBlvTest(input).catch(value => value) as BlvLocalSaveError;
    expect(error).toBeInstanceOf(BlvLocalSaveError);
    expect(error.cause).toBeInstanceOf(TypeError);
    expect(await read(error.record.id)).toMatchObject({ syncRecordId: error.record.syncRecordId, cloudSyncPending: true });
    const saved = await updateBlvTest(error.record.id, { ...input, note: '同じ記録で再保存' });
    expect(saved.id).toBe(error.record.id);
    expect(await getAllRecords('blvTests')).toHaveLength(1);
    expect(fixture.records.size).toBe(1);
  });

  it('keeps the exact unknown business original pending when a successful PUT reply changes an unknown value', async () => {
    const fixture = serve();
    fixture.afterWrite = async record => Response.json({ ...record, customAssay: { precision: '10' } });
    const error = await createBlvTest({ ...input, customAssay: { precision: '10.00' } } as BlvTestInput)
      .catch(value => value) as BlvLocalSaveError;
    expect(error).toBeInstanceOf(BlvLocalSaveError);
    expect(error.cause).toBeInstanceOf(BlvSyncConflictError);
    expect(await read(error.record.id)).toMatchObject({ customAssay: { precision: '10.00' }, cloudSyncPending: true, blvSyncBlocked: true });
  });

  it('returns the committed ID even when the context changes at the local transaction completion', async () => {
    const fixture = serve();
    const originalTransaction = IDBDatabase.prototype.transaction;
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, stores, mode, options) {
      const tx = originalTransaction.call(this, stores, mode, options);
      if (stores === 'blvTests' && mode === 'readwrite') tx.addEventListener('complete', () => { context.token = 'after-commit'; }, { once: true });
      return tx;
    });
    const error = await createBlvTest(input).catch(value => value) as BlvLocalSaveError;
    transaction.mockRestore();
    expect(error).toBeInstanceOf(BlvLocalSaveError);
    expect(error.message).toContain('ログインまたは農場');
    expect(await read(error.record.id)).toMatchObject({ id: error.record.id, cloudSyncPending: true });
    expect(fixture.calls).toEqual([]);
    context.token = 'blv-client-token';
    await updateBlvTest(error.record.id, input);
    expect(await getAllRecords('blvTests')).toHaveLength(1);
  });

  it.each(['before GET', 'before PUT'])('keeps an edit pending when a peer wins %s', async phase => {
    const fixture = serve(); const saved = await createBlvTest(input);
    const peer = { ...fixture.records.get(saved.syncRecordId!)!, result: '陽性', note: '別端末確定', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' };
    fixture.calls = [];
    if (phase === 'before GET') fixture.records.set(saved.syncRecordId!, peer);
    else fixture.intercept = async request => { if (request.method === 'PUT') fixture.records.set(request.id, peer); return undefined; };
    await expect(updateBlvTest(saved.id, { ...input, note: 'この端末の入力' })).rejects.toBeInstanceOf(BlvSyncConflictError);
    expect(fixture.records.get(saved.syncRecordId!)).toEqual(peer);
    expect(await read(saved.id)).toMatchObject({ note: 'この端末の入力', cloudSyncPending: true, blvSyncBlocked: true });
    expect(writes(fixture)).toHaveLength(phase === 'before GET' ? 0 : 1);
    if (phase === 'before PUT') expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(saved.cloudUpdatedAt));
  });

  it('retains confirmed B after a lost ACK and failed C, then retries C against the confirmed B revision', async () => {
    const fixture = serve(); const saved = await createBlvTest(input);
    fixture.losePutAck = true;
    await expect(updateBlvTest(saved.id, { ...input, note: 'B' })).rejects.toThrow('PUT ACK lost');
    const confirmedB = structuredClone(fixture.records.get(saved.syncRecordId!)!);
    fixture.failPut = true;
    await expect(updateBlvTest(saved.id, { ...input, note: 'C' })).rejects.toThrow('一時的');
    expect(await read(saved.id)).toMatchObject({ note: 'C', blvSyncBase: { record: confirmedB, cloudUpdatedAt: confirmedB.cloudUpdatedAt } });
    fixture.failPut = false; fixture.calls = [];
    expect(await retryPendingBlvSync()).toBe(1);
    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(confirmedB.cloudUpdatedAt));
    expect(await read(saved.id)).toMatchObject({ note: 'C', cloudSyncPending: false });
  });

  it('carries unknown business from the confirmed base when an older local writer omitted it', async () => {
    const fixture = serve();
    const saved = await createBlvTest({ ...input, customAssay: { dilution: '1:100', value: '10.00' } } as BlvTestInput);
    fixture.failGet = true;
    await expect(updateBlvTest(saved.id, { ...input, note: '旧readerからの正式編集' })).rejects.toThrow('offline');
    const { customAssay, ...olderReader } = (await read(saved.id))!;
    await saveRecordPreservingTimestamps('blvTests', olderReader);
    fixture.failGet = false; fixture.calls = [];

    expect(await retryPendingBlvSync()).toBe(1);

    expect(writes(fixture)[0].body).toMatchObject({ customAssay, note: '旧readerからの正式編集' });
    expect(await read(saved.id)).toMatchObject({ customAssay, note: '旧readerからの正式編集', cloudSyncPending: false });
    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(saved.cloudUpdatedAt));
  });

  it('holds a peer-conflicting delete and refuses saves or background retries while deletion is pending', async () => {
    const fixture = serve(); const saved = await createBlvTest(input);
    const peer = { ...fixture.records.get(saved.syncRecordId!)!, note: '別端末の変更', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' };
    fixture.records.set(saved.syncRecordId!, peer); fixture.calls = [];
    await expect(deleteBlvTest(saved.id)).rejects.toBeInstanceOf(BlvSyncConflictError);
    await expect(updateBlvTest(saved.id, input)).rejects.toThrow('削除の確認待ち');
    expect(await retryPendingBlvSync()).toBe(0);
    expect(await read(saved.id)).toMatchObject({ ...saved, cloudSyncPending: true, blvSyncDeletePending: true });
    expect(fixture.records.get(saved.syncRecordId!)).toEqual(peer);
    expect(writes(fixture)).toHaveLength(0);
  });

  it('holds a lost DELETE ACK through list reload and completes only an explicit delete retry', async () => {
    const fixture = serve(); const saved = await createBlvTest(input);
    fixture.loseDeleteAck = true;
    await expect(deleteBlvTest(saved.id)).rejects.toThrow('DELETE ACK lost');
    const tombstone = structuredClone(fixture.records.get(saved.syncRecordId!)!);
    expect(await getBlvTestList()).toEqual([expect.objectContaining({ id: saved.id, blvSyncDeletePending: true })]);
    expect(getBlvSyncStatus((await read(saved.id))!)).toMatchObject({ pending: false, warning: expect.stringContaining('削除') });
    expect(await retryPendingBlvSync()).toBe(0);
    await deleteBlvTest(saved.id);
    expect(await read(saved.id)).toBeUndefined();
    expect(fixture.records.get(saved.syncRecordId!)).toEqual(tombstone);
  });

  it('uses the GET revision when a peer changes the record immediately before DELETE', async () => {
    const fixture = serve(); const saved = await createBlvTest(input);
    const peer = { ...fixture.records.get(saved.syncRecordId!)!, note: '削除直前の別端末変更', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' };
    fixture.calls = [];
    fixture.intercept = async request => { if (request.method === 'DELETE') fixture.records.set(request.id, peer); return undefined; };
    await expect(deleteBlvTest(saved.id)).rejects.toBeInstanceOf(BlvSyncConflictError);
    expect(writes(fixture)).toHaveLength(1);
    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(saved.cloudUpdatedAt));
    expect(fixture.records.get(saved.syncRecordId!)).toEqual(peer);
    expect(await read(saved.id)).toMatchObject({ ...saved, cloudSyncPending: true, blvSyncDeletePending: true });
  });

  it('requires a confirmed DELETE tombstone even for a legacy record missing remotely', async () => {
    const fixture = serve();
    await saveRecordPreservingTimestamps('blvTests', { ...input, id: 17 });
    fixture.intercept = async request => request.method === 'DELETE' ? new Response(null, { status: 404 }) : undefined;
    await expect(deleteBlvTest(17)).rejects.toThrow('404');
    expect(await read(17)).toMatchObject({ id: 17, cloudSyncPending: true, blvSyncDeletePending: true });
    expect(writes(fixture)[0].headers.get('If-None-Match')).toBe('*');
    fixture.intercept = undefined;
    await deleteBlvTest(17);
    expect(await read(17)).toBeUndefined();
    expect(fixture.records.get('blv:17')?.deletedAt).toBeDefined();
  });
});

describe('BLV cloud pull and delayed replies', () => {
  it.each(['different live content', 'tombstone'])('preserves an unconfirmed legacy original when its numeric cloud ID collides with %s', async kind => {
    const fixture = serve();
    const original = await saveRecordPreservingTimestamps('blvTests', { ...input, id: 17,
      customAssay: { precision: '10.00' }, createdAt: firstTime, updatedAt: firstTime });
    fixture.records.set('blv:17', kind === 'tombstone'
      ? { id: 'blv:17', deletedAt: '2026-11-02T01:00:00.000Z', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' }
      : { ...toCloudBlv(original), result: '陽性', note: '別端末の同番号', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' });

    const listed = await getBlvTestList();

    expect(listed).toEqual([{ ...original, cloudSyncPending: true, blvSyncBlocked: true, blvSyncWarning: expect.stringContaining('同じ番号') }]);
    expect(toCloudBlv(listed[0])).toEqual(toCloudBlv(original));
    expect(await read(17)).not.toHaveProperty('blvSyncOrigin');
    expect(getBlvSyncStatus(listed[0])).toMatchObject({ pending: true, warning: expect.stringContaining('同じ番号') });
    expect(await retryPendingBlvSync()).toBe(0);
    expect(writes(fixture)).toHaveLength(0);
    expect(localStorage.getItem(ownerKey)).toBeNull();
  });

  it('adopts only metadata for an identical legacy original and allows normal cloud updates after that confirmation', async () => {
    const fixture = serve();
    const original = await saveRecordPreservingTimestamps('blvTests', { ...input, id: 17,
      customAssay: { precision: '10.00' }, createdAt: firstTime, updatedAt: firstTime });
    const matching = { ...toCloudBlv(original), cloudUpdatedAt: '2026-11-02T01:00:00.000Z' };
    fixture.records.set('blv:17', matching);

    expect(await getBlvTestList()).toEqual([{ ...original, syncRecordId: 'blv:17', cloudUpdatedAt: matching.cloudUpdatedAt, cloudSyncPending: false }]);

    fixture.records.set('blv:17', { ...matching, result: '陽性', cloudUpdatedAt: '2026-11-02T02:00:00.000Z' });
    expect(await getBlvTestList()).toEqual([expect.objectContaining({ id: 17, result: '陽性', customAssay: original.customAssay, cloudSyncPending: false })]);
    expect(writes(fixture)).toHaveLength(0);
    expect(localStorage.getItem(ownerKey)).toBeNull();
  });

  it('pulls new and newer records plus tombstones, preserves pending originals and never sends or emits a status loop', async () => {
    const fixture = serve(); const original = await createBlvTest(input);
    const pending = await pendingCreation(fixture);
    fixture.records.set(original.syncRecordId!, { ...toCloudBlv(original), result: '陽性', customAssay: '2.00', cloudUpdatedAt: '2026-11-02T02:00:00.000Z' });
    fixture.records.set(pending.syncRecordId!, { ...toCloudBlv(pending), note: '別端末', cloudUpdatedAt: '2026-11-02T03:00:00.000Z' });
    fixture.records.set('blv:other-device', { ...input, id: 'blv:other-device', customAssay: { result: null }, cloudUpdatedAt: firstTime });
    fixture.calls = [];
    const event = vi.fn(); window.addEventListener(BLV_SYNC_STATUS_EVENT, event);
    const rows = await getBlvTestList();
    expect(rows).toHaveLength(3);
    expect(await read(original.id)).toMatchObject({ result: '陽性', customAssay: '2.00' });
    expect(await read(pending.id)).toEqual(pending);
    expect(rows.find(row => row.syncRecordId === 'blv:other-device')).toMatchObject({ customAssay: { result: null }, cloudSyncPending: false });
    fixture.records.set(original.syncRecordId!, { id: original.syncRecordId!, deletedAt: '2026-11-02T04:00:00.000Z', cloudUpdatedAt: '2026-11-02T04:00:00.000Z' });
    await getBlvTestList();
    expect(await read(original.id)).toBeUndefined();
    expect(writes(fixture)).toHaveLength(0);
    expect(event).not.toHaveBeenCalled();
    window.removeEventListener(BLV_SYNC_STATUS_EVENT, event);
  });

  it.each(['edit', 'delete'])('does not overwrite or resurrect an original after a delayed list GET and direct %s', async change => {
    const fixture = serve(); const saved = await createBlvTest(input);
    const started = deferred<void>(); const response = deferred<Response>();
    fixture.intercept = async request => { if (request.id) return undefined; started.resolve(); return response.promise; };
    const listing = getBlvTestList(); await started.promise;
    if (change === 'edit') await saveRecordPreservingTimestamps('blvTests', { ...saved, note: '一覧応答待ち中の直接編集', customAssay: 'keep' });
    else await deleteRecord('blvTests', saved.id);
    const current = await read(saved.id);
    response.resolve(Response.json([{ ...toCloudBlv(saved), note: '遅れたクラウド', cloudUpdatedAt: '2026-11-02T05:00:00.000Z' }]));
    await listing;
    expect(await read(saved.id)).toEqual(current);
  });

  it('does not duplicate an identity or overwrite an occupied local numeric ID when importing a delayed new row', async () => {
    const fixture = serve();
    const started = deferred<void>(); const response = deferred<Response>();
    fixture.intercept = async () => { started.resolve(); return response.promise; };
    const listing = getBlvTestList(); await started.promise;
    const direct = await saveRecordPreservingTimestamps('blvTests', { ...input, id: 1, syncRecordId: 'blv:direct-created', note: '直接作成した原本' });
    response.resolve(Response.json([{ ...input, id: 'blv:remote-new', cloudUpdatedAt: firstTime }]));
    expect(await listing).toEqual([direct]);
    expect(await read(1)).toEqual(direct);
  });

  it('does not clear or change a newer direct edit when an old PUT reply arrives', async () => {
    const fixture = serve(); const saved = await createBlvTest(input);
    const started = deferred<void>(); const released = deferred<void>();
    fixture.afterWrite = async (_record, request) => { if (request.method === 'PUT') { started.resolve(); await released.promise; } return undefined; };
    const updating = updateBlvTest(saved.id, { ...input, note: '送信中の入力' }).catch(error => error);
    await started.promise;
    const newer = await saveRecordPreservingTimestamps('blvTests', { ...await read(saved.id), id: saved.id, note: '新しい直接編集', cloudSyncPending: false });
    released.resolve();
    expect(await updating).toBeInstanceOf(BlvSyncConflictError);
    expect(await read(saved.id)).toEqual(newer);
  });

  it('protects a newer direct edit with deletion-pending metadata after the old DELETE already committed remotely', async () => {
    const fixture = serve(); const saved = await createBlvTest(input);
    const started = deferred<void>(); const released = deferred<void>();
    fixture.afterWrite = async (_record, request) => { if (request.method === 'DELETE') { started.resolve(); await released.promise; } return undefined; };
    const deleting = deleteBlvTest(saved.id).catch(error => error); await started.promise;
    const newer = await saveRecordPreservingTimestamps('blvTests', { ...saved, note: '削除応答中の直接編集', customAssay: 'future' });
    released.resolve();
    expect(await deleting).toBeInstanceOf(BlvSyncConflictError);
    expect(await read(saved.id)).toEqual({ ...newer, cloudSyncPending: true, blvSyncDeletePending: true });
    expect(await getBlvTestList()).toEqual([expect.objectContaining({ note: newer.note, blvSyncDeletePending: true })]);
    await expect(updateBlvTest(saved.id, input)).rejects.toThrow('削除の確認待ち');
  });

  it.each(['GET', 'PUT', 'DELETE'])('times out an unresolved %s JSON body, releases its lock and ignores a late response', async method => {
    const fixture = serve(); const saved = await createBlvTest(input);
    const started = deferred<void>(); const body = deferred<unknown>();
    const hangingResponse = () => {
      const response = Response.json({});
      vi.spyOn(response, 'json').mockImplementation(() => { started.resolve(); return body.promise; });
      return response;
    };
    if (method === 'GET') fixture.intercept = async request => !request.id ? hangingResponse() : undefined;
    else fixture.afterWrite = async (_record, request) => request.method === method ? hangingResponse() : undefined;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const work = (method === 'GET' ? getBlvTestList() : method === 'PUT'
      ? updateBlvTest(saved.id, { ...input, note: '応答待ち' }) : deleteBlvTest(saved.id)).catch(error => error);
    await started.promise;
    await vi.advanceTimersByTimeAsync(12000);
    const result = await work;
    if (method !== 'GET') expect(result).toMatchObject({ message: expect.stringContaining('時間切れ') });
    expect([...fixture.calls].reverse().find(call => call.method === method)?.signal?.aborted).toBe(true);
    expect(await read(saved.id)).toBeDefined();
    fixture.intercept = undefined; fixture.afterWrite = undefined;
    if (method === 'DELETE') await deleteBlvTest(saved.id);
    else if (method === 'PUT') await updateBlvTest(saved.id, { ...input, note: '復帰して正式保存' });
    else await getBlvTestList();
    const current = await read(saved.id);
    body.resolve(method === 'GET' ? [] : fixture.records.get(saved.syncRecordId!));
    await vi.advanceTimersByTimeAsync(0);
    expect(await read(saved.id)).toEqual(current);
  });
});

describe('BLV owned automatic retry', () => {
  it('retries only the source once under concurrent starts, acknowledges lost ACK by GET and emits one status change', async () => {
    const fixture = serve(); const pending = await pendingCreation(fixture);
    const event = vi.fn(); window.addEventListener(BLV_SYNC_STATUS_EVENT, event);
    expect(pending.blvSyncOrigin).toMatchObject({ version: 1, farmId: context.farmId, userId: context.userId });
    expect((await Promise.all([retryPendingBlvSync(), retryPendingBlvSync()])).reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(writes(fixture)).toHaveLength(1);
    const saved = (await read(pending.id))!;
    expect(saved).toMatchObject({ updatedAt: pending.updatedAt, cloudSyncPending: false });
    for (const key of ['blvSyncOrigin', 'blvSyncBase', 'blvSyncAttempt', 'blvSyncWarning', 'blvSyncBlocked']) expect(saved).not.toHaveProperty(key);
    expect(event).toHaveBeenCalledTimes(1);
    window.removeEventListener(BLV_SYNC_STATUS_EVENT, event);

    fixture.losePutAck = true;
    await expect(updateBlvTest(saved.id, { ...input, note: 'ACKだけ失われた編集' })).rejects.toThrow('PUT ACK lost');
    fixture.calls = [];
    expect(await retryPendingBlvSync()).toBe(1);
    expect(fixture.calls.map(call => call.method)).toEqual(['GET']);
  });

  it('blocks a peer tombstone without recreating it and never repeats an automatic conflict', async () => {
    const fixture = serve(); const pending = await pendingCreation(fixture);
    fixture.records.set(pending.syncRecordId!, { id: pending.syncRecordId!, deletedAt: firstTime, cloudUpdatedAt: firstTime });
    expect(await retryPendingBlvSync()).toBe(0);
    const blocked = (await read(pending.id))!;
    expect(blocked).toMatchObject({ note: pending.note, cloudSyncPending: true, blvSyncBlocked: true });
    expect(getBlvSyncStatus(blocked)).toMatchObject({ pending: true, warning: expect.stringContaining('削除済み') });
    const count = fixture.calls.length;
    expect(await retryPendingBlvSync()).toBe(0);
    expect(fixture.calls).toHaveLength(count);
    expect(writes(fixture)).toHaveLength(0);
  });

  it('excludes legacy, restored, foreign-browser/farm/user and deletion-pending rows without minting ownership', async () => {
    const fixture = serve(); const pending = await pendingCreation(fixture);
    const origin = pending.blvSyncOrigin as Record<string, unknown>;
    await deleteRecord('blvTests', pending.id);
    const changes = [
      { blvSyncOrigin: undefined }, { blvSyncOrigin: { ...origin, ownerId: 'other-browser' } },
      { blvSyncOrigin: { ...origin, farmId: 'other-farm' } }, { blvSyncOrigin: { ...origin, userId: 'other-user' } },
      { blvSyncDeletePending: true }, { deletedAt: firstTime },
    ];
    for (const [index, extra] of changes.entries()) await saveRecordPreservingTimestamps('blvTests', {
      ...pending, ...extra, id: pending.id + index, syncRecordId: `blv:excluded-${index}`,
    });
    const rows = await getAllRecords<Row>('blvTests');
    expect(await retryPendingBlvSync()).toBe(0);
    expect(fixture.calls).toEqual([]);
    expect(await getAllRecords('blvTests')).toEqual(rows);
    expect(getBlvSyncStatus(rows[0]).warning).toContain('送信元');
    localStorage.removeItem(ownerKey);
    expect(await retryPendingBlvSync()).toBe(0);
    expect(localStorage.getItem(ownerKey)).toBeNull();
  });

  it.each(['Free', 'offline', 'hidden', '/blv/new', '/blv/1/edit', '/device-sync', '/backup'])('does not retry from %s', async reason => {
    const fixture = serve(); const pending = await pendingCreation(fixture);
    if (reason === 'Free') context.plan = 'free';
    else if (reason === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    else if (reason === 'hidden') vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    else window.history.replaceState(null, '', reason);
    expect(await retryPendingBlvSync()).toBe(0);
    expect(fixture.calls).toEqual([]);
    expect(await read(pending.id)).toEqual(pending);
  });

  it.each(['owner', 'page', 'token', 'user', 'farm'])('stops PUT, status changes and the next row when %s changes during retry GET', async change => {
    const fixture = serve(); await pendingCreation(fixture, '先の記録'); await pendingCreation(fixture, '次の記録');
    const originals = await getAllRecords('blvTests');
    const started = deferred<void>(); const released = deferred<void>();
    fixture.intercept = async request => { if (request.method === 'GET') { started.resolve(); await released.promise; } return undefined; };
    const retry = retryPendingBlvSync(); await started.promise;
    if (change === 'owner') localStorage.setItem(ownerKey, 'changed-owner');
    if (change === 'page') window.history.replaceState(null, '', '/');
    if (change === 'token') context.token = 'changed-token';
    if (change === 'user') context.userId = 'changed-user';
    if (change === 'farm') context.farmId = 'changed-farm';
    released.resolve();
    expect(await retry).toBe(0);
    context.farmId = 'blv-client-farm'; context.userId = 'blv-client-user';
    expect(fixture.calls.map(call => call.method)).toEqual(['GET']);
    expect(await getAllRecords('blvTests')).toEqual(originals);
  });

  it('binds the owner before the initial database snapshot and never adopts a changed owner from the read', async () => {
    const fixture = serve(); const pending = await pendingCreation(fixture);
    const other = { ...pending, blvSyncOrigin: { ...(pending.blvSyncOrigin as object), ownerId: 'owner-after-read' } };
    await saveRecordPreservingTimestamps('blvTests', other);
    const originalGetAll = IDBObjectStore.prototype.getAll;
    const getAll = vi.spyOn(IDBObjectStore.prototype, 'getAll').mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = originalGetAll.apply(this, args);
      if (this.name === 'blvTests') request.addEventListener('success', () => localStorage.setItem(ownerKey, 'owner-after-read'), { once: true });
      return request;
    });
    expect(await retryPendingBlvSync()).toBe(0);
    getAll.mockRestore();
    expect(fixture.calls).toEqual([]);
    expect(await read(pending.id)).toEqual(other);
  });

  it.each(['owner', 'page', 'edit'])('does not acknowledge an old automatic PUT after %s changes', async change => {
    const fixture = serve(); const pending = await pendingCreation(fixture);
    const started = deferred<void>(); const released = deferred<void>();
    fixture.afterWrite = async () => { started.resolve(); await released.promise; return undefined; };
    const retry = retryPendingBlvSync(); await started.promise;
    if (change === 'owner') localStorage.setItem(ownerKey, 'changed-owner');
    if (change === 'page') window.history.replaceState(null, '', '/blv/new');
    if (change === 'edit') await saveRecordPreservingTimestamps('blvTests', { ...await read(pending.id), id: pending.id, note: '通信中の新編集' });
    const current = await read(pending.id);
    released.resolve();
    expect(await retry).toBe(0);
    expect(await read(pending.id)).toEqual(current);
    expect(current?.cloudSyncPending).toBe(true);
  });
});
