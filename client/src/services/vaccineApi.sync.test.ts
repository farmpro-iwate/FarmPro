import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as repository from '../storage/repository';
import type { Vaccine, VaccineInput } from '../types/vaccine';
import type { ExpenseRecord } from './expensesApi';
import { createVaccine, deleteVaccine, getVaccineList, updateVaccine, VaccineExpenseCleanupError, VaccineSyncConflictError } from './vaccineApi';
import * as vaccineApi from './vaccineApi';

const environment = vi.hoisted(() => ({
  planId: 'standard',
  token: 'fixture-vaccine-token' as string | null,
  user: { id: 'fixture-vaccine-user', farmId: 'fixture-vaccine-farm', plan: 'standard' },
  deleteExpenseBySource: vi.fn(),
  deleteExpense: vi.fn(),
}));

vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => environment.planId }));
vi.mock('../plans/policy', () => ({
  getFarmProPlan: () => ({ multiDeviceSync: environment.planId !== 'free' }),
}));
vi.mock('./authClient', () => ({
  getAuthToken: () => environment.token,
  getStoredAuthUser: () => environment.user,
}));
vi.mock('./expensesApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('./expensesApi')>(),
  deleteExpenseBySource: environment.deleteExpenseBySource,
  deleteExpense: environment.deleteExpense,
}));

type SyncedVaccine = Vaccine & {
  syncRecordId: string;
  cloudUpdatedAt: string;
  cloudSyncPending: boolean;
  deletedAt?: string;
  syncWarning?: string;
  vaccineSyncOrigin?: { version: 1; farmId: string; userId: string; ownerId: string };
  vaccineSyncDeletePending?: boolean;
};

const original: SyncedVaccine = {
  id: 123, syncRecordId: 'vaccine:123', cloudSyncPending: false,
  cloudUpdatedAt: '2026-11-01T00:00:00.000Z',
  targetType: '成牛', targetNumber: 'FIXTURE-COW', targetName: '試験牛',
  vaccineName: '試験ワクチン', vaccineCost: '1200', vaccinationDate: '2026-11-01',
  nextDueDate: '2027-11-01', status: '接種済', note: '自動テスト専用記録',
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};

const originalExpense: ExpenseRecord = {
  id: 'fixture-vaccine-expense', paymentDate: '2026-11-01', category: '医薬品費',
  description: '試験ワクチン', vendor: '', amount: '1200', paymentMethod: '',
  target: '試験牛', memo: '', sourceType: 'vaccine', sourceId: String(original.id),
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};
const originalLocks = Object.getOwnPropertyDescriptor(navigator, 'locks');
type CloudVaccine = Omit<SyncedVaccine, 'id'> & { id: string };
type Request = {
  path: string; method: string; record?: CloudVaccine; signal?: AbortSignal | null;
  ifMatch: string | null; ifNoneMatch: string | null;
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function input(changes: Partial<VaccineInput> = {}): VaccineInput {
  return {
    targetType: original.targetType, targetNumber: original.targetNumber, targetName: original.targetName,
    vaccineName: original.vaccineName, vaccineCost: original.vaccineCost || '',
    vaccinationDate: original.vaccinationDate, nextDueDate: original.nextDueDate,
    status: original.status, note: original.note, ...changes,
  };
}

function useWebLocks() {
  const running = new Map<string, Promise<unknown>>();
  const request = vi.fn((name: string, callback: () => Promise<unknown>) => {
    const work = (running.get(name) ?? Promise.resolve()).catch(() => undefined).then(callback);
    running.set(name, work);
    return work;
  });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
  return request;
}

function useCloud() {
  let revision = 0;
  const server = {
    records: new Map<string, CloudVaccine>([[original.syncRecordId, { ...original, id: original.syncRecordId }]]),
    expenses: [] as ExpenseRecord[],
    requests: [] as Request[],
    handler: undefined as undefined | ((request: Request) => Promise<Response | undefined> | Response | undefined),
    serve(request: Request): Response {
      if (request.path === '/api/expenses/record-sync' && request.method === 'GET') return json(server.expenses.map(record => ({
        ...record, id: record.syncRecordId || (record.id.startsWith('expense:') ? record.id : `expense:${record.id}`),
        cloudUpdatedAt: '2026-11-01T02:00:00.000Z',
      })));
      if (request.path === '/api/vaccines/record-sync' && request.method === 'GET') return json([...server.records.values()]);
      const id = decodeURIComponent(request.path.slice('/api/vaccines/record-sync/'.length));
      const previous = server.records.get(id);
      if (request.method === 'GET') return previous ? json(previous) : json({ message: '記録が見つかりません' }, 404);
      if (request.method === 'PUT' || request.method === 'DELETE') {
        if (previous?.deletedAt) {
          return request.method === 'DELETE' ? json(previous) : json({ message: 'ワクチン記録は削除済みです' }, 409);
        }
        if ((request.ifNoneMatch === '*' && previous) ||
            (request.ifMatch !== null && request.ifMatch.replace(/^"|"$/g, '') !== previous?.cloudUpdatedAt)) {
          return json({ message: '別端末でワクチン記録が変更されています' }, 412);
        }
        const time = new Date(Math.max(Date.parse(previous?.cloudUpdatedAt || '') || 0,
          Date.parse('2026-11-01T01:00:00.000Z') + ++revision * 1000) + 1).toISOString();
        const business = { ...request.record } as Record<string, unknown>;
        for (const key of Object.keys(business)) {
          if (key === 'syncWarning' || key.startsWith('cloudSync') || key.startsWith('vaccineSync')) delete business[key];
        }
        const saved = { ...previous, ...business, id, cloudUpdatedAt: time,
          deletedAt: request.method === 'DELETE' ? time : request.record?.deletedAt ?? previous?.deletedAt } as CloudVaccine;
        server.records.set(id, saved);
        return json(saved);
      }
      throw new Error(`Unexpected fixture request: ${request.method} ${request.path}`);
    },
  };
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const request: Request = { path: String(url), method: init?.method || 'GET', signal: init?.signal,
      ifMatch: headers.get('If-Match'), ifNoneMatch: headers.get('If-None-Match'),
      ...(init?.body ? { record: JSON.parse(String(init.body)) } : {}) };
    server.requests.push(request);
    return await server.handler?.(request) ?? server.serve(request);
  }));
  return server;
}

