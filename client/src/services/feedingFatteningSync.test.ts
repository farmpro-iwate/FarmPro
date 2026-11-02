import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, deleteRecord, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { StoredRecord } from '../storage/types';
import * as feeding from './feedingAlertActionsApi';
import * as fattening from './fatteningTransitionsApi';
import { feedingFatteningSyncResources, toCloudFeedingFattening,
  type FeedingFatteningCloudRecord, type FeedingFatteningSource } from './feedingFatteningSyncProtocol';

const context = vi.hoisted(() => ({ plan: 'standard', token: 'actions-transition-token', farmId: 'actions-transition-farm', userId: 'actions-transition-user' }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => context.plan }));
vi.mock('./authClient', () => ({ getAuthToken: () => context.token,
  getStoredAuthUser: () => ({ id: context.userId, farmId: context.farmId }) }));

const feedingInput: feeding.FeedingAlertActionInput = { actionDate: '2026-11-02', calfId: 'calf-A', calfName: '検証子牛',
  ageDays: '002', alertType: '増体', actionType: '確認', memo: '正式保存', nextCheckDate: '2026-11-04', status: '対応済み' };
const fatteningInput: fattening.FatteningTransitionInput = { ...fattening.emptyFatteningTransitionInput,
  targetNumber: 'COW-A', targetName: '検証肥育牛', startDate: '2026-11-02', startWeight: '450.00', targetWeight: '750', memo: '正式保存' };

beforeEach(async () => {
  Object.assign(context, { plan: 'standard', token: 'actions-transition-token', farmId: 'actions-transition-farm', userId: 'actions-transition-user' });
  window.history.replaceState(null, '', '/');
  localStorage.clear(); sessionStorage.clear();
  for (const store of ['feedingAlertActions', 'fatteningTransitions', 'metadata', 'cattle', 'calves', 'expenses', 'schedules'] as const) await clearStore(store);
  for (const store of ['cattle', 'calves', 'expenses', 'schedules'] as const) await saveRecordPreservingTimestamps(store, unrelated);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(async () => {
  context.farmId = 'actions-transition-farm'; context.userId = 'actions-transition-user';
  for (const store of ['cattle', 'calves', 'expenses', 'schedules'] as const) expect(await getAllRecords(store)).toEqual([unrelated]);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

const timestamp = '2026-11-01T00:00:00.000Z';
const unrelated = { id: 'untouched', memo: '本体以外は変更しない', createdAt: timestamp, updatedAt: timestamp };

describe.each([
  { name: 'feeding', create: () => feeding.createFeedingAlertAction(feedingInput) },
  { name: 'fattening', create: () => fattening.createFatteningTransition(fatteningInput) },
])('$name record synchronization baseline', ({ create }) => {
  it('sends a formal paid save with a create-only condition', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (init?.method === 'PUT') return Response.json({ ...JSON.parse(String(init.body)), cloudUpdatedAt: '2026-11-02T00:00:00.000Z' });
      return String(url).endsWith('/record-sync') ? Response.json([]) : new Response(null, { status: 404 });
    }));
    const saved = await create();
    const puts = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(new Headers(puts[0][1]?.headers).get('If-None-Match')).toBe('*');
    expect(JSON.parse(String(puts[0][1]?.body)).id).toBe(saved.id);
  });

  it('keeps Free saves local without HTTP', async () => {
    context.plan = 'free'; vi.stubGlobal('fetch', vi.fn());
    expect((await create()).id).toMatch(/^[0-9a-f-]{36}$/);
    expect(fetch).not.toHaveBeenCalled();
  });
});

it('serializes two local fattening creations so only one active record for the cow commits', async () => {
  context.plan = 'free';
  const results = await Promise.allSettled([
    fattening.createFatteningTransition(fatteningInput), fattening.createFatteningTransition(fatteningInput),
  ]);
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
  expect(await getAllRecords('fatteningTransitions')).toHaveLength(1);
});

