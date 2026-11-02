import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, deleteRecord, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import type { Breeding, BreedingInput } from '../types/breeding';
import type { ExpenseRecord } from './expensesApi';
import { BreedingSyncConflictError, deleteBreeding, getBreedingList, getBreedingListForHomeSummary, updateBreeding } from './breedingApi';

const { context } = vi.hoisted(() => ({ context: {
  planId: 'standard', token: 'fixture-breeding-token',
  user: { id: 'fixture-breeding-user', farmId: 'fixture-breeding-farm' },
} }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => context.planId }));
vi.mock('./authClient', () => ({ getAuthToken: () => context.token, getStoredAuthUser: () => context.user }));
// The ordinary breeding and expense services, their repository writes and their
// independent locks are real; only the network is held at an observed request.
vi.mock('./supplyInventorySync', () => ({ syncSupplyInventorySafely: vi.fn(async () => false) }));

type LocalBreeding = Breeding & {
  recordKind: 'standard'; cloudRecordId: string | number; cloudUpdatedAt: string; cloudSyncPending: boolean;
  breedingSyncDeletePending?: boolean;
};
const initialInput: BreedingInput = {
  cowEarTag: 'FIXTURE-COW', cowName: '試験牛', heatDate: '2026-11-01',
  breedingMethod: '種付', breedingStatus: '種付実施', inseminationDate: '2026-11-02', inseminationCost: '10000',
  bullName: '', inseminatorName: '', transferPlannedDate: '', transferDate: '', transferCost: '',
  embryoCost: '', transferProcedureCost: '', transferOtherCost: '', transferCancelReason: '', embryoNumber: '',
  collectionDate: '', embryoType: '', donorCowName: '', donorCowEarTag: '', embryoSireName: '', embryoGrade: '',
  strawNumber: '', supplierName: '', transferTechnician: '', nextHeatExpectedDate: '', pregnancyCheckExpectedDate: '',
  pregnancyCheckDate: '', pregnancyCheckCost: '', pregnancyResult: '', recheckExpectedDate: '', expectedCalvingDate: '',
  note: '応答待ち開始時の原本',
};
const original: LocalBreeding = {
  ...initialInput, id: 123, recordKind: 'standard', cloudRecordId: 'cloud-breeding-123',
  cloudUpdatedAt: '2026-11-01T00:00:00.000Z', cloudSyncPending: false,
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};
const originalExpense: ExpenseRecord & { cloudUpdatedAt: string } = {
  id: 'fixture-breeding-expense', syncRecordId: 'expense:fixture-breeding-expense', cloudSyncPending: false,
  cloudUpdatedAt: '2026-11-01T00:00:00.000Z', paymentDate: '2026-11-02', category: '種付け・繁殖費',
  description: '人工授精・種付費', vendor: '', amount: '10000', paymentMethod: '', target: 'FIXTURE-COW 試験牛',
  sourceType: 'breeding', sourceId: '123', sourceDetail: 'insemination', animalType: 'cattle',
  animalEarTag: 'FIXTURE-COW', animalName: '試験牛', memo: '応答待ち開始時の経費',
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
const farmA = { id: 'fixture-breeding-user', farmId: 'fixture-breeding-farm' };
const farmB = { id: 'fixture-other-user', farmId: 'fixture-other-farm' };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function useWebLocks() {
  const running = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: (name: string, optionsOrCallback: unknown, callback?: () => Promise<unknown>) => {
      const work = typeof optionsOrCallback === 'function' ? optionsOrCallback as () => Promise<unknown> : callback!;
      const result = (running.get(name) ?? Promise.resolve()).catch(() => undefined).then(work);
      running.set(name, result);
      return result;
    },
  } });
}
function holdBreedingPut() {
  const started = deferred<void>();
  const response = deferred<Response>();
  let payload: Record<string, unknown> = {};
  const requests: Array<{ path: string; method: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    const method = init?.method ?? 'GET';
    requests.push({ path, method });
    if (path.startsWith('/api/breedings/record-sync/') && method === 'PUT') {
      payload = JSON.parse(String(init?.body));
      started.resolve();
      return response.promise;
    }
    if (path.startsWith('/api/expenses/record-sync/')) {
      return Response.json({
        ...(init?.body ? JSON.parse(String(init.body)) : {}),
        id: decodeURIComponent(path.split('/').pop()!), cloudUpdatedAt: '2026-11-03T00:00:00.000Z',
      });
    }
    throw new Error(`Unexpected fixture request: ${method} ${path}`);
  }));
  return {
    started: started.promise, requests,
    release: () => response.resolve(Response.json({ ...payload, id: original.cloudRecordId, cloudUpdatedAt: '2026-11-03T00:00:00.000Z' })),
  };
}
function holdBreedingGet() {
  const started = deferred<void>();
  const response = deferred<Response>();
  vi.stubGlobal('fetch', vi.fn(async () => { started.resolve(); return response.promise; }));
  return { started: started.promise, release: (rows: unknown[]) => response.resolve(Response.json(rows)) };
}
function holdBreedingDelete() {
  const started = deferred<void>();
  const response = deferred<Response>();
  const requests: Array<{ path: string; method: string }> = [];
  let deleting = false;
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url);
    const method = init?.method ?? 'GET';
    requests.push({ path, method });
    if (path === `/api/breedings/${original.cloudRecordId}` && method === 'DELETE') {
      if (deleting) return new Response(null, { status: 404 });
      deleting = true; started.resolve(); return response.promise;
    }
    if (path === '/api/breedings/record-sync' && method === 'GET') return Response.json([]);
    if (path.startsWith('/api/expenses/record-sync/') && method === 'DELETE') return Response.json({});
    throw new Error(`Unexpected fixture request: ${method} ${path}`);
  }));
  return {
    started: started.promise, requests,
    release: () => response.resolve(Response.json({})),
    loseAck: () => response.reject(new TypeError('DELETE ACK lost')),
  };
}
async function read() { return getRecordById<LocalBreeding>('breedings', original.id); }
async function otherFarmFixtures() {
  const current = context.user;
  context.user = farmB;
  const breeding = await saveRecordPreservingTimestamps('breedings', { ...original, note: '切替先農場の繁殖', inseminationCost: '90000' });
  const expense = await saveRecordPreservingTimestamps('expenses', { ...originalExpense, amount: '90000', memo: '切替先農場の経費' });
  context.user = current;
  return { breeding, expense };
}
async function readFarm(user: typeof context.user) {
  const current = context.user;
  context.user = user;
  const breeding = await getAllRecords('breedings');
  const expenses = await getAllRecords('expenses');
  context.user = current;
  return { breeding, expenses };
}
function changeContext(change: string) {
  if (change === 'farm') { context.user = farmB; context.token = 'fixture-other-token'; }
  else if (change === 'token') context.token = 'fixture-replacement-token';
  else if (change === 'paid plan') context.planId = 'pro';
  else context.planId = 'free';
}

