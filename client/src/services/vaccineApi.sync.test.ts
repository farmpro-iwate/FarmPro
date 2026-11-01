import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as repository from '../storage/repository';
import type { Vaccine, VaccineInput } from '../types/vaccine';
import type { ExpenseRecord } from './expensesApi';
import { createVaccine, deleteVaccine, getVaccineList, updateVaccine, VaccineExpenseCleanupError, VaccineSyncConflictError } from './vaccineApi';

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
type Request = { path: string; method: string; record?: CloudVaccine; signal?: AbortSignal | null };

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
      if (request.method === 'PUT' || request.method === 'DELETE') {
        const previous = server.records.get(id);
        const time = new Date(Date.parse('2026-11-01T01:00:00.000Z') + ++revision * 1000).toISOString();
        const saved = { ...previous, ...request.record, id, cloudUpdatedAt: time,
          deletedAt: request.method === 'DELETE' ? time : request.record?.deletedAt ?? previous?.deletedAt } as CloudVaccine;
        server.records.set(id, saved);
        return json(saved);
      }
      throw new Error(`Unexpected fixture request: ${request.method} ${request.path}`);
    },
  };
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const request: Request = { path: String(url), method: init?.method || 'GET', signal: init?.signal,
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
    expect.soft(immediatelyAfterDelete).toEqual(original);
    expect.soft(environment.deleteExpense).not.toHaveBeenCalled();
    expect(firstReload).toEqual([original]);
    expect(secondReload).toEqual([original]);
    expect(await repository.getAllRecords('vaccines')).toEqual([original]);
    expect([...server.records.keys()]).toEqual([original.syncRecordId]);
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'DELETE', 'GET', 'GET']);
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

  it('keeps the local record when a successful DELETE response is lost, then applies the tombstone once', async () => {
    await seed();
    const server = useCloud();
    server.handler = request => {
      if (request.method !== 'DELETE') return undefined;
      server.serve(request);
      throw new TypeError('fixture: DELETE response lost');
    };
    await expect(deleteVaccine(original.id)).rejects.toThrow('DELETE response lost');
    expect(await read()).toEqual(original);
    expect(await getVaccineList()).toEqual([]);
    expect(await getVaccineList()).toEqual([]);
  });

  it('rejects a new save when a lost DELETE response is followed by a PUT acknowledgement that is still deleted', async () => {
    await seed();
    const server = useCloud();
    server.handler = request => {
      if (request.method !== 'DELETE') return undefined;
      server.serve(request);
      throw new TypeError('fixture: DELETE response lost');
    };
    await expect(deleteVaccine(original.id)).rejects.toThrow('DELETE response lost');
    expect(await read()).toEqual(original);

    await expect(updateVaccine(original.id, input({ note: '応答喪失後の保存', vaccineCost: '2300' })))
      .rejects.toThrow('削除済み');
    expect(server.records.get(original.syncRecordId)?.deletedAt).toBeTruthy();
    expect(await read()).toMatchObject({ note: '応答喪失後の保存', vaccineCost: '2300', cloudSyncPending: true });
    expect(environment.deleteExpense).not.toHaveBeenCalled();
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'DELETE', 'PUT']);
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
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'GET', 'DELETE', 'GET', 'GET']);
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
    expect(server.requests.map(request => request.method)).toEqual(['PUT', 'GET', 'DELETE', 'GET']);
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
    expect(server.requests).toHaveLength(2);
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
    expect(await read()).toEqual(original);
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
    expect(server.requests.map(request => request.method)).toEqual(['GET', 'DELETE']);
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
    expect(server.requests.map(request => request.method)).toEqual(['PUT', 'GET']);
  });

  it('preserves the ordinary formal create and edit contents when an empty peer store pulls them', async () => {
    const server = useCloud();
    server.records.clear();
    const saved = await createVaccine(input({ note: '初回保存' }));
    await updateVaccine(saved.id, input({ note: '正式な編集', vaccineCost: '2300' }));
    await repository.clearStore('vaccines');
    expect(await getVaccineList()).toMatchObject([{ id: saved.id, note: '正式な編集', vaccineCost: '2300', cloudSyncPending: false }]);
    expect(server.records.size).toBe(1);
    expect(server.requests.map(request => request.method)).toEqual(['PUT', 'PUT', 'GET']);
  });
});