type Row = StoredRecord & { id: string; syncRecordId?: string; cloudUpdatedAt?: string; cloudSyncPending?: boolean };
type Input = Record<string, unknown>;
type Resource = {
  source: FeedingFatteningSource; input: Input; page: string; event: string; dateField: string; ownerKey: string;
  create: (input: Input) => Promise<Row>; update: (id: string, input: Input) => Promise<Row>;
  remove: (id: string) => Promise<void>; list: () => Promise<Row[]>; get: (id: string) => Promise<Row>;
  retry: () => Promise<number>; status: (record: Row) => { pending: boolean; warning?: string };
  LocalError: new (...args: never[]) => Error; ConflictError: new (...args: never[]) => Error;
};
const resources: Resource[] = [
  { source: 'feedingAlertActions', input: feedingInput, page: '/feeding-alert-actions', dateField: 'nextCheckDate',
    event: feeding.FEEDING_ALERT_ACTION_SYNC_STATUS_EVENT, ownerKey: 'farmpro.feedingAlertActionSyncOwner.actions-transition-farm',
    create: input => feeding.createFeedingAlertAction(input as feeding.FeedingAlertActionInput) as Promise<Row>,
    update: (id, input) => feeding.updateFeedingAlertAction(id, input as feeding.FeedingAlertActionInput) as Promise<Row>,
    remove: feeding.deleteFeedingAlertAction, list: feeding.fetchFeedingAlertActions as () => Promise<Row[]>,
    get: feeding.fetchFeedingAlertAction as (id: string) => Promise<Row>, retry: feeding.retryPendingFeedingAlertActionSync,
    status: record => feeding.getFeedingAlertActionSyncStatus(record as feeding.FeedingAlertAction),
    LocalError: feeding.FeedingAlertActionLocalSaveError, ConflictError: feeding.FeedingAlertActionSyncConflictError },
  { source: 'fatteningTransitions', input: fatteningInput, page: '/fattening-transitions', dateField: 'targetShippingDate',
    event: fattening.FATTENING_TRANSITION_SYNC_STATUS_EVENT, ownerKey: 'farmpro.fatteningTransitionSyncOwner.actions-transition-farm',
    create: input => fattening.createFatteningTransition(input as fattening.FatteningTransitionInput) as Promise<Row>,
    update: (id, input) => fattening.updateFatteningTransition(id, input as fattening.FatteningTransitionInput) as Promise<Row>,
    remove: fattening.deleteFatteningTransition, list: fattening.getFatteningTransitions as () => Promise<Row[]>,
    get: fattening.getFatteningTransition as (id: string) => Promise<Row>, retry: fattening.retryPendingFatteningTransitionSync,
    status: record => fattening.getFatteningTransitionSyncStatus(record as fattening.FatteningTransitionRecord),
    LocalError: fattening.FatteningTransitionLocalSaveError, ConflictError: fattening.FatteningTransitionSyncConflictError },
];
type RequestLog = { id: string; method: string; headers: Headers; body?: FeedingFatteningCloudRecord; signal?: AbortSignal | null };
type Fixture = {
  remote: Map<string, FeedingFatteningCloudRecord>; calls: RequestLog[]; pendingCount: number;
  failGet: boolean; failPut: boolean; losePutAck: boolean; loseDeleteAck: boolean;
  intercept?: (request: RequestLog) => Promise<Response | undefined>;
  afterWrite?: (saved: FeedingFatteningCloudRecord, request: RequestLog) => Promise<Response | undefined>;
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const writes = (fixture: Fixture) => fixture.calls.filter(call => call.method !== 'GET');
const read = (resource: Resource, id: string) => getRecordById<Row>(resource.source, id);

function serve(resource: Resource): Fixture {
  const fixture: Fixture = { remote: new Map(), calls: [], pendingCount: 0, failGet: false, failPut: false, losePutAck: false, loseDeleteAck: false };
  const { path } = feedingFatteningSyncResources[resource.source]; let revision = 0;
  window.history.replaceState(null, '', resource.page);
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const address = String(url);
    if (address !== path && !address.startsWith(`${path}/`)) throw new Error(`Unexpected related side effect: ${address}`);
    const id = address === path ? '' : decodeURIComponent(address.slice(path.length + 1));
    const request: RequestLog = { id, method: init?.method ?? 'GET', headers: new Headers(init?.headers), signal: init?.signal,
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) };
    fixture.calls.push(request);
    const intercepted = await fixture.intercept?.(request); if (intercepted) return intercepted;
    if (request.method === 'GET') {
      if (fixture.failGet) throw new TypeError('offline');
      if (!id) return Response.json([...fixture.remote.values()]);
      return fixture.remote.has(id) ? Response.json(fixture.remote.get(id)) : new Response(null, { status: 404 });
    }
    const previous = fixture.remote.get(id);
    if (!request.headers.has('If-Match') && !request.headers.has('If-None-Match')) return Response.json({ message: '条件が必要です。' }, { status: 428 });
    if (request.method === 'DELETE' && previous?.deletedAt && request.headers.has('If-Match')) return Response.json(previous);
    const matches = previous ? request.headers.get('If-Match') === JSON.stringify(previous.cloudUpdatedAt)
      : request.headers.get('If-None-Match') === '*';
    if (!matches) return Response.json({ message: '別端末の変更があります。' }, { status: 412 });
    const nextRevision = new Date(Date.UTC(2026, 10, 2) + ++revision).toISOString();
    let saved: FeedingFatteningCloudRecord;
    if (request.method === 'PUT') {
      if (previous?.deletedAt) return Response.json({ message: 'クラウドで削除済みです。' }, { status: 409 });
      if (fixture.failPut) return Response.json({ message: '一時的に送信できません。' }, { status: 503 });
      saved = { ...previous, ...request.body!, id, cloudUpdatedAt: nextRevision }; fixture.remote.set(id, saved);
      if (fixture.losePutAck) { fixture.losePutAck = false; throw new TypeError('PUT ACK lost'); }
    } else if (request.method === 'DELETE') {
      saved = { ...previous, id, deletedAt: nextRevision, cloudUpdatedAt: nextRevision }; fixture.remote.set(id, saved);
      if (fixture.loseDeleteAck) { fixture.loseDeleteAck = false; throw new TypeError('DELETE ACK lost'); }
    } else throw new Error(`Unexpected mutation: ${request.method}`);
    return await fixture.afterWrite?.(saved, request) ?? Response.json(saved);
  }));
  return fixture;
}