beforeEach(async () => {
  context.planId = 'standard'; context.token = 'fixture-breeding-token';
  window.localStorage.clear(); window.sessionStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  for (const user of [farmB, farmA]) {
    context.user = user;
    for (const store of ['breedings', 'expenses', 'masters', 'metadata', 'supplyInventory'] as const) await clearStore(store);
  }
  await saveRecordPreservingTimestamps('breedings', original);
  await saveRecordPreservingTimestamps('expenses', originalExpense);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks);
  else Reflect.deleteProperty(navigator, 'locks');
});

describe.each(['fallback', 'Web Locks'] as const)('breeding response races with %s', mode => {
  beforeEach(() => { if (mode === 'Web Locks') useWebLocks(); });

  it('does not overwrite a newer direct edit or its expense with a delayed PUT acknowledgement', async () => {
    const cloud = holdBreedingPut();
    const saving = updateBreeding(original.id, { ...initialInput, note: '古いPUT', inseminationCost: '20000' }).catch(error => error);
    await cloud.started;
    const newer = await saveRecordPreservingTimestamps('breedings', {
      ...(await read())!, note: '別 writer の新編集', inseminationCost: '30000', cloudSyncPending: true,
    });
    const newerExpense = await saveRecordPreservingTimestamps('expenses', { ...originalExpense, amount: '30000' });
    cloud.release();

    expect.soft(await saving).toBeInstanceOf(BreedingSyncConflictError);
    expect.soft(await read()).toEqual(newer);
    expect.soft(await getAllRecords('expenses')).toEqual([newerExpense]);
    expect(cloud.requests.filter(request => request.path.startsWith('/api/expenses/'))).toEqual([]);
  });

  it('does not resurrect a directly deleted breeding or recreate its expense after a delayed PUT', async () => {
    const cloud = holdBreedingPut();
    const saving = updateBreeding(original.id, { ...initialInput, note: '削除前のPUT', inseminationCost: '20000' }).catch(error => error);
    await cloud.started;
    await deleteRecord('breedings', original.id);
    await deleteRecord('expenses', originalExpense.id);
    cloud.release();

    expect.soft(await saving).toBeInstanceOf(BreedingSyncConflictError);
    expect.soft(await read()).toBeUndefined();
    expect.soft(await getAllRecords('expenses')).toEqual([]);
    expect(cloud.requests.filter(request => request.path.startsWith('/api/expenses/'))).toEqual([]);
  });

  it.each([
    { change: 'edit', response: 'existing row' },
    { change: 'edit', response: 'missing row' },
    { change: 'delete', response: 'existing row' },
    { change: 'create', response: 'missing row' },
  ])('keeps a direct local $change while a prior GET returns $response', async ({ change, response }) => {
    const cloud = holdBreedingGet();
    const loading = getBreedingList();
    await cloud.started;
    let expected: LocalBreeding[];
    if (change === 'delete') {
      await deleteRecord('breedings', original.id);
      expected = [];
    } else {
      const newer = await saveRecordPreservingTimestamps('breedings', {
        ...original,
        ...(change === 'create' ? { id: 'created-during-get', cloudRecordId: 'created-during-get-cloud', cowEarTag: 'FIXTURE-NEW-COW' } : {}),
        note: 'GET待ちに旧 writer が変更', cloudSyncPending: false,
      });
      expected = change === 'create' ? [original, newer] : [newer];
    }
    cloud.release(change === 'create' ? [{ ...original, id: original.cloudRecordId }] : response === 'existing row' ? [{
      ...original, id: original.cloudRecordId, note: 'GET開始時の古い内容', cloudUpdatedAt: '2026-11-03T00:00:00.000Z',
    }] : []);

    expect(await loading).toEqual(expected);
    expect(await getAllRecords('breedings')).toEqual(expected);
    expect(await getAllRecords('expenses')).toEqual([originalExpense]);
  });

  it.each(['farm', 'token', 'paid plan', 'Free plan'])('does not apply a delayed PUT or change any expense after the %s changes', async change => {
    const other = await otherFarmFixtures();
    const cloud = holdBreedingPut();
    const saving = updateBreeding(original.id, { ...initialInput, note: 'context変更前の保存', inseminationCost: '20000' }).catch(error => error);
    await cloud.started;
    const pending = await read();
    changeContext(change);
    cloud.release();

    expect(await saving).toBeInstanceOf(Error);
    expect(await readFarm(farmA)).toEqual({ breeding: [pending], expenses: [originalExpense] });
    expect(await readFarm(farmB)).toEqual({ breeding: [other.breeding], expenses: [other.expense] });
    expect(cloud.requests.filter(request => request.path.startsWith('/api/expenses/'))).toEqual([]);
  });

  it.each([
    { readName: 'list', load: getBreedingList },
    { readName: 'home summary', load: getBreedingListForHomeSummary },
  ])('does not return or persist a prior farm response when the farm changes during the $readName GET', async ({ load }) => {
    const other = await otherFarmFixtures();
    const cloud = holdBreedingGet();
    const loading = load().catch(error => error);
    await cloud.started;
    changeContext('farm');
    cloud.release([{ ...original, id: original.cloudRecordId, note: '切替前のクラウド', cloudUpdatedAt: '2026-11-03T00:00:00.000Z' }]);

    expect(await loading).toBeInstanceOf(Error);
    expect(await readFarm(farmA)).toEqual({ breeding: [original], expenses: [originalExpense] });
    expect(await readFarm(farmB)).toEqual({ breeding: [other.breeding], expenses: [other.expense] });
  });

  it.each(['token', 'paid plan', 'Free plan'])('does not apply a prior GET after the %s changes', async change => {
    const cloud = holdBreedingGet();
    const loading = getBreedingList().catch(error => error);
    await cloud.started;
    changeContext(change);
    cloud.release([{ ...original, id: original.cloudRecordId, note: 'context変更前のクラウド', cloudUpdatedAt: '2026-11-03T00:00:00.000Z' }]);

    expect(await loading).toBeInstanceOf(Error);
    expect(await read()).toEqual(original);
    expect(await getAllRecords('expenses')).toEqual([originalExpense]);
  });

  it('preserves advanced rows and numeric/string local keys while applying cloudRecordId matches', async () => {
    const second = await saveRecordPreservingTimestamps('breedings', {
      ...original, id: 'second-local-id', cloudRecordId: 456, cowEarTag: 'FIXTURE-SECOND-COW', note: '文字列ローカルID',
    });
    const advanced = await saveRecordPreservingTimestamps('breedings', {
      id: 'advanced-collision', recordKind: 'advanced', cowEarTag: 'FIXTURE-ADVANCED-COW', breedingType: '人工授精',
      serviceDate: '2026-11-02', memo: '高度繁殖原本', createdAt: original.createdAt, updatedAt: original.updatedAt,
    });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([
      { ...original, id: original.cloudRecordId, note: '通常繁殖のクラウド更新', cloudUpdatedAt: '2026-11-03T00:00:00.000Z' },
      { ...second, id: second.cloudRecordId, note: '数値クラウドIDの更新', cloudUpdatedAt: '2026-11-03T00:00:00.000Z' },
      { ...original, id: advanced.id, cowEarTag: 'FIXTURE-DIFFERENT-COW', note: '高度繁殖のキーと衝突', cloudUpdatedAt: '2026-11-03T00:00:00.000Z' },
    ])));

    const rows = await getBreedingList();

    expect(rows.map(row => row.id)).toEqual([original.id, second.id]);
    expect(await read()).toMatchObject({ id: 123, cloudRecordId: original.cloudRecordId, note: '通常繁殖のクラウド更新', cloudSyncPending: false });
    expect(await getRecordById('breedings', second.id)).toMatchObject({ id: second.id, cloudRecordId: 456, note: '数値クラウドIDの更新' });
    expect(await getRecordById('breedings', advanced.id)).toEqual(advanced);
    expect(await getAllRecords('breedings')).toHaveLength(3);
    expect(await getAllRecords('expenses')).toEqual([originalExpense]);
  });

  it('protects an edit made during DELETE without deleting its expense or removing it on the next GET', async () => {
    const cloud = holdBreedingDelete();
    const deleting = deleteBreeding(original.id).catch(error => error);
    await cloud.started;
    const newer = await saveRecordPreservingTimestamps('breedings', {
      ...original, note: 'DELETE中の旧 writer 編集', inseminationCost: '30000', cloudSyncPending: false,
    });
    const newerExpense = await saveRecordPreservingTimestamps('expenses', { ...originalExpense, amount: '30000' });
    cloud.release();

    expect(await deleting).toBeInstanceOf(BreedingSyncConflictError);
    expect(await read()).toEqual({ ...newer, cloudSyncPending: true, breedingSyncDeletePending: true });
    expect(await getBreedingList()).toEqual([{ ...newer, cloudSyncPending: true, breedingSyncDeletePending: true }]);
    expect(await getAllRecords('expenses')).toEqual([newerExpense]);
    expect(cloud.requests.filter(request => request.path.startsWith('/api/expenses/'))).toEqual([]);
  });

  it('rejects a queued edit after a successful DELETE without sending a PUT or recreating expenses', async () => {
    const cloud = holdBreedingDelete();
    const deleting = deleteBreeding(original.id);
    await cloud.started;
    const saving = updateBreeding(original.id, { ...initialInput, note: 'DELETE後に待機中の編集', inseminationCost: '20000' }).catch(error => error);
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    expect(await read()).toMatchObject({ note: original.note, cloudSyncPending: true });
    cloud.release();

    await deleting;
    expect(await saving).toEqual(expect.objectContaining({ message: expect.stringContaining('見つかりません') }));
    expect(await read()).toBeUndefined();
    expect(await getAllRecords('expenses')).toEqual([]);
    expect(cloud.requests.filter(request => request.method === 'PUT')).toEqual([]);
    expect(cloud.requests.filter(request => request.path.startsWith('/api/expenses/'))).toHaveLength(1);
  });

  it('keeps the breeding and expense after a lost DELETE ACK until an explicit retry completes both deletions', async () => {
    const cloud = holdBreedingDelete();
    const deleting = deleteBreeding(original.id).catch(error => error);
    await cloud.started;
    const saving = updateBreeding(original.id, { ...initialInput, note: 'ACK喪失後に待機中の編集', inseminationCost: '30000' }).catch(error => error);
    cloud.loseAck();

    expect(await deleting).toEqual(expect.objectContaining({ message: 'DELETE ACK lost' }));
    expect(await saving).toBeInstanceOf(BreedingSyncConflictError);
    expect(await read()).toEqual({ ...original, cloudSyncPending: true, breedingSyncDeletePending: true });
    expect(await getBreedingList()).toEqual([{ ...original, cloudSyncPending: true, breedingSyncDeletePending: true }]);
    expect(await getAllRecords('expenses')).toEqual([originalExpense]);
    expect(cloud.requests.filter(request => request.path.startsWith('/api/expenses/'))).toEqual([]);
    expect(cloud.requests.filter(request => request.method === 'PUT')).toEqual([]);

    await deleteBreeding(original.id);

    expect(await read()).toBeUndefined();
    expect(await getAllRecords('expenses')).toEqual([]);
    expect(cloud.requests.filter(request => request.path.startsWith('/api/expenses/'))).toHaveLength(1);
    expect(cloud.requests.filter(request => request.path === `/api/breedings/${original.cloudRecordId}`)).toHaveLength(2);
  });

  it('protects an unmarked edit made during confirmed expense cleanup from a later missing-row GET', async () => {
    const expenseStarted = deferred<void>();
    const expenseResponse = deferred<Response>();
    const requests: Array<{ path: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      requests.push({ path, method });
      if (path === `/api/breedings/${original.cloudRecordId}` && method === 'DELETE') return Response.json({});
      if (path.startsWith('/api/expenses/record-sync/') && method === 'DELETE') {
        expenseStarted.resolve(); return expenseResponse.promise;
      }
      if (path === '/api/breedings/record-sync' && method === 'GET') return Response.json([]);
      throw new Error(`Unexpected fixture request: ${method} ${path}`);
    }));
    const deleting = deleteBreeding(original.id).catch(error => error);
    await expenseStarted.promise;
    // This old writer knows neither pending marker and writes its own snapshot.
    const newer = await saveRecordPreservingTimestamps('breedings', { ...original, note: '経費の削除待ち中の旧 writer 編集' });
    const saving = updateBreeding(original.id, { ...initialInput, note: '削除途中に待機した編集' }).catch(error => error);
    expenseResponse.resolve(Response.json({}));

    expect(await deleting).toBeInstanceOf(BreedingSyncConflictError);
    expect(await saving).toBeInstanceOf(BreedingSyncConflictError);
    const protectedRecord = { ...newer, cloudSyncPending: true, breedingSyncDeletePending: true };
    expect(await read()).toEqual(protectedRecord);
    expect(await getBreedingList()).toEqual([protectedRecord]);
    // A confirmed expense deletion stays complete; the remaining source can be
    // explicitly deleted again, while an old queued edit cannot recreate either.
    expect(await getAllRecords('expenses')).toEqual([]);
    expect(requests.filter(request => request.method === 'PUT')).toEqual([]);
    await deleteBreeding(original.id);
    expect(await read()).toBeUndefined();
  });

  it('times out a GET body, releases the farm lock and ignores the late response after the next read', async () => {
    const bodyStarted = deferred<void>();
    const body = deferred<unknown>();
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce(async () => {
        const response = Response.json([]);
        vi.spyOn(response, 'json').mockImplementation(() => { bodyStarted.resolve(); return body.promise; });
        return response;
      })
      .mockImplementation(async () => Response.json([{
        ...original, id: original.cloudRecordId, note: '復帰後のGET', cloudUpdatedAt: '2026-11-04T00:00:00.000Z',
      }])));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const loading = getBreedingList();
    await bodyStarted.promise;
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    await vi.advanceTimersByTimeAsync(12000);

    expect(await loading).toEqual([original]);
    expect(signal.aborted).toBe(true);
    expect(await getBreedingList()).toEqual([expect.objectContaining({ id: original.id, note: '復帰後のGET' })]);
    const latest = await read();
    body.resolve([{ ...original, id: original.cloudRecordId, note: '時間切れの古いGET', cloudUpdatedAt: '2026-11-03T00:00:00.000Z' }]);
    await vi.advanceTimersByTimeAsync(0);

    expect(await read()).toEqual(latest);
    expect(await getAllRecords('expenses')).toEqual([originalExpense]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('times out a PUT body without changing expenses and releases the farm lock for a later save', async () => {
    const bodyStarted = deferred<void>();
    const body = deferred<unknown>();
    vi.stubGlobal('fetch', vi.fn()
      .mockImplementationOnce(async () => {
        const response = Response.json({});
        vi.spyOn(response, 'json').mockImplementation(() => { bodyStarted.resolve(); return body.promise; });
        return response;
      })
      .mockImplementation(async (url: RequestInfo | URL, init?: RequestInit) => Response.json({
        ...JSON.parse(String(init?.body)), id: decodeURIComponent(String(url).split('/').pop()!), cloudUpdatedAt: '2026-11-04T00:00:00.000Z',
      })));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const saving = updateBreeding(original.id, { ...initialInput, note: 'PUT body 応答待ち', inseminationCost: '20000' }).catch(error => error);
    await bodyStarted.promise;
    const pending = await read();
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    await vi.advanceTimersByTimeAsync(12000);

    expect(await saving).toEqual(expect.objectContaining({ message: expect.stringContaining('時間切れ') }));
    expect(signal.aborted).toBe(true);
    expect(await read()).toEqual(pending);
    expect(await getAllRecords('expenses')).toEqual([originalExpense]);

    await updateBreeding(original.id, { ...initialInput, note: '復帰後の正式編集', inseminationCost: '30000' });
    const latest = await read();
    const expenses = await getAllRecords<ExpenseRecord>('expenses');
    expect(latest).toMatchObject({ note: '復帰後の正式編集', cloudSyncPending: false });
    expect(expenses).toEqual([expect.objectContaining({ id: originalExpense.id, amount: '30000' })]);
    body.resolve({ ...pending, id: original.cloudRecordId, cloudUpdatedAt: '2026-11-03T00:00:00.000Z' });
    await vi.advanceTimersByTimeAsync(0);

    expect(await read()).toEqual(latest);
    expect(await getAllRecords('expenses')).toEqual(expenses);
  });
});

it('imports two distinct cloud IDs with the same cow and dates but different bulls into an empty device', async () => {
  await clearStore('breedings');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([
    { ...original, id: 'cloud-bull-a', bullName: '種雄牛A' },
    { ...original, id: 'cloud-bull-b', bullName: '種雄牛B' },
  ])));

  const rows = await getBreedingList();

  expect(rows.map(row => ({ id: row.id, bullName: row.bullName }))).toEqual([
    { id: 'cloud-bull-a', bullName: '種雄牛A' }, { id: 'cloud-bull-b', bullName: '種雄牛B' },
  ]);
  expect(await getAllRecords('breedings')).toHaveLength(2);
});
