import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as repository from '../storage/repository';
import {
  canRetryUnsentExpensesOnPage, createExpense, deleteExpense, EXPENSE_SYNC_STATUS_EVENT,
  getExpensesList, retryUnsentExpenses, type ExpenseInput, type ExpenseRecord,
} from './expensesApi';

const environment = vi.hoisted(() => ({
  planId: 'standard',
  token: 'fixture-expense-token' as string | null,
  user: { id: 'fixture-expense-user', farmId: 'fixture-expense-retry-farm', plan: 'standard' } as
    { id: string; farmId: string; plan: string } | null,
}));

vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => environment.planId }));
vi.mock('../plans/policy', () => ({
  getFarmProPlan: () => ({ multiDeviceSync: environment.planId !== 'free' }),
}));
vi.mock('./authClient', () => ({
  getAuthToken: () => environment.token,
  getStoredAuthUser: () => environment.user,
}));

const farmId = 'fixture-expense-retry-farm';
const userId = 'fixture-expense-user';
const ownerKey = `farmpro.expenseRetryOwner.${encodeURIComponent(farmId)}`;
const listPath = '/api/expenses/record-sync';
const cloudTime = '2026-11-01T12:00:00.000Z';
const transferFee: ExpenseInput = {
  paymentDate: '2026-11-01', category: '種付け・繁殖費', description: '移植料',
  vendor: '試験移植師', amount: '10000', paymentMethod: '現金', target: '試験牛',
  animalType: 'cattle', animalEarTag: 'FIXTURE-COW', animalName: '試験牛',
  sourceType: 'breeding', sourceId: 'fixture-et-record', sourceDetail: 'transfer-procedure',
  memo: '自動テスト用のET移植料',
};

type LocalExpense = ExpenseRecord & {
  cloudUpdatedAt?: string;
  deletedAt?: string;
  expenseRetryOrigin?: { version: number; farmId: string; userId: string; ownerId: string };
  [key: string]: unknown;
};
type CloudExpense = LocalExpense & { cloudUpdatedAt: string };
type Request = { path: string; method: string; headers: Headers; record?: LocalExpense; signal?: AbortSignal | null };
type ContextChange = 'farm' | 'user' | 'token' | 'owner' | 'plan' | 'route';

let cloud: Map<string, CloudExpense>;
let requests: Request[];
let online: boolean;
let handler: ((request: Request) => Response | undefined | Promise<Response | undefined>) | undefined;