async function pendingCreation(resource: Resource, fixture: Fixture): Promise<Row> {
  fixture.failGet = true;
  const input = { ...resource.input, ...(resource.source === 'fatteningTransitions' ? { targetNumber: `PENDING-COW-${++fixture.pendingCount}` } : {}) };
  const error = await resource.create(input).catch(value => value) as Error & { record: Row };
  expect(error).toBeInstanceOf(resource.LocalError);
  fixture.failGet = false; fixture.calls = [];
  return (await read(resource, error.record.id))!;
}

describe.each(resources)('$source conditional source synchronization', resource => {
  const { prefix } = feedingFatteningSyncResources[resource.source];

  it.each(['standard', 'pro'])('preserves every field, null and unknown through %s CRUD and does not fetch on a single local read', async plan => {
    context.plan = plan; const fixture = serve(resource);
    const initial = { ...resource.input, [resource.dateField]: null, customHistory: { amount: '10.00', originalDate: '2026-11-02T03:00:00+09:00' } };
    const saved = await resource.create(initial); fixture.calls = [];
    expect(await resource.get(saved.id)).toMatchObject({ [resource.dateField]: null, customHistory: initial.customHistory });
    expect(fixture.calls).toEqual([]);
    const updated = await resource.update(saved.id, { ...resource.input, memo: '次の正式入力', [resource.dateField]: '' });
    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(saved.cloudUpdatedAt));
    expect(updated).toMatchObject({ id: saved.id, [resource.dateField]: '', customHistory: initial.customHistory, createdAt: saved.createdAt });
    expect(Object.keys(writes(fixture)[0].body!).some(key => key.startsWith(prefix) || key.startsWith('cloudSync'))).toBe(false);
    await resource.remove(saved.id);
    expect(await read(resource, saved.id)).toBeUndefined();
    expect(writes(fixture)[1].headers.get('If-Match')).toBe(JSON.stringify(updated.cloudUpdatedAt));
  });

  it.each(['unchanged', 'changed'])('preserves a Free edit on plan return and requires an explicit save when the remote is %s', async remoteState => {
    const fixture = serve(resource);
    const saved = await resource.create({ ...resource.input, customHistory: { precision: '10.00', nullable: null } });
    const peer = { ...fixture.remote.get(saved.syncRecordId!)!, memo: '別端末のB', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' };
    context.plan = 'free'; fixture.calls = [];
    const freeInput = { ...resource.input, memo: 'Freeで編集したC', [resource.dateField]: null };
    const free = await resource.update(saved.id, freeInput);
    expect(fixture.calls).toEqual([]);
    expect(resource.status(free)).toEqual({ pending: false });
    if (remoteState === 'changed') fixture.remote.set(saved.syncRecordId!, peer);
    context.plan = 'standard';

    await resource.list();
    const held = (await read(resource, saved.id))!;

    expect(toCloudFeedingFattening(resource.source, held)).toEqual(toCloudFeedingFattening(resource.source, free));
    expect(held).toMatchObject({ memo: 'Freeで編集したC', [resource.dateField]: null, customHistory: { precision: '10.00', nullable: null },
      cloudSyncPending: true, [`${prefix}Base`]: { cloudUpdatedAt: saved.cloudUpdatedAt, record: toCloudFeedingFattening(resource.source, saved) } });
    expect(free).not.toHaveProperty(`${prefix}Origin`);
    expect(await resource.retry()).toBe(0);
    expect(writes(fixture)).toEqual([]);
    if (remoteState === 'changed') {
      await expect(resource.update(saved.id, freeInput)).rejects.toBeInstanceOf(resource.ConflictError);
      expect(await read(resource, saved.id)).toMatchObject({ memo: 'Freeで編集したC', [resource.dateField]: null, cloudSyncPending: true });
      expect(fixture.remote.get(saved.syncRecordId!)).toEqual(peer);
      expect(writes(fixture)).toEqual([]);
    } else {
      const acknowledged = await resource.update(saved.id, freeInput);
      expect(acknowledged).toMatchObject({ memo: 'Freeで編集したC', [resource.dateField]: null, customHistory: { precision: '10.00', nullable: null }, cloudSyncPending: false });
      expect(writes(fixture)).toHaveLength(1);
      expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(saved.cloudUpdatedAt));
    }
  });

  it('retains a lost-ACK attempt through a Free edit until an explicit paid save confirms it', async () => {
    const fixture = serve(resource); const saved = await resource.create(resource.input);
    fixture.losePutAck = true;
    await expect(resource.update(saved.id, { ...resource.input, memo: '応答喪失B' })).rejects.toThrow('PUT ACK lost');
    const beforeFree = (await read(resource, saved.id))!;
    const remoteB = structuredClone(fixture.remote.get(saved.syncRecordId!)!);
    context.plan = 'free'; fixture.calls = [];
    const freeInput = { ...resource.input, memo: 'Freeで編集したC' };
    const free = await resource.update(saved.id, freeInput);
    expect(free[`${prefix}Base`]).toEqual(beforeFree[`${prefix}Base`]);
    expect(free[`${prefix}Attempt`]).toEqual(beforeFree[`${prefix}Attempt`]);
    expect(free).not.toHaveProperty(`${prefix}Origin`);
    expect(fixture.calls).toEqual([]);
    context.plan = 'standard'; await resource.list();
    expect(await resource.retry()).toBe(0); expect(writes(fixture)).toEqual([]);
    await resource.update(saved.id, freeInput);
    expect(await read(resource, saved.id)).toMatchObject({ memo: 'Freeで編集したC', cloudSyncPending: false });
    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(remoteB.cloudUpdatedAt));
  });

  it('uses an existing syncRecordId without a prefix or local ID rewrite on its first formal upload', async () => {
    const fixture = serve(resource);
    const legacy = await saveRecordPreservingTimestamps(resource.source, { ...resource.input, id: 'local-string', syncRecordId: 'wire/string:alias',
      customHistory: { legacy: true }, createdAt: timestamp, updatedAt: timestamp });
    expect(await resource.list()).toEqual([legacy]);
    expect(writes(fixture)).toEqual([]);
    const saved = await resource.update('local-string', { ...resource.input, memo: '初回の正式編集' });
    expect(writes(fixture)[0]).toMatchObject({ id: 'wire/string:alias', body: { id: 'wire/string:alias', customHistory: legacy.customHistory } });
    expect(writes(fixture)[0].headers.get('If-None-Match')).toBe('*');
    expect(saved.id).toBe('local-string');
  });

  it('returns the committed ID after lost create ACK and reuses it on a formal save', async () => {
    const fixture = serve(resource); fixture.losePutAck = true;
    const error = await resource.create(resource.input).catch(value => value) as Error & { record: Row; cause: unknown };
    expect(error).toBeInstanceOf(resource.LocalError); expect(error.cause).toBeInstanceOf(TypeError);
    expect(await read(resource, error.record.id)).toMatchObject({ id: error.record.id, cloudSyncPending: true });
    await resource.update(error.record.id, { ...resource.input, memo: '同じIDで新しい入力' });
    expect(await getAllRecords(resource.source)).toHaveLength(1); expect(fixture.remote.size).toBe(1);
  });

  it('reports a locally committed ID before rejecting a context switch at transaction completion', async () => {
    const fixture = serve(resource);
    const originalTransaction = IDBDatabase.prototype.transaction;
    const txSpy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, stores, mode, options) {
      const tx = originalTransaction.call(this, stores, mode, options);
      if (stores === resource.source && mode === 'readwrite') tx.addEventListener('complete', () => { context.token = 'after-commit'; }, { once: true });
      return tx;
    });
    const error = await resource.create(resource.input).catch(value => value) as Error & { record: Row };
    txSpy.mockRestore(); expect(error).toBeInstanceOf(resource.LocalError); expect(error.message).toContain('ログインまたは農場');
    expect(await read(resource, error.record.id)).toMatchObject({ cloudSyncPending: true });
    expect(writes(fixture)).toEqual([]);
    context.token = 'actions-transition-token'; await resource.update(error.record.id, resource.input);
    expect(await getAllRecords(resource.source)).toHaveLength(1);
  });

  it('retains confirmed B across a lost ACK and failed C, then retries C conditionally', async () => {
    const fixture = serve(resource); const saved = await resource.create(resource.input);
    fixture.losePutAck = true;
    await expect(resource.update(saved.id, { ...resource.input, memo: 'B' })).rejects.toThrow('PUT ACK lost');
    const confirmedB = structuredClone(fixture.remote.get(saved.syncRecordId!)!);
    fixture.failPut = true;
    await expect(resource.update(saved.id, { ...resource.input, memo: 'C' })).rejects.toThrow('一時的');
    expect(await read(resource, saved.id)).toMatchObject({ memo: 'C', [`${prefix}Base`]: { record: confirmedB, cloudUpdatedAt: confirmedB.cloudUpdatedAt } });
    fixture.failPut = false; fixture.calls = [];
    expect(await resource.retry()).toBe(1);
    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(confirmedB.cloudUpdatedAt));
    expect(await read(resource, saved.id)).toMatchObject({ memo: 'C', cloudSyncPending: false });
  });

  it('retains unknown values from the approved base and refuses an ACK that changes an unknown value', async () => {
    const fixture = serve(resource); const saved = await resource.create({ ...resource.input, customHistory: { precision: '1.00' } });
    fixture.failGet = true;
    await expect(resource.update(saved.id, { ...resource.input, memo: '旧reader編集' })).rejects.toThrow('offline');
    const { customHistory, ...oldReader } = (await read(resource, saved.id))!;
    await saveRecordPreservingTimestamps(resource.source, oldReader);
    fixture.failGet = false; fixture.calls = [];
    expect(await resource.retry()).toBe(1);
    expect(writes(fixture)[0].body).toMatchObject({ customHistory });
    fixture.afterWrite = async record => Response.json({ ...record, customHistory: { precision: '1' } });
    await expect(resource.update(saved.id, { ...resource.input, memo: '別表記のACKを拒否' })).rejects.toBeInstanceOf(resource.ConflictError);
    expect(await read(resource, saved.id)).toMatchObject({ customHistory, cloudSyncPending: true, [`${prefix}Blocked`]: true });
  });

  it.each(['readback', 'PUT'])('keeps a peer update intact when it wins before %s', async phase => {
    const fixture = serve(resource); const saved = await resource.create(resource.input);
    const peer = { ...fixture.remote.get(saved.syncRecordId!)!, memo: '別端末の入力', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' };
    fixture.calls = [];
    if (phase === 'readback') fixture.remote.set(saved.syncRecordId!, peer);
    else fixture.intercept = async request => { if (request.method === 'PUT') fixture.remote.set(request.id, peer); return undefined; };
    await expect(resource.update(saved.id, { ...resource.input, memo: 'この端末の編集' })).rejects.toBeInstanceOf(resource.ConflictError);
    expect(await read(resource, saved.id)).toMatchObject({ memo: 'この端末の編集', cloudSyncPending: true, [`${prefix}Blocked`]: true });
    expect(fixture.remote.get(saved.syncRecordId!)).toEqual(peer);
    const requests = fixture.calls.length; expect(await resource.retry()).toBe(0); expect(fixture.calls).toHaveLength(requests);
  });

  it('protects a peer update between GET and DELETE and blocks saves while deletion is pending', async () => {
    const fixture = serve(resource); const saved = await resource.create(resource.input);
    const peer = { ...fixture.remote.get(saved.syncRecordId!)!, memo: '削除直前の別編集', cloudUpdatedAt: '2026-11-02T01:00:00.000Z' };
    fixture.calls = []; fixture.intercept = async request => { if (request.method === 'DELETE') fixture.remote.set(request.id, peer); return undefined; };
    await expect(resource.remove(saved.id)).rejects.toBeInstanceOf(resource.ConflictError);
    expect(writes(fixture)[0].headers.get('If-Match')).toBe(JSON.stringify(saved.cloudUpdatedAt));
    expect(fixture.remote.get(saved.syncRecordId!)).toEqual(peer);
    await expect(resource.update(saved.id, resource.input)).rejects.toThrow('削除の確認待ち');
    expect(await resource.retry()).toBe(0);
    expect(await read(resource, saved.id)).toEqual({ ...saved, cloudSyncPending: true, [`${prefix}DeletePending`]: true });
  });

  it('holds lost DELETE acknowledgement through list reload and completes only after explicit retry', async () => {
    const fixture = serve(resource); const saved = await resource.create(resource.input); fixture.loseDeleteAck = true;
    await expect(resource.remove(saved.id)).rejects.toThrow('DELETE ACK lost');
    const tombstone = structuredClone(fixture.remote.get(saved.syncRecordId!)!);
    expect(await resource.list()).toEqual([expect.objectContaining({ id: saved.id, [`${prefix}DeletePending`]: true })]);
    expect(await resource.retry()).toBe(0);
    await resource.remove(saved.id); expect(await read(resource, saved.id)).toBeUndefined();
    expect(fixture.remote.get(saved.syncRecordId!)).toEqual(tombstone);
  });

  it('requires a successful tombstone rather than a DELETE 404 before removing a legacy original', async () => {
    const fixture = serve(resource);
    await saveRecordPreservingTimestamps(resource.source, { ...resource.input, id: 'legacy' });
    fixture.intercept = async request => request.method === 'DELETE' ? new Response(null, { status: 404 }) : undefined;
    await expect(resource.remove('legacy')).rejects.toThrow('404');
    expect(await read(resource, 'legacy')).toMatchObject({ id: 'legacy', [`${prefix}DeletePending`]: true });
    expect(writes(fixture)[0].headers.get('If-None-Match')).toBe('*');
    fixture.intercept = undefined; await resource.remove('legacy'); expect(await read(resource, 'legacy')).toBeUndefined();
  });

  it.each(['different', 'deleted', 'matching'])('does not silently replace a legacy record on its initial %s cloud read', async kind => {
    const fixture = serve(resource);
    const legacy = await saveRecordPreservingTimestamps(resource.source, { ...resource.input, id: 'legacy', customHistory: { note: null }, createdAt: timestamp, updatedAt: timestamp });
    const wire = toCloudFeedingFattening(resource.source, legacy);
    fixture.remote.set('legacy', kind === 'deleted' ? { id: 'legacy', cloudUpdatedAt: timestamp, deletedAt: timestamp }
      : { ...wire, ...(kind === 'different' ? { memo: '別端末の同じID' } : {}), cloudUpdatedAt: timestamp });
    const event = vi.fn(); window.addEventListener(resource.event, event);
    const listed = await resource.list(); const result = listed[0];
    expect(toCloudFeedingFattening(resource.source, result)).toEqual(wire);
    if (kind === 'matching') expect(result).toEqual({ ...legacy, syncRecordId: 'legacy', cloudUpdatedAt: timestamp, cloudSyncPending: false });
    else expect(result).toMatchObject({ cloudSyncPending: true, [`${prefix}Blocked`]: true, [`${prefix}Warning`]: expect.stringContaining('同じID') });
    expect(result).not.toHaveProperty(`${prefix}Origin`);
    expect(await resource.retry()).toBe(0); expect(writes(fixture)).toEqual([]); expect(event).not.toHaveBeenCalled();
    window.removeEventListener(resource.event, event);
  });

  it.each(['edit', 'delete'])('does not overwrite or resurrect a direct %s while a list reply is delayed', async change => {
    const fixture = serve(resource); const saved = await resource.create(resource.input);
    const started = deferred<void>(); const response = deferred<Response>();
    fixture.intercept = async request => { if (request.id) return undefined; started.resolve(); return response.promise; };
    const listing = resource.list(); await started.promise;
    if (change === 'edit') await saveRecordPreservingTimestamps(resource.source, { ...saved, memo: '一覧待ち中の直接編集', unknownNext: '保持' });
    else await deleteRecord(resource.source, saved.id);
    const current = await read(resource, saved.id);
    response.resolve(Response.json([{ ...toCloudFeedingFattening(resource.source, saved), memo: '遅れたクラウド', cloudUpdatedAt: '2026-11-02T04:00:00.000Z' }]));
    await listing; expect(await read(resource, saved.id)).toEqual(current);
  });

  it.each(['PUT', 'DELETE'])('does not remove or acknowledge a raw edit during a delayed %s acknowledgement', async method => {
    const fixture = serve(resource); const saved = await resource.create(resource.input);
    const started = deferred<void>(); const released = deferred<void>();
    fixture.afterWrite = async (_record, request) => { if (request.method === method) { started.resolve(); await released.promise; } return undefined; };
    const work = (method === 'PUT' ? resource.update(saved.id, { ...resource.input, memo: '送信中' }) : resource.remove(saved.id)).catch(error => error);
    await started.promise;
    const current = await saveRecordPreservingTimestamps(resource.source, { ...await read(resource, saved.id), id: saved.id,
      memo: '新しい直接編集', customHistory: { another: true }, cloudSyncPending: false });
    released.resolve(); expect(await work).toBeInstanceOf(resource.ConflictError);
    expect(await read(resource, saved.id)).toEqual(method === 'DELETE'
      ? { ...current, cloudSyncPending: true, [`${prefix}DeletePending`]: true } : current);
  });

  it('times out an unresolved PUT body and ignores the late body after a successful source-only readback retry', async () => {
    const fixture = serve(resource); const saved = await resource.create(resource.input);
    const started = deferred<void>(); const body = deferred<unknown>();
    fixture.afterWrite = async () => {
      const response = Response.json({}); vi.spyOn(response, 'json').mockImplementation(() => { started.resolve(); return body.promise; }); return response;
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const work = resource.update(saved.id, { ...resource.input, memo: 'body待ち' }).catch(error => error); await started.promise;
    await vi.advanceTimersByTimeAsync(12000); expect(await work).toMatchObject({ message: expect.stringContaining('時間切れ') });
    expect(writes(fixture).slice(-1)[0].signal?.aborted).toBe(true);
    fixture.afterWrite = undefined; fixture.calls = [];
    expect(await resource.retry()).toBe(1); expect(writes(fixture)).toEqual([]);
    const acknowledged = await read(resource, saved.id);
    body.resolve(fixture.remote.get(saved.syncRecordId!)); await vi.advanceTimersByTimeAsync(0);
    expect(await read(resource, saved.id)).toEqual(acknowledged);
  });

  it('retries owned pending rows once under concurrent starts and does not send legacy or foreign/deleting rows', async () => {
    const fixture = serve(resource); const pending = await pendingCreation(resource, fixture);
    const origin = pending[`${prefix}Origin`] as Record<string, unknown>;
    for (const [index, change] of [
      { [`${prefix}Origin`]: undefined }, { [`${prefix}Origin`]: { ...origin, ownerId: 'foreign' } },
      { [`${prefix}Origin`]: { ...origin, farmId: 'foreign' } }, { [`${prefix}Origin`]: { ...origin, userId: 'foreign' } },
      { [`${prefix}DeletePending`]: true }, { deletedAt: timestamp },
    ].entries()) await saveRecordPreservingTimestamps(resource.source, { ...pending, ...change, id: `excluded-${index}`, syncRecordId: `excluded-${index}` });
    const event = vi.fn(); window.addEventListener(resource.event, event);
    expect((await Promise.all([resource.retry(), resource.retry()])).reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(writes(fixture)).toHaveLength(1); expect(writes(fixture)[0].id).toBe(pending.id);
    const acknowledged = (await read(resource, pending.id))!;
    expect(acknowledged).toMatchObject({ cloudSyncPending: false, updatedAt: pending.updatedAt });
    for (const name of ['Origin', 'Base', 'Attempt', 'Warning', 'Blocked']) expect(acknowledged).not.toHaveProperty(`${prefix}${name}`);
    expect(event).toHaveBeenCalledTimes(1);
    window.removeEventListener(resource.event, event);
  });

  it.each(['Free', 'offline', 'hidden', 'form', 'backup'])('does not auto-send while %s', async mode => {
    const fixture = serve(resource); const pending = await pendingCreation(resource, fixture);
    if (mode === 'Free') context.plan = 'free';
    if (mode === 'offline') vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    if (mode === 'hidden') vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    if (mode === 'form') window.history.replaceState(null, '', `${resource.page}/new`);
    if (mode === 'backup') window.history.replaceState(null, '', '/backup');
    expect(await resource.retry()).toBe(0); expect(fixture.calls).toEqual([]);
    expect(await read(resource, pending.id)).toEqual(pending);
  });

  it.each(['owner', 'page', 'token', 'farm'])('stops before PUT and the next row after %s changes during retry GET', async change => {
    const fixture = serve(resource); await pendingCreation(resource, fixture); await pendingCreation(resource, fixture);
    const originals = await getAllRecords(resource.source); const started = deferred<void>(); const released = deferred<void>();
    fixture.intercept = async request => { if (request.method === 'GET') { started.resolve(); await released.promise; } return undefined; };
    const retry = resource.retry(); await started.promise;
    if (change === 'owner') localStorage.setItem(resource.ownerKey, 'new-owner');
    if (change === 'page') window.history.replaceState(null, '', '/');
    if (change === 'token') context.token = 'new-token';
    if (change === 'farm') context.farmId = 'new-farm';
    released.resolve(); expect(await retry).toBe(0); context.farmId = 'actions-transition-farm';
    expect(fixture.calls.map(call => call.method)).toEqual(['GET']);
    expect(await getAllRecords(resource.source)).toEqual(originals);
  });

  it.each(['owner', 'page', 'raw original'])('does not ACK an automatic PUT after %s changes', async change => {
    const fixture = serve(resource); const pending = await pendingCreation(resource, fixture);
    const started = deferred<void>(); const released = deferred<void>();
    fixture.afterWrite = async () => { started.resolve(); await released.promise; return undefined; };
    const retry = resource.retry(); await started.promise;
    if (change === 'owner') localStorage.setItem(resource.ownerKey, 'new-owner');
    if (change === 'page') window.history.replaceState(null, '', `${resource.page}/new`);
    if (change === 'raw original') await saveRecordPreservingTimestamps(resource.source, { ...await read(resource, pending.id), id: pending.id, memo: 'ACK待ち中の編集' });
    const current = await read(resource, pending.id); released.resolve();
    expect(await retry).toBe(0); expect(await read(resource, pending.id)).toEqual(current);
  });
});

describe('fattening active-record compatibility', () => {
  const resource = resources[1];
  async function seed(id: string, changes: Partial<fattening.FatteningTransitionRecord> = {}) {
    return saveRecordPreservingTimestamps('fatteningTransitions', { ...fatteningInput, id, ...changes,
      createdAt: timestamp, updatedAt: timestamp });
  }

  it('rejects a new shipped record while a trimmed matching active record exists, and active lookup remains read-only', async () => {
    const fixture = serve(resource); context.plan = 'free';
    const active = await seed('active', { targetNumber: ' COW-A ' });
    expect(await fattening.getActiveFatteningTransition(' COW-A ')).toEqual(active);
    await expect(fattening.createFatteningTransition({ ...fatteningInput, status: '出荷済み' })).rejects.toThrow('すでに');
    expect(await getAllRecords('fatteningTransitions')).toEqual([active]);
    expect(fixture.calls).toEqual([]);
    expect(localStorage.getItem(resource.ownerKey)).toBeNull();
  });

  it('allows a new transition when the matching historical record is shipped', async () => {
    serve(resource); context.plan = 'free';
    const history = await seed('shipped', { status: '出荷済み' });
    const created = await fattening.createFatteningTransition(fatteningInput);
    expect(created.id).not.toBe(history.id);
    expect(await getAllRecords('fatteningTransitions')).toHaveLength(2);
    expect(await fattening.getActiveFatteningTransition('COW-A')).toEqual(created);
  });

  it('rejects reactivation and active ear-tag changes that add a duplicate but preserves same-target editing of legacy duplicates', async () => {
    serve(resource); context.plan = 'free';
    await seed('active-A');
    const shipped = await seed('shipped-A', { status: '出荷済み' });
    const otherCow = await seed('active-B', { targetNumber: 'COW-B' });
    await expect(fattening.updateFatteningTransition(shipped.id, fatteningInput)).rejects.toThrow('すでに');
    await expect(fattening.updateFatteningTransition(otherCow.id, fatteningInput)).rejects.toThrow('すでに');
    expect(await getRecordById('fatteningTransitions', shipped.id)).toEqual(shipped);
    expect(await getRecordById('fatteningTransitions', otherCow.id)).toEqual(otherCow);
    await seed('legacy-duplicate', { targetNumber: ' COW-A ', status: '出荷準備' });
    await fattening.updateFatteningTransition('active-A', { ...fatteningInput, status: '出荷準備', memo: '既存記録の状態とメモを修正' });
    expect(await getRecordById('fatteningTransitions', 'active-A')).toMatchObject({ status: '出荷準備', memo: '既存記録の状態とメモを修正' });
    await fattening.updateFatteningTransition('active-A', { ...fatteningInput, status: '出荷済み' });
    expect(await getRecordById('fatteningTransitions', 'active-A')).toMatchObject({ status: '出荷済み' });
  });

  it('checks an online active record before creating a second local identity', async () => {
    const fixture = serve(resource);
    const remote = { ...fatteningInput, id: 'remote-active', cloudUpdatedAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
    fixture.remote.set(remote.id, remote);
    const error = await fattening.createFatteningTransition(fatteningInput).catch(value => value);
    expect(error).toBeInstanceOf(Error); expect(error).not.toBeInstanceOf(fattening.FatteningTransitionLocalSaveError);
    expect(await getAllRecords('fatteningTransitions')).toEqual([{ ...remote, syncRecordId: remote.id, cloudSyncPending: false }]);
    expect(writes(fixture)).toEqual([]);
    expect(fixture.remote.size).toBe(1);
  });

  it('checks a direct local creation that commits while the online preflight is still waiting', async () => {
    const fixture = serve(resource); const started = deferred<void>(); const response = deferred<Response>();
    fixture.intercept = async request => { if (request.id) return undefined; started.resolve(); return response.promise; };
    const creating = fattening.createFatteningTransition(fatteningInput).catch(error => error); await started.promise;
    const direct = await seed('direct-before-create'); response.resolve(Response.json([]));
    expect(await creating).toMatchObject({ message: expect.stringContaining('すでに') });
    expect(await getAllRecords('fatteningTransitions')).toEqual([direct]);
    expect(writes(fixture)).toEqual([]);
  });

  it('keeps the new local ID pending when a concurrent remote creation wins the server duplicate condition', async () => {
    const fixture = serve(resource);
    const peer = { ...fatteningInput, id: 'peer-created-first', cloudUpdatedAt: timestamp, createdAt: timestamp, updatedAt: timestamp };
    fixture.intercept = async request => {
      if (request.method !== 'PUT') return undefined;
      fixture.remote.set(peer.id, peer);
      return Response.json({ message: '同じ耳標の肥育中記録があります。' }, { status: 409 });
    };
    const error = await fattening.createFatteningTransition(fatteningInput).catch(value => value) as fattening.FatteningTransitionLocalSaveError;
    expect(error).toBeInstanceOf(fattening.FatteningTransitionLocalSaveError);
    expect(error.record.id).not.toBe(peer.id);
    expect(await getAllRecords('fatteningTransitions')).toEqual([expect.objectContaining({ id: error.record.id,
      cloudSyncPending: true, fatteningTransitionSyncBlocked: true })]);
    expect([...fixture.remote.values()]).toEqual([peer]);
  });
});