async function seed() { await repository.saveRecordPreservingTimestamps('vaccines', original); }
async function read() { return repository.getRecordById<SyncedVaccine>('vaccines', original.id); }

beforeEach(async () => {
  environment.planId = 'standard';
  environment.token = 'fixture-vaccine-token';
  environment.user = { id: 'fixture-vaccine-user', farmId: 'fixture-vaccine-farm', plan: 'standard' };
  window.localStorage.clear();
  window.history.replaceState(null, '', '/vaccines');
  await repository.clearStore('vaccines');
  await repository.clearStore('expenses');
  environment.deleteExpenseBySource.mockReset().mockResolvedValue(undefined);
  environment.deleteExpense.mockReset().mockImplementation((id: string) => repository.deleteRecord('expenses', id));
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalLocks) Object.defineProperty(navigator, 'locks', originalLocks);
  else Reflect.deleteProperty(navigator, 'locks');
});

describe('ordinary vaccine synchronization', () => {
  it('keeps a vaccine and its associated expense when cloud deletion fails, without disappearing and reappearing on reload', async () => {
    await seed();
    await repository.saveRecordPreservingTimestamps('expenses', originalExpense);
    const server = useCloud();
    server.expenses = [originalExpense];
    server.handler = request => {
      if (request.method === 'DELETE') throw new TypeError('fixture: connection unavailable');
      return undefined;
    };

    const error = await deleteVaccine(original.id).catch((cause: unknown) => cause);
    const immediatelyAfterDelete = await repository.getRecordById('vaccines', original.id);
    const firstReload = await getVaccineList();
    const secondReload = await getVaccineList();

    expect.soft(error).toBeInstanceOf(Error);
    const deletionPending = { ...original, vaccineSyncDeletePending: true };
    expect.soft(immediatelyAfterDelete).toEqual(deletionPending);
    expect.soft(environment.deleteExpense).not.toHaveBeenCalled();
    expect(firstReload).toEqual([deletionPending]);
    expect(secondReload).toEqual([deletionPending]);
    expect(await repository.getAllRecords('vaccines')).toEqual([deletionPending]);
    expect([...server.records.keys()]).toEqual([original.syncRecordId]);
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'GET', 'DELETE', 'GET', 'GET']);
    expect(await repository.getRecordById('expenses', originalExpense.id)).toMatchObject(originalExpense);
  });

  it('removes the vaccine and its expense after cloud success, and repeated tombstone reads keep it deleted', async () => {
    await seed();
    await repository.saveRecordPreservingTimestamps('expenses', originalExpense);
    const server = useCloud();
    server.expenses = [originalExpense];
    await deleteVaccine(original.id);
    expect(server.records.get(original.syncRecordId)?.deletedAt).toBeTruthy();
    expect(await read()).toBeUndefined();
    expect(await repository.getRecordById('expenses', originalExpense.id)).toBeUndefined();
    expect(await getVaccineList()).toEqual([]);
    expect(await getVaccineList()).toEqual([]);
    expect(environment.deleteExpense).toHaveBeenCalledExactlyOnceWith(originalExpense.id);
    expect(server.requests.filter(request => request.method === 'DELETE')).toHaveLength(1);
  });

  it('keeps the deletion pending after a lost DELETE response until an explicit retry removes the vaccine and its fee', async () => {
    await seed();
    await repository.saveRecordPreservingTimestamps('expenses', originalExpense);
    const server = useCloud();
    server.expenses = [originalExpense];
    server.handler = request => {
      if (request.method !== 'DELETE') return undefined;
      server.serve(request);
      throw new TypeError('fixture: DELETE response lost');
    };
    await expect(deleteVaccine(original.id)).rejects.toThrow('DELETE response lost');
    const deletionPending = { ...original, vaccineSyncDeletePending: true };
    const tombstone = structuredClone(server.records.get(original.syncRecordId)!);
    expect(await read()).toEqual(deletionPending);
    expect(await getVaccineList()).toEqual([deletionPending]);
    expect(await getVaccineList()).toEqual([deletionPending]);
    expect(vaccineApi.getVaccineSyncStatus(deletionPending)).toMatchObject({ pending: false, warning: expect.stringMatching(/もう一度削除/) });
    expect(await vaccineApi.retryPendingVaccineSync()).toBe(0);
    expect(environment.deleteExpense).not.toHaveBeenCalled();
    expect(await repository.getRecordById('expenses', originalExpense.id)).toMatchObject(originalExpense);

    server.handler = undefined;
    await deleteVaccine(original.id);

    expect(server.records.get(original.syncRecordId)).toEqual(tombstone);
    expect(await read()).toBeUndefined();
    expect(await repository.getRecordById('expenses', originalExpense.id)).toBeUndefined();
    expect(environment.deleteExpense).toHaveBeenCalledExactlyOnceWith(originalExpense.id);
    expect(await getVaccineList()).toEqual([]);
    expect(server.requests.filter(request => request.method === 'PUT')).toEqual([]);
  });

  it('rejects a new save by reading the tombstone after a lost DELETE response, without sending a resurrection PUT', async () => {
    await seed();
    const server = useCloud();
    server.handler = request => {
      if (request.method !== 'DELETE') return undefined;
      server.serve(request);
      throw new TypeError('fixture: DELETE response lost');
    };
    await expect(deleteVaccine(original.id)).rejects.toThrow('DELETE response lost');
    expect(await read()).toEqual({ ...original, vaccineSyncDeletePending: true });

    await expect(updateVaccine(original.id, input({ note: '応答喪失後の保存', vaccineCost: '2300' })))
      .rejects.toThrow('削除済み');
    expect(server.records.get(original.syncRecordId)?.deletedAt).toBeTruthy();
    expect(await read()).toMatchObject({ note: '応答喪失後の保存', vaccineCost: '2300', cloudSyncPending: true });
    expect((await read())?.vaccineSyncDeletePending).not.toBe(true);
    expect(environment.deleteExpense).not.toHaveBeenCalled();
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'GET', 'DELETE', 'GET']);
  });

  it('requires authentication for a paid deletion and preserves both records', async () => {
    await seed();
    await repository.saveRecordPreservingTimestamps('expenses', originalExpense);
    const server = useCloud();
    environment.token = null;
    await expect(deleteVaccine(original.id)).rejects.toThrow('ログイン');
    expect(await read()).toEqual(original);
    expect(environment.deleteExpense).not.toHaveBeenCalled();
    expect(server.requests).toEqual([]);
  });

  it('retains Free local deletion and treats an absent record as a no-op', async () => {
    await seed();
    await repository.saveRecordPreservingTimestamps('expenses', originalExpense);
    const server = useCloud();
    environment.planId = 'free';
    await deleteVaccine(original.id);
    expect(await read()).toBeUndefined();
    environment.planId = 'standard';
    await deleteVaccine(original.id);
    expect(environment.deleteExpense).toHaveBeenCalledOnce();
    expect(server.requests).toEqual([]);
  });

  it.each(['fallback', 'web-lock'] as const)('serializes a stale GET before DELETE with %s, so the old response cannot restore it', async mode => {
    await seed();
    if (mode === 'web-lock') useWebLocks();
    const server = useCloud();
    const response = deferred<Response>();
    let firstGet = true;
    server.handler = request => {
      if (request.method === 'GET' && firstGet) { firstGet = false; return response.promise; }
    };
    const listing = getVaccineList();
    await vi.waitFor(() => expect(server.requests).toHaveLength(1));
    const deletion = deleteVaccine(original.id);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(server.requests.map(request => request.method)).toEqual(['GET']);
    response.resolve(json([{ ...original, id: original.syncRecordId, cloudUpdatedAt: '2026-11-01T00:10:00.000Z' }]));
    await listing;
    await deletion;
    expect(await getVaccineList()).toEqual([]);
    expect(await getVaccineList()).toEqual([]);
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'GET', 'GET', 'DELETE', 'GET', 'GET']);
  });

  it('serializes a delayed save acknowledgement before DELETE and rejects a queued edit of the deleted row', async () => {
    await seed();
    const server = useCloud();
    const response = deferred<Response>();
    let savedResponse: Response | undefined;
    server.handler = request => {
      if (request.method === 'PUT') { savedResponse = server.serve(request); return response.promise; }
    };
    const saving = updateVaccine(original.id, input({ note: '削除前に保存中' }));
    await vi.waitFor(() => expect(savedResponse).toBeDefined());
    const deletion = deleteVaccine(original.id);
    const laterEdit = updateVaccine(original.id, input({ note: '削除後に送らない編集' })).catch(error => error);
    response.resolve(savedResponse!);
    await saving;
    await deletion;
    expect(await laterEdit).toBeInstanceOf(Error);
    expect(await read()).toBeUndefined();
    expect(await getVaccineList()).toEqual([]);
    expect(server.records.get(original.syncRecordId)?.deletedAt).toBeTruthy();
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'PUT', 'GET', 'GET', 'DELETE', 'GET']);
  });

  it('keeps the later of two queued formal edits after a delayed first PUT', async () => {
    await seed();
    const server = useCloud();
    const response = deferred<Response>();
    let firstResponse: Response | undefined;
    server.handler = request => {
      if (request.method === 'PUT' && !firstResponse) { firstResponse = server.serve(request); return response.promise; }
    };
    const first = updateVaccine(original.id, input({ note: '先の編集' }));
    await vi.waitFor(() => expect(firstResponse).toBeDefined());
    const second = updateVaccine(original.id, input({ note: '後の編集' }));
    response.resolve(firstResponse!);
    await first;
    await second;
    expect(await read()).toMatchObject({ note: '後の編集', cloudSyncPending: false });
    expect(server.records.get(original.syncRecordId)).toMatchObject({ note: '後の編集' });
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'PUT', 'GET', 'PUT']);
  });

  it.each(['edit', 'delete'] as const)('does not overwrite an out-of-lock local %s with a delayed PUT acknowledgement', async action => {
    await seed();
    const server = useCloud();
    const response = deferred<Response>();
    let savedResponse: Response | undefined;
    server.handler = request => {
      if (request.method === 'PUT') { savedResponse = server.serve(request); return response.promise; }
    };
    const saving = updateVaccine(original.id, input({ note: '送信中の古い編集' }));
    await vi.waitFor(() => expect(savedResponse).toBeDefined());
    const changed = { ...original, note: '後からの端末変更', cloudSyncPending: true };
    if (action === 'edit') await repository.saveRecordPreservingTimestamps('vaccines', changed);
    else await repository.deleteRecord('vaccines', original.id);
    response.resolve(savedResponse!);
    await expect(saving).rejects.toBeInstanceOf(VaccineSyncConflictError);
    expect(await read()).toEqual(action === 'edit' ? changed : undefined);
  });

  it.each(['GET', 'PUT', 'DELETE'] as const)('does not apply a delayed %s to a different farm', async method => {
    await seed();
    const server = useCloud();
    const response = deferred<Response>();
    let sent: Request | undefined;
    server.handler = request => { if (request.method === method) { sent = request; return response.promise; } };
    const action = method === 'GET' ? getVaccineList() : method === 'PUT'
      ? updateVaccine(original.id, input({ note: '旧農場で保存' })) : deleteVaccine(original.id);
    const outcome = action.catch(error => error);
    await vi.waitFor(() => expect(sent).toBeDefined());
    environment.user = { ...environment.user, id: 'other-user', farmId: 'other-vaccine-farm' };
    await repository.clearStore('vaccines');
    const other = { ...original, note: '別農場の同じIDを保持' };
    await repository.saveRecordPreservingTimestamps('vaccines', other);
    response.resolve(server.serve(sent!));
    expect(await outcome).toBeInstanceOf(Error);
    expect(await read()).toEqual(other);
    expect(environment.deleteExpense).not.toHaveBeenCalled();
    environment.user = { id: 'fixture-vaccine-user', farmId: 'fixture-vaccine-farm', plan: 'standard' };
    expect(await read()).toMatchObject(method === 'PUT' ? { id: original.id, cloudSyncPending: true } : original);
  });

  it.each(['user', 'token', 'plan'] as const)('keeps the original local record if %s changes during DELETE', async kind => {
    await seed();
    const server = useCloud();
    const response = deferred<Response>();
    let deletion: Request | undefined;
    server.handler = request => { if (request.method === 'DELETE') { deletion = request; return response.promise; } };
    const outcome = deleteVaccine(original.id).catch(error => error);
    await vi.waitFor(() => expect(deletion).toBeDefined());
    if (kind === 'user') environment.user = { ...environment.user, id: 'other-user' };
    if (kind === 'token') environment.token = 'other-token';
    if (kind === 'plan') environment.planId = 'free';
    response.resolve(server.serve(deletion!));
    expect(await outcome).toBeInstanceOf(Error);
    expect(await read()).toEqual({ ...original, vaccineSyncDeletePending: true });
    expect(environment.deleteExpense).not.toHaveBeenCalled();
  });

  it.each(['local', 'cloud'] as const)('refuses deletion before either record changes when the related expense is settled in %s', async where => {
    await seed();
    const server = useCloud();
    const settled = { ...originalExpense, settlementSaleId: 'fixture-settled-sale' };
    await repository.saveRecordPreservingTimestamps('expenses', where === 'local' ? settled : originalExpense);
    server.expenses = [settled];
    await expect(deleteVaccine(original.id)).rejects.toThrow('精算確定済み');
    expect(await read()).toEqual(original);
    expect(server.requests.every(request => request.method === 'GET')).toBe(true);
    expect(environment.deleteExpense).not.toHaveBeenCalled();
    expect(await repository.getRecordById('expenses', originalExpense.id)).toBeDefined();
  });

  it('preserves the vaccine when the cloud expense preflight fails', async () => {
    await seed();
    await repository.saveRecordPreservingTimestamps('expenses', originalExpense);
    const server = useCloud();
    server.handler = () => json({ message: 'fixture: unavailable' }, 503);
    await expect(deleteVaccine(original.id)).rejects.toThrow('精算状況を確認できませんでした');
    expect(await read()).toEqual(original);
    expect(environment.deleteExpense).not.toHaveBeenCalled();
    expect(server.requests.map(request => request.method)).toEqual(['GET']);
  });

  it('checks a settled related expense that has never been downloaded on this device before deleting the vaccine', async () => {
    await seed();
    const server = useCloud();
    server.expenses = [{ ...originalExpense, id: `expense:${originalExpense.id}`, settlementSaleId: 'fixture-remote-settlement' }];
    expect(await repository.getAllRecords('expenses')).toEqual([]);
    await expect(deleteVaccine(original.id)).rejects.toThrow('精算確定済み');
    expect(await read()).toEqual(original);
    expect(server.requests.map(request => request.method)).toEqual(['GET']);
    expect(environment.deleteExpense).not.toHaveBeenCalled();
  });

  it('downloads an unreceived related expense and cleans it up after the vaccine deletion succeeds', async () => {
    await seed();
    const server = useCloud();
    server.expenses = [{ ...originalExpense, id: `expense:${originalExpense.id}` }];
    expect(await repository.getAllRecords('expenses')).toEqual([]);
    await deleteVaccine(original.id);
    expect(await read()).toBeUndefined();
    expect(await repository.getAllRecords('expenses')).toEqual([]);
    expect(environment.deleteExpense).toHaveBeenCalledExactlyOnceWith(originalExpense.id);
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'GET', 'DELETE']);
  });

  it('reports a completed vaccine deletion separately when only expense cleanup fails', async () => {
    await seed();
    await repository.saveRecordPreservingTimestamps('expenses', originalExpense);
    const server = useCloud();
    server.expenses = [originalExpense];
    environment.deleteExpense.mockRejectedValue(new TypeError('fixture: expense offline'));
    await expect(deleteVaccine(original.id)).rejects.toBeInstanceOf(VaccineExpenseCleanupError);
    expect(await read()).toBeUndefined();
    expect(server.records.get(original.syncRecordId)?.deletedAt).toBeTruthy();
    expect(await repository.getRecordById('expenses', originalExpense.id)).toMatchObject(originalExpense);
    expect(await getVaccineList()).toEqual([]);
  });

  it('retains a newer local edit made while DELETE was in flight and does not clean up its expense', async () => {
    await seed();
    const server = useCloud();
    const response = deferred<Response>();
    let deletion: Request | undefined;
    server.handler = request => { if (request.method === 'DELETE') { deletion = request; return response.promise; } };
    const outcome = deleteVaccine(original.id).catch(error => error);
    await vi.waitFor(() => expect(deletion).toBeDefined());
    const changed = { ...original, note: '新しい端末変更', cloudSyncPending: true };
    await repository.saveRecordPreservingTimestamps('vaccines', changed);
    response.resolve(server.serve(deletion!));
    expect(await outcome).toBeInstanceOf(Error);
    expect(await read()).toEqual(changed);
    expect(environment.deleteExpense).not.toHaveBeenCalled();
    expect(await getVaccineList()).toEqual([changed]);
  });

  it('releases the operation lock after an aborted request while keeping the pending save', async () => {
    await seed();
    const server = useCloud();
    const waiting = deferred<void>();
    server.handler = request => {
      if (request.method !== 'PUT') return;
      waiting.resolve();
      return new Promise<Response>((_resolve, reject) => {
        request.signal!.addEventListener('abort', () => reject(new DOMException('fixture: aborted', 'AbortError')), { once: true });
      });
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const saving = updateVaccine(original.id, input({ note: '通信待ちの保存' }));
    await waiting.promise;
    await vi.advanceTimersByTimeAsync(12000);
    await saving;
    vi.useRealTimers();
    expect(await read()).toMatchObject({ note: '通信待ちの保存', cloudSyncPending: true });
    expect(await getVaccineList()).toMatchObject([{ note: '通信待ちの保存', cloudSyncPending: true }]);
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'PUT', 'GET']);
  });

  it('preserves the ordinary formal create and edit contents when an empty peer store pulls them', async () => {
    const server = useCloud();
    server.records.clear();
    const saved = await createVaccine(input({ note: '初回保存' }));
    await updateVaccine(saved.id, input({ note: '正式な編集', vaccineCost: '2300' }));
    await repository.clearStore('vaccines');
    expect(await getVaccineList()).toMatchObject([{ id: saved.id, note: '正式な編集', vaccineCost: '2300', cloudSyncPending: false }]);
    expect(server.records.size).toBe(1);
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'PUT', 'GET', 'PUT', 'GET']);
  });
});