function resetContext() {
  environment.planId = 'standard';
  environment.token = 'fixture-expense-token';
  environment.user = { id: userId, farmId, plan: 'standard' };
  window.history.replaceState(null, '', '/expenses');
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function cloudId(record: LocalExpense): string { return record.syncRecordId || `expense:${record.id}`; }
function putRequests(): Request[] { return requests.filter(request => request.method === 'PUT'); }
function queueId(record: LocalExpense): string { return `supply-linked-sync:expenses:${encodeURIComponent(cloudId(record))}`; }

function cloudCopy(record: LocalExpense, changes: Partial<LocalExpense> = {}): CloudExpense {
  const { expenseRetryOrigin: _origin, ...content } = record;
  return { ...content, id: cloudId(record), cloudUpdatedAt: cloudTime, ...changes };
}

function serve(request: Request): Response {
  if (request.method === 'GET' && request.path === listPath) return json([...cloud.values()]);
  if (request.method === 'PUT' && request.path.startsWith(`${listPath}/`) && request.record) {
    const id = decodeURIComponent(request.path.slice(listPath.length + 1));
    if (request.headers.get('If-None-Match') === '*' && cloud.has(id)) {
      return json({ message: 'fixture: expense already exists' }, 412);
    }
    const saved = { ...request.record, id, cloudUpdatedAt: cloudTime };
    cloud.set(id, saved);
    return json(saved);
  }
  throw new Error(`Unexpected fixture request: ${request.method} ${request.path}`);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

async function read(id: string): Promise<LocalExpense | undefined> {
  return repository.getRecordById<LocalExpense>('expenses', id);
}

async function pendingFee(): Promise<LocalExpense> {
  online = false;
  const saved = await createExpense(transferFee);
  const local = await read(saved.id);
  expect(local).toMatchObject({ id: saved.id, cloudSyncPending: true });
  return local!;
}

async function changeContext(kind: ContextChange, record: LocalExpense): Promise<LocalExpense | undefined> {
  if (kind === 'farm') {
    environment.user = { id: 'other-user', farmId: 'other-fixture-farm', plan: 'standard' };
    await repository.clearStore('expenses');
    const other = { ...record, amount: '777', memo: '別農場で保護する同じIDの経費' };
    await repository.saveRecordPreservingTimestamps('expenses', other);
    return other;
  }
  if (kind === 'user') environment.user = { ...environment.user!, id: 'other-user' };
  if (kind === 'token') environment.token = 'changed-token';
  if (kind === 'owner') window.localStorage.setItem(ownerKey, 'another-browser-owner');
  if (kind === 'plan') environment.planId = 'free';
  if (kind === 'route') window.history.replaceState(null, '', '/backups');
}

function restoreContext(record: LocalExpense) {
  resetContext();
  window.localStorage.setItem(ownerKey, record.expenseRetryOrigin!.ownerId);
}

beforeEach(async () => {
  resetContext();
  window.localStorage.clear();
  await repository.clearStore('expenses');
  await repository.clearStore('metadata');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  cloud = new Map();
  requests = [];
  online = false;
  handler = undefined;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: Request = {
      path: String(input), method: init?.method || 'GET', headers: new Headers(init?.headers), signal: init?.signal,
      ...(init?.body ? { record: JSON.parse(String(init.body)) as LocalExpense } : {}),
    };
    requests.push(request);
    if (!online) throw new TypeError('fixture: offline');
    return await handler?.(request) ?? serve(request);
  }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetContext();
});

describe('owned initial expense retry', () => {
  it('keeps list reads GET-only, then retries the original ET fee once with a create-only condition', async () => {
    online = true;
    await getExpensesList();
    expect(await retryUnsentExpenses()).toBe(0);
    expect(window.localStorage.getItem(ownerKey)).toBeNull();
    const formalSave = vi.spyOn(repository, 'saveRecord');
    const original = await pendingFee();
    const id = cloudId(original);
    expect(original.expenseRetryOrigin).toEqual({
      version: 1, farmId, userId, ownerId: window.localStorage.getItem(ownerKey),
    });
    expect(original.expenseRetryOrigin?.ownerId).toBeTruthy();
    expect(JSON.stringify(original.expenseRetryOrigin)).not.toContain('fixture-expense-token');
    expect(putRequests()).toHaveLength(1);
    expect(cloud.size).toBe(0);

    online = true;
    expect(await getExpensesList()).toEqual([original]);
    expect(await getExpensesList()).toEqual([original]);
    expect(putRequests()).toHaveLength(1);
    expect(await read(original.id)).toEqual(original);

    const notified = vi.fn();
    window.addEventListener(EXPENSE_SYNC_STATUS_EVENT, notified);
    try {
      expect(await retryUnsentExpenses()).toBe(1);
      expect(notified).toHaveBeenCalled();
      expect(await retryUnsentExpenses()).toBe(0);
    } finally {
      window.removeEventListener(EXPENSE_SYNC_STATUS_EVENT, notified);
    }
    expect(putRequests().map(request => request.record?.id)).toEqual([id, id]);
    expect(putRequests()[1].headers.get('If-None-Match')).toBe('*');
    expect(putRequests().every(request => !Object.prototype.hasOwnProperty.call(request.record, 'expenseRetryOrigin'))).toBe(true);
    expect([...cloud.keys()]).toEqual([id]);
    expect(cloud.size).toBe(1);
    const acknowledged = await read(original.id);
    expect(acknowledged).toMatchObject({
      ...transferFee, id: original.id, syncRecordId: id, cloudSyncPending: false,
      createdAt: original.createdAt, updatedAt: original.updatedAt,
    });
    expect(acknowledged).not.toHaveProperty('expenseRetryOrigin');
    expect(await repository.getAllRecords('expenses')).toEqual([acknowledged]);
    expect(formalSave).toHaveBeenCalledOnce();
  });

  it('acknowledges an identical cloud record after a lost initial PUT response without another PUT', async () => {
    online = true;
    let loseResponse = true;
    handler = request => {
      if (request.method === 'PUT' && loseResponse) {
        loseResponse = false;
        serve(request);
        throw new TypeError('fixture: successful PUT response was lost');
      }
      return undefined;
    };
    const saved = await createExpense(transferFee);
    const original = (await read(saved.id))!;
    expect(original.cloudSyncPending).toBe(true);
    expect(cloud.size).toBe(1);
    expect(await retryUnsentExpenses()).toBe(1);
    expect(putRequests()).toHaveLength(1);
    expect(await read(saved.id)).toMatchObject({ id: saved.id, cloudSyncPending: false, cloudUpdatedAt: cloudTime });
    expect(await read(saved.id)).not.toHaveProperty('expenseRetryOrigin');
    expect(await retryUnsentExpenses()).toBe(0);
    expect(cloud.size).toBe(1);
  });

  it.each([
    ['different amount', { amount: '20000' }],
    ['deleted record', { deletedAt: cloudTime }],
    ['settled record', { settlementSaleId: 'fixture-settlement' }],
    ['blank payment method', { paymentMethod: '' }],
    ['different saved timestamp', { updatedAt: '2026-11-01T12:05:00.000Z' }],
    ['unknown business field', { externalCostMemo: '別端末で追加した情報' }],
  ] as const)('holds a %s at the same cloud ID without changing either copy', async (_label, changes) => {
    const original = await pendingFee();
    const remote = cloudCopy(original, changes);
    cloud.set(remote.id, remote);
    requests = [];
    online = true;

    expect(await retryUnsentExpenses()).toBe(0);

    expect(putRequests()).toHaveLength(0);
    expect(await read(original.id)).toEqual(original);
    expect([...cloud.values()]).toEqual([remote]);
  });

  it('holds a 412 if another save arrives after GET and never replaces that cloud record', async () => {
    const original = await pendingFee();
    const concurrent = cloudCopy(original, { amount: '33000', memo: 'GETの後に確定した別内容' });
    requests = [];
    online = true;
    handler = request => {
      if (request.method === 'PUT') cloud.set(concurrent.id, concurrent);
      return undefined;
    };

    expect(await retryUnsentExpenses()).toBe(0);
    expect(await retryUnsentExpenses()).toBe(0);

    expect(putRequests()).toHaveLength(1);
    expect(putRequests()[0].headers.get('If-None-Match')).toBe('*');
    expect(await read(original.id)).toEqual(original);
    expect([...cloud.values()]).toEqual([concurrent]);
  });
});

describe('retry ownership and route boundaries', () => {
  it.each([
    'legacy origin', 'foreign farm', 'foreign user', 'foreign browser', 'invalid origin',
    'missing owner', 'noncanonical ID', 'previous acknowledgement', 'local deletion', 'local settlement',
    'stock movement', 'stock purchase reference', 'foreign malformed stock queue',
  ])('does not upload an ineligible %s or create a new retry owner', async kind => {
    const original = await pendingFee();
    const record = structuredClone(original);
    if (kind === 'legacy origin') delete record.expenseRetryOrigin;
    if (kind === 'foreign farm') record.expenseRetryOrigin!.farmId = 'other-farm';
    if (kind === 'foreign user') record.expenseRetryOrigin!.userId = 'other-user';
    if (kind === 'foreign browser') record.expenseRetryOrigin!.ownerId = 'other-browser';
    if (kind === 'invalid origin') record.expenseRetryOrigin!.version = 2;
    if (kind === 'missing owner') window.localStorage.removeItem(ownerKey);
    if (kind === 'noncanonical ID') record.syncRecordId = 'different-cloud-record';
    if (kind === 'previous acknowledgement') record.cloudUpdatedAt = cloudTime;
    if (kind === 'local deletion') record.deletedAt = cloudTime;
    if (kind === 'local settlement') record.settlementSaleId = 'fixture-settlement';
    if (kind === 'stock movement') record.sourceSupplyMovementId = 'fixture-stock';
    if (kind === 'stock purchase reference') record.sourceSupplyPurchaseReference = 'fixture-invoice';
    if (kind === 'foreign malformed stock queue') {
      await repository.saveRecordPreservingTimestamps('metadata', {
        id: queueId(record), farmId: 'another-farm', ownerId: 'another-owner', malformed: true,
      });
    }
    await repository.saveRecordPreservingTimestamps('expenses', record);
    const metadata = await repository.getAllRecords('metadata');
    const owner = window.localStorage.getItem(ownerKey);
    requests = [];
    online = true;

    expect(await retryUnsentExpenses()).toBe(0);

    expect(putRequests()).toHaveLength(0);
    expect(await read(record.id)).toEqual(record);
    expect(await repository.getAllRecords('metadata')).toEqual(metadata);
    expect(window.localStorage.getItem(ownerKey)).toBe(owner);
    expect(cloud.size).toBe(0);
  });

  it.each(['Free', 'missing token', 'missing user'])('does not create retry provenance for a formal save with %s', async kind => {
    if (kind === 'Free') environment.planId = 'free';
    if (kind === 'missing token') environment.token = null;
    if (kind === 'missing user') environment.user = null;
    await repository.clearStore('expenses');
    const saved = await createExpense(transferFee);
    const original = await read(saved.id);
    expect(original?.expenseRetryOrigin).toBeUndefined();
    expect(window.localStorage.getItem(ownerKey)).toBeNull();
    requests = [];
    online = true;

    expect(await retryUnsentExpenses()).toBe(0);

    expect(requests).toEqual([]);
    expect(await read(saved.id)).toEqual(original);
    expect(window.localStorage.getItem(ownerKey)).toBeNull();
  });

  it('skips backup, device-receive and settlement pages while allowing ordinary management pages', async () => {
    const original = await pendingFee();
    requests = [];
    online = true;
    for (const path of ['/backup', '/backups', '/backups/history', '/device-sync', '/device-sync/receive',
      '/sales/fixture-sale/settlement', '/sales/fixture-sale/settlement/review']) {
      expect(canRetryUnsentExpensesOnPage(path)).toBe(false);
      window.history.replaceState(null, '', path);
      expect(await retryUnsentExpenses()).toBe(0);
    }
    for (const path of ['/', '/expenses', '/breedings', '/treatments']) {
      expect(canRetryUnsentExpensesOnPage(path)).toBe(true);
    }
    expect(requests).toEqual([]);
    expect(await read(original.id)).toEqual(original);
  });
});

describe('retry races keep the current local record', () => {
  it.each(['farm', 'user', 'token', 'owner', 'plan', 'route'] as const)(
    'does not upload or acknowledge after %s changes during GET', async kind => {
      const original = await pendingFee();
      const started = deferred<void>();
      const release = deferred<void>();
      requests = [];
      online = true;
      handler = async request => {
        if (request.method !== 'GET') return;
        const response = serve(request);
        started.resolve();
        await release.promise;
        return response;
      };
      const retrying = retryUnsentExpenses();
      await started.promise;
      const other = await changeContext(kind, original);
      release.resolve();
      await retrying;

      expect(putRequests()).toHaveLength(0);
      expect(cloud.size).toBe(0);
      if (other) expect(await read(original.id)).toEqual(other);
      restoreContext(original);
      expect(await read(original.id)).toEqual(original);
    },
  );

  it.each(['farm', 'token', 'route'] as const)(
    'does not apply a delayed PUT acknowledgement after %s changes', async kind => {
      const original = await pendingFee();
      const started = deferred<void>();
      const release = deferred<void>();
      requests = [];
      online = true;
      handler = async request => {
        if (request.method !== 'PUT') return;
        const response = serve(request);
        started.resolve();
        await release.promise;
        return response;
      };
      const retrying = retryUnsentExpenses();
      await started.promise;
      const other = await changeContext(kind, original);
      release.resolve();
      await retrying;

      expect(putRequests()).toHaveLength(1);
      expect([...cloud.keys()]).toEqual([cloudId(original)]);
      if (other) expect(await read(original.id)).toEqual(other);
      restoreContext(original);
      expect(await read(original.id)).toEqual(original);
    },
  );

  it.each(['edit', 'deletion', 'linked queue'] as const)(
    'does not acknowledge over a local %s made while the PUT response is delayed', async kind => {
      const original = await pendingFee();
      const started = deferred<void>();
      const release = deferred<void>();
      requests = [];
      online = true;
      handler = async request => {
        if (request.method !== 'PUT') return;
        const response = serve(request);
        started.resolve();
        await release.promise;
        return response;
      };
      const retrying = retryUnsentExpenses();
      await started.promise;
      let expected: LocalExpense | undefined = original;
      if (kind === 'edit') {
        expected = { ...original, amount: '15000', memo: '応答待ちの間に保存した現行内容', updatedAt: '2026-11-01T12:01:00.000Z' };
        await repository.saveRecordPreservingTimestamps('expenses', expected);
      } else if (kind === 'deletion') {
        await repository.deleteRecord('expenses', original.id);
        expected = undefined;
      } else {
        await repository.saveRecordPreservingTimestamps('metadata', { id: queueId(original), foreign: true });
      }
      release.resolve();
      expect(await retrying).toBe(0);

      expect(await read(original.id)).toEqual(expected);
      expect(cloud.get(cloudId(original))).toMatchObject({ amount: original.amount, memo: original.memo });
      expect(await retryUnsentExpenses()).toBe(0);
      expect(putRequests()).toHaveLength(1);
      expect(await read(original.id)).toEqual(expected);
    },
  );

  it('coalesces simultaneous reconnect triggers into one GET and one conditional PUT', async () => {
    const original = await pendingFee();
    const started = deferred<void>();
    const release = deferred<void>();
    requests = [];
    online = true;
    handler = async request => {
      if (request.method !== 'GET') return;
      const response = serve(request);
      started.resolve();
      await release.promise;
      return response;
    };
    const first = retryUnsentExpenses();
    await started.promise;
    const second = retryUnsentExpenses();
    release.resolve();
    expect(await Promise.all([first, second])).toEqual([1, 1]);

    expect(requests.filter(request => request.method === 'GET')).toHaveLength(1);
    expect(putRequests()).toHaveLength(1);
    expect(putRequests()[0].headers.get('If-None-Match')).toBe('*');
    expect(cloud.size).toBe(1);
    expect(await repository.getAllRecords('expenses')).toEqual([
      expect.objectContaining({ id: original.id, cloudSyncPending: false }),
    ]);
  });

  it('preserves a reconnect request arriving during an earlier GET that later fails', async () => {
    const original = await pendingFee();
    const started = deferred<void>();
    const release = deferred<void>();
    let firstGet = true;
    requests = [];
    online = true;
    handler = async request => {
      if (request.method === 'GET' && firstGet) {
        firstGet = false;
        started.resolve();
        await release.promise;
        throw new TypeError('fixture: old GET fails after the reconnect event');
      }
      return undefined;
    };

    const initial = retryUnsentExpenses();
    await started.promise;
    const reconnected = retryUnsentExpenses();
    release.resolve();
    await Promise.all([initial, reconnected]);

    expect(requests.filter(request => request.method === 'GET')).toHaveLength(2);
    expect(putRequests()).toHaveLength(1);
    expect(putRequests()[0].headers.get('If-None-Match')).toBe('*');
    expect([...cloud.keys()]).toEqual([cloudId(original)]);
    expect(await read(original.id)).toMatchObject({ id: original.id, cloudSyncPending: false });
    expect(await read(original.id)).not.toHaveProperty('expenseRetryOrigin');
    expect(await retryUnsentExpenses()).toBe(0);
    expect(requests.filter(request => request.method === 'GET')).toHaveLength(2);
    expect(putRequests()).toHaveLength(1);
  });

  it('keeps an unsent expense and its retry origin when its formal DELETE fails', async () => {
    const original = await pendingFee();
    requests = [];
    online = true;
    handler = request => request.method === 'DELETE'
      ? json({ message: 'fixture: deletion unavailable' }, 503) : undefined;

    await expect(deleteExpense(original.id)).rejects.toThrow('fixture: deletion unavailable');

    expect(await read(original.id)).toEqual(original);
    expect(requests.map(request => request.method)).toEqual(['DELETE']);
    expect(cloud.size).toBe(0);
    expect(await getExpensesList()).toEqual([original]);
    expect(putRequests()).toHaveLength(0);
  });

  it('times out a stuck retry, retains the pending record and releases the lock for later reads and retries', async () => {
    const original = await pendingFee();
    const started = deferred<void>();
    requests = [];
    online = true;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    handler = request => new Promise<Response>((_resolve, reject) => {
      request.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      started.resolve();
    });

    const retrying = retryUnsentExpenses();
    await started.promise;
    await vi.advanceTimersByTimeAsync(12000);
    expect(await retrying).toBe(0);
    vi.useRealTimers();
    handler = undefined;

    expect(await read(original.id)).toEqual(original);
    expect(await getExpensesList()).toEqual([original]);
    expect(putRequests()).toHaveLength(0);
    expect(await retryUnsentExpenses()).toBe(1);
    expect(await read(original.id)).toMatchObject({ id: original.id, cloudSyncPending: false });
    expect(cloud.size).toBe(1);
  });
});