describe('owned vaccine retry and conditional writes', () => {
  it('does not PUT a pending upload after its deletion failed, but allows a later formal edit to cancel that delete intent', async () => {
    const server = useCloud();
    server.records.clear();
    server.handler = () => { throw new TypeError('fixture: original upload offline'); };
    const saved = await createVaccine(input({ note: '未送信の新規記録' }));
    expect(await repository.getRecordById('vaccines', saved.id)).toMatchObject({ cloudSyncPending: true });
    server.handler = request => request.method === 'DELETE'
      ? json({ message: 'fixture: DELETE unavailable' }, 503) : undefined;
    await expect(deleteVaccine(saved.id)).rejects.toThrow('DELETE unavailable');
    const pending = await repository.getRecordById('vaccines', saved.id);
    expect(pending).toMatchObject({ cloudSyncPending: true, vaccineSyncDeletePending: true });
    expect(vaccineApi.getVaccineSyncStatus(pending as unknown as Vaccine)).toMatchObject({
      pending: false, warning: expect.stringMatching(/もう一度削除/),
    });
    server.handler = undefined;
    const start = server.requests.length;

    expect(await vaccineApi.retryPendingVaccineSync()).toBe(0);

    expect(server.requests.slice(start)).toEqual([]);
    expect(server.records.size).toBe(0);
    expect(await getVaccineList()).toEqual([pending]);
    expect(environment.deleteExpense).not.toHaveBeenCalled();

    await updateVaccine(saved.id, input({ note: '利用者が削除を取りやめ正式保存' }));

    const after = await repository.getRecordById('vaccines', saved.id);
    expect(after).toMatchObject({ cloudSyncPending: false, note: '利用者が削除を取りやめ正式保存' });
    expect(after?.vaccineSyncDeletePending).not.toBe(true);
    expect(server.records.get(`vaccine:${saved.id}`)?.note).toBe('利用者が削除を取りやめ正式保存');
  });

  it('retries the same offline save without changing its content, ID or formal-save timestamps', async () => {
    const server = useCloud();
    server.records.clear();
    server.handler = () => { throw new TypeError('fixture: offline'); };
    const saved = await createVaccine(input({ note: '再送しても保持する正式内容', vaccineCost: '' }));
    const pending = await repository.getRecordById<SyncedVaccine>('vaccines', saved.id);
    expect(pending).toMatchObject({ cloudSyncPending: true, vaccineSyncOrigin: {
      version: 1, farmId: environment.user.farmId, userId: environment.user.id, ownerId: expect.any(String),
    } });
    server.handler = undefined;

    expect(await vaccineApi.retryPendingVaccineSync()).toBe(1);
    expect(await vaccineApi.retryPendingVaccineSync()).toBe(0);

    expect(await repository.getRecordById('vaccines', saved.id)).toMatchObject({
      id: saved.id, note: '再送しても保持する正式内容', vaccineCost: '', cloudSyncPending: false,
      createdAt: pending?.createdAt, updatedAt: pending?.updatedAt,
    });
    expect(server.records.size).toBe(1);
    expect(server.requests.filter(request => request.method === 'PUT')).toMatchObject([
      { ifNoneMatch: '*', path: `/api/vaccines/record-sync/${encodeURIComponent(`vaccine:${saved.id}`)}` },
    ]);
  });

  it.each(['copied browser', 'other user', 'other farm', 'legacy pending'] as const)(
    'does not automatically send a pending row from %s', async scope => {
      const server = useCloud();
      server.records.clear();
      server.handler = () => { throw new TypeError('fixture: offline'); };
      const saved = await createVaccine(input({ note: '送信元を証明できない記録' }));
      let pending = await repository.getRecordById<SyncedVaccine>('vaccines', saved.id);
      expect(pending?.cloudSyncPending).toBe(true);
      if (scope === 'copied browser') window.localStorage.removeItem(`farmpro.vaccineSyncOwner.${encodeURIComponent(environment.user.farmId)}`);
      if (scope === 'other user') environment.user = { ...environment.user, id: 'different-user' };
      if (scope === 'other farm') {
        environment.user = { ...environment.user, farmId: 'different-farm' };
        await repository.saveRecordPreservingTimestamps('vaccines', pending!);
      }
      if (scope === 'legacy pending') {
        const { vaccineSyncOrigin: _origin, ...legacy } = pending!;
        pending = legacy;
        await repository.saveRecordPreservingTimestamps('vaccines', legacy);
      }
      server.handler = undefined;
      const start = server.requests.length;

      expect(await vaccineApi.retryPendingVaccineSync()).toBe(0);

      expect(server.requests.slice(start)).toEqual([]);
      expect(server.records.size).toBe(0);
      expect(await repository.getRecordById('vaccines', saved.id)).toEqual(pending);
    },
  );

  it('keeps a Free save local after upgrading and does not infer consent to replay it', async () => {
    const server = useCloud();
    server.records.clear();
    environment.planId = 'free';
    const saved = await createVaccine(input({ note: 'Freeで正式保存' }));
    const local = await repository.getRecordById('vaccines', saved.id);
    expect(local).toMatchObject({ cloudSyncPending: false });
    expect(local?.vaccineSyncOrigin).toBeUndefined();
    expect(await vaccineApi.retryPendingVaccineSync()).toBe(0);
    environment.planId = 'standard';

    expect(await vaccineApi.retryPendingVaccineSync()).toBe(0);
    expect(server.requests).toEqual([]);
    expect(await repository.getRecordById('vaccines', saved.id)).toEqual(local);
  });

  it('uses conditional PUT when the peer changes the record after preflight and preserves both conflicting contents', async () => {
    await seed();
    const server = useCloud();
    let raced = false;
    server.handler = request => {
      if (request.method !== 'GET' || !request.path.startsWith('/api/vaccines/record-sync/') || raced) return undefined;
      raced = true;
      const observed = server.serve(request);
      server.records.set(original.syncRecordId, {
        ...server.records.get(original.syncRecordId)!, note: '別端末が確認直後に保存', cloudUpdatedAt: '2026-11-01T03:00:00.000Z',
      });
      return observed;
    };

    await expect(updateVaccine(original.id, input({ note: 'この端末で保持する編集' })))
      .rejects.toBeInstanceOf(VaccineSyncConflictError);

    expect(server.records.get(original.syncRecordId)).toMatchObject({ note: '別端末が確認直後に保存' });
    expect(await read()).toMatchObject({ note: 'この端末で保持する編集', cloudSyncPending: true, syncWarning: expect.any(String) });
    expect(server.requests.filter(request => request.method === 'PUT')).toMatchObject([
      { ifMatch: JSON.stringify(original.cloudUpdatedAt) },
    ]);
    expect(environment.deleteExpense).not.toHaveBeenCalled();
  });

  it('recovers a lost acknowledgement by GET only and keeps the accepted server version unchanged', async () => {
    const server = useCloud();
    server.records.clear();
    server.handler = request => {
      if (request.method !== 'PUT') return undefined;
      server.serve(request);
      throw new TypeError('fixture: accepted PUT response lost');
    };
    const saved = await createVaccine(input({ note: '一度だけ受理した内容' }));
    const accepted = structuredClone(server.records.get(`vaccine:${saved.id}`));
    expect(await repository.getRecordById('vaccines', saved.id)).toMatchObject({ cloudSyncPending: true });
    server.handler = undefined;
    const start = server.requests.length;

    expect(await vaccineApi.retryPendingVaccineSync()).toBe(1);

    expect(server.requests.slice(start).map(request => request.method)).toEqual(['GET']);
    expect(server.records.get(`vaccine:${saved.id}`)).toEqual(accepted);
    expect(await repository.getRecordById('vaccines', saved.id)).toMatchObject({ cloudSyncPending: false });
  });

  it('uses an accepted earlier attempt as the conditional base for a later formal edit after response loss', async () => {
    const server = useCloud();
    server.records.clear();
    server.handler = request => {
      if (request.method !== 'PUT') return undefined;
      server.serve(request);
      throw new TypeError('fixture: first PUT accepted, response lost');
    };
    const saved = await createVaccine(input({ note: '受理済みだが未確認の初回保存' }));
    const firstAccepted = structuredClone(server.records.get(`vaccine:${saved.id}`)!);
    expect(await repository.getRecordById('vaccines', saved.id)).toMatchObject({ cloudSyncPending: true });
    server.handler = undefined;

    await updateVaccine(saved.id, input({ note: '応答喪失後の最新編集', vaccineCost: '4500' }));

    expect(await repository.getRecordById('vaccines', saved.id)).toMatchObject({
      note: '応答喪失後の最新編集', vaccineCost: '4500', cloudSyncPending: false,
    });
    expect(server.records.size).toBe(1);
    expect(server.records.get(`vaccine:${saved.id}`)).toMatchObject({ note: '応答喪失後の最新編集', vaccineCost: '4500' });
    expect(server.requests.filter(request => request.method === 'PUT')).toMatchObject([
      { ifNoneMatch: '*' }, { ifMatch: JSON.stringify(firstAccepted.cloudUpdatedAt) },
    ]);
  });

  it('retries a newer edit after recovering an earlier lost ACK even when the newer PUT failed before saving', async () => {
    await seed();
    const server = useCloud();
    let putCount = 0;
    server.handler = request => {
      if (request.method !== 'PUT') return undefined;
      putCount += 1;
      if (putCount === 1) {
        server.serve(request);
        throw new TypeError('fixture: B was accepted, acknowledgement lost');
      }
      if (putCount === 2) return json({ message: 'fixture: C was not saved' }, 503);
      return undefined;
    };
    await updateVaccine(original.id, input({ note: 'B：受理済みの変更' }));
    const acceptedB = structuredClone(server.records.get(original.syncRecordId)!);
    await updateVaccine(original.id, input({ note: 'C：次回再送すべき最新変更' }));
    expect(await read()).toMatchObject({ note: 'C：次回再送すべき最新変更', cloudSyncPending: true });
    expect(server.records.get(original.syncRecordId)).toEqual(acceptedB);

    expect(await vaccineApi.retryPendingVaccineSync()).toBe(1);

    expect(await read()).toMatchObject({ note: 'C：次回再送すべき最新変更', cloudSyncPending: false });
    expect(server.records.get(original.syncRecordId)?.note).toBe('C：次回再送すべき最新変更');
    expect(server.requests.filter(request => request.method === 'PUT')).toMatchObject([
      { ifMatch: JSON.stringify(original.cloudUpdatedAt) },
      { ifMatch: JSON.stringify(acceptedB.cloudUpdatedAt) },
      { ifMatch: JSON.stringify(acceptedB.cloudUpdatedAt) },
    ]);
  });

  it.each(['same content', 'different content'] as const)(
    'uses content evidence for a legacy read-time revision only with %s', async content => {
      const readTimeRevision = '2026-11-01T00:30:00.000Z';
      await repository.saveRecordPreservingTimestamps('vaccines', { ...original, cloudUpdatedAt: readTimeRevision });
      const server = useCloud();
      if (content === 'different content') server.records.get(original.syncRecordId)!.note = '別端末の独立した変更';
      const before = structuredClone(server.records.get(original.syncRecordId)!);

      const saving = updateVaccine(original.id, input({ note: '旧版からの正式編集' }));
      if (content === 'same content') {
        await saving;
        expect(await read()).toMatchObject({ note: '旧版からの正式編集', cloudSyncPending: false });
        expect(server.requests.filter(request => request.method === 'PUT')).toMatchObject([
          { ifMatch: JSON.stringify(original.cloudUpdatedAt) },
        ]);
      } else {
        await expect(saving).rejects.toBeInstanceOf(VaccineSyncConflictError);
        expect(await read()).toMatchObject({ note: '旧版からの正式編集', cloudSyncPending: true, syncWarning: expect.any(String) });
        expect(server.records.get(original.syncRecordId)).toEqual(before);
        expect(server.requests.every(request => request.method === 'GET')).toBe(true);
      }
    },
  );

  it('times out an unresolved GET body, releases the operation lock and retries the retained save later', async () => {
    await seed();
    const server = useCloud();
    const bodyStarted = deferred<void>();
    const body = deferred<unknown>();
    let stalled: Request | undefined;
    server.handler = request => {
      if (request.method !== 'GET' || !request.path.startsWith('/api/vaccines/record-sync/')) return undefined;
      stalled = request;
      const response = server.serve(request);
      vi.spyOn(response, 'json').mockImplementation(() => { bodyStarted.resolve(); return body.promise; });
      return response;
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const saving = updateVaccine(original.id, input({ note: 'JSON待ちでも端末に保持' }));
    await bodyStarted.promise;
    await vi.advanceTimersByTimeAsync(12000);
    await saving;
    vi.useRealTimers();
    expect(stalled?.signal?.aborted).toBe(true);
    expect(await read()).toMatchObject({ note: 'JSON待ちでも端末に保持', cloudSyncPending: true });
    expect(server.requests.filter(request => request.method === 'PUT')).toEqual([]);
    server.handler = undefined;

    expect(await vaccineApi.retryPendingVaccineSync()).toBe(1);

    expect(await read()).toMatchObject({ note: 'JSON待ちでも端末に保持', cloudSyncPending: false });
    expect(server.records.get(original.syncRecordId)?.note).toBe('JSON待ちでも端末に保持');
  });

  it.each(['edit', 'delete'] as const)('does not overwrite an old writer\'s unmarked %s with a GET that began earlier', async action => {
    await seed();
    const server = useCloud();
    server.records.set(original.syncRecordId, {
      ...server.records.get(original.syncRecordId)!, note: '到着待ちのクラウド内容', cloudUpdatedAt: '2026-11-03T00:00:00.000Z',
    });
    const response = deferred<Response>();
    let captured: Response | undefined;
    server.handler = request => {
      if (request.path !== '/api/vaccines/record-sync' || request.method !== 'GET') return undefined;
      captured = server.serve(request);
      return response.promise;
    };
    const loading = getVaccineList();
    await vi.waitFor(() => expect(captured).toBeDefined());
    const { cloudSyncPending: _pending, ...unmarked } = original;
    const changed = { ...unmarked, note: '旧タブの印なし編集を保持' };
    if (action === 'edit') await repository.saveRecordPreservingTimestamps('vaccines', changed);
    else await repository.deleteRecord('vaccines', original.id);
    response.resolve(captured!);

    expect(await loading).toEqual(action === 'edit' ? [changed] : []);
    expect(await read()).toEqual(action === 'edit' ? changed : undefined);
    expect(server.requests.map(request => request.method)).toEqual(['GET']);
  });

  it.each(['update', 'tombstone'] as const)('retains a Free edit after upgrading when a newer remote %s arrives', async action => {
    await seed();
    const server = useCloud();
    environment.planId = 'free';
    await updateVaccine(original.id, input({ note: 'Freeで保存した変更' }));
    const local = await read();
    expect(local).toMatchObject({ cloudSyncPending: false });
    expect(server.requests).toEqual([]);
    environment.planId = 'standard';
    const changedAt = '2026-11-04T00:00:00.000Z';
    server.records.set(original.syncRecordId, {
      ...server.records.get(original.syncRecordId)!, note: '別端末の内容', cloudUpdatedAt: changedAt,
      ...(action === 'tombstone' ? { deletedAt: changedAt } : {}),
    });
    const remote = structuredClone(server.records.get(original.syncRecordId)!);

    expect(await getVaccineList()).toEqual([local]);
    expect(await vaccineApi.retryPendingVaccineSync()).toBe(0);

    expect(await read()).toEqual(local);
    expect(server.records.get(original.syncRecordId)).toEqual(remote);
    expect(server.requests.map(request => request.method)).toEqual(['GET']);
  });

  it.each(['update', 'tombstone'] as const)('receives a peer %s after an exact acknowledgement even if the saving browser clock was ahead', async action => {
    await seed();
    const server = useCloud();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    await updateVaccine(original.id, input({ note: '時計が進んだ端末で受理済み' }));
    const acknowledged = await read();
    expect(acknowledged?.cloudSyncPending).toBe(false);
    expect(Date.parse(acknowledged!.updatedAt!)).toBeGreaterThan(Date.parse(acknowledged!.cloudUpdatedAt));
    vi.useRealTimers();
    const changedAt = '2026-11-04T00:00:00.000Z';
    server.records.set(original.syncRecordId, {
      ...server.records.get(original.syncRecordId)!, note: '別端末の新しい正式内容',
      updatedAt: changedAt, cloudUpdatedAt: changedAt,
      ...(action === 'tombstone' ? { deletedAt: changedAt } : {}),
    });

    const rows = await getVaccineList();

    if (action === 'tombstone') {
      expect(rows).toEqual([]);
      expect(await read()).toBeUndefined();
    } else {
      expect(rows).toMatchObject([{ note: '別端末の新しい正式内容', cloudSyncPending: false }]);
      expect(await read()).toMatchObject({ note: '別端末の新しい正式内容', cloudSyncPending: false });
    }
  });

  it.each([
    { field: 'vaccineCost', change: 'missing' },
    { field: 'vaccineCost', change: 'different' },
    { field: 'farmCustomCode', change: 'missing' },
    { field: 'farmCustomCode', change: 'different' },
  ] as const)('rejects a PUT acknowledgement with $change $field without losing local business content', async ({ field, change }) => {
    const source = { ...original, farmCustomCode: 'FARM-CUSTOM-KEEP' };
    await repository.saveRecordPreservingTimestamps('vaccines', source);
    const server = useCloud();
    server.records.set(original.syncRecordId, { ...source, id: original.syncRecordId });
    server.handler = async request => {
      if (request.method !== 'PUT') return undefined;
      const ack = await server.serve(request).json() as Record<string, unknown>;
      if (change === 'missing') delete ack[field];
      else ack[field] = field === 'vaccineCost' ? '9999' : 'UNEXPECTED-CODE';
      return json(ack);
    };

    await expect(updateVaccine(original.id, input({ note: '不一致応答でも原本を保持', vaccineCost: '4500' })))
      .rejects.toBeInstanceOf(VaccineSyncConflictError);

    expect(await read()).toMatchObject({
      note: '不一致応答でも原本を保持', vaccineCost: '4500', farmCustomCode: 'FARM-CUSTOM-KEEP',
      cloudSyncPending: true, syncWarning: expect.any(String),
    });
    expect(environment.deleteExpense).not.toHaveBeenCalled();
    server.handler = undefined;
    const beforeRetry = server.requests.length;
    expect(await vaccineApi.retryPendingVaccineSync()).toBe(0);
    expect(server.requests).toHaveLength(beforeRetry);
    expect(await read()).toMatchObject({ cloudSyncPending: true });

    // A formal re-save can finish the confirmation and let its form proceed to
    // the associated expense; automatic ACK must not conceal that unfinished step.
    await updateVaccine(original.id, input({ note: '不一致応答でも原本を保持', vaccineCost: '4500' }));
    expect(await read()).toMatchObject({
      note: '不一致応答でも原本を保持', vaccineCost: '4500', farmCustomCode: 'FARM-CUSTOM-KEEP', cloudSyncPending: false,
    });
  });

  it('does not overwrite a metadata-only local change with a delayed successful acknowledgement', async () => {
    await seed();
    const server = useCloud();
    const response = deferred<Response>();
    let accepted: Response | undefined;
    server.handler = request => {
      if (request.method !== 'PUT') return undefined;
      accepted = server.serve(request);
      return response.promise;
    };
    const saving = updateVaccine(original.id, input({ note: '同じ業務内容でも同期所有情報を保護' }));
    await vi.waitFor(() => expect(accepted).toBeDefined());
    const current = await read();
    const changed = { ...current!, vaccineSyncOrigin: { ...current!.vaccineSyncOrigin!, ownerId: 'different-browser-owner' } };
    await repository.saveRecordPreservingTimestamps('vaccines', changed);
    response.resolve(accepted!);

    await expect(saving).rejects.toBeInstanceOf(VaccineSyncConflictError);

    expect(await read()).toEqual(changed);
    expect(environment.deleteExpense).not.toHaveBeenCalled();
  });
});
