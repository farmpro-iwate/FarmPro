import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import { createSale, emptySaleInput, getSalesList, updateSale } from './salesApi';
import { createExpense, emptyExpenseInput, getExpensesList, retryUnsentExpenses, updateExpense } from './expensesApi';

const environment = vi.hoisted(() => ({ plan: 'standard' }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => environment.plan }));
vi.mock('../plans/policy', () => ({ getFarmProPlan: () => ({ multiDeviceSync: environment.plan !== 'free' }) }));
vi.mock('./authClient', () => ({
  getAuthToken: () => 'fixture-plan-switch-token',
  getStoredAuthUser: () => ({ id: 'fixture-user', farmId: 'fixture-plan-switch-farm', plan: environment.plan }),
}));

type Row = { id: string; cloudUpdatedAt?: string; cloudSyncPending?: boolean; syncRecordId?: string;
  createdAt?: string; updatedAt?: string; memo?: string; [key: string]: unknown };
const revisionA = '2026-11-01T00:00:00.000Z';
const revisionB = '2026-11-01T01:00:00.000Z';
const revisionC = '2026-11-02T10:00:00.000Z';
const rawUnknown = { journal: ['001.20', null, { recorded: '2025-04-01T00:00:00+09:00' }] };
const saleInput = { ...emptySaleInput, targetName: 'fixture calf', targetNumber: 'FIXTURE', memo: 'A', salePrice: '001234.50' };
const expenseInput = { ...emptyExpenseInput, description: 'fixture repair', amount: '001234.50', memo: 'A', sourceType: 'manual' as const };

const sources = [
  { store: 'sales' as const, path: '/api/sales/record-sync', prefix: 'sale:',
    create: () => createSale(saleInput), update: (id: string, memo: string) => updateSale(id, { ...saleInput, memo }),
    list: () => getSalesList(), retry: async () => 0 },
  { store: 'expenses' as const, path: '/api/expenses/record-sync', prefix: 'expense:',
    create: () => createExpense(expenseInput), update: (id: string, memo: string) => updateExpense(id, { ...expenseInput, memo }),
    list: () => getExpensesList(), retry: () => retryUnsentExpenses() },
];
const otherStores = ['cattle', 'calves', 'calvings', 'schedules', 'supplyInventory'] as const;
let cloud: Map<string, Row>;
let requests: { method: string; path: string }[];
let rejectPut: boolean;

beforeEach(async () => {
  environment.plan = 'standard';
  window.localStorage.clear();
  window.history.replaceState({}, '', '/expenses');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  for (const store of ['sales', 'expenses', 'metadata', ...otherStores] as const) await clearStore(store);
  for (const store of otherStores) await saveRecordPreservingTimestamps(store, {
    id: `protected-${store}`, memo: 'unrelated original', createdAt: revisionA, updatedAt: revisionA,
  });
  cloud = new Map(); requests = []; rejectPut = false;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input); const method = init?.method ?? 'GET'; requests.push({ method, path });
    const source = sources.find(item => path === item.path || path.startsWith(item.path + '/'));
    if (!source) throw new Error(`Unexpected request ${method} ${path}`);
    if (method === 'GET' && path === source.path) return Response.json([...cloud.values()]);
    if (method === 'PUT') {
      if (rejectPut) return Response.json({ message: 'fixture: reject update' }, { status: 409 });
      const record = JSON.parse(String(init?.body)) as Row;
      const saved = { ...record, cloudUpdatedAt: revisionC };
      cloud.set(saved.id, saved); return Response.json(saved);
    }
    throw new Error(`Unexpected request ${method} ${path}`);
  }));
});

afterEach(async () => {
  for (const store of otherStores) expect(await getAllRecords(store)).toEqual([{
    id: `protected-${store}`, memo: 'unrelated original', createdAt: revisionA, updatedAt: revisionA,
  }]);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe.each(sources)('$store preserves previously synced edits made with Free', source => {
  async function acknowledged() {
    const saved = await source.create();
    const current = await getRecordById<Row>(source.store, saved.id);
    const record: Row = { ...current!, cloudUpdatedAt: revisionA, cloudSyncPending: false, unknownBusiness: rawUnknown,
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: revisionA };
    await saveRecordPreservingTimestamps(source.store, record);
    cloud.clear(); cloud.set(record.syncRecordId!, { ...record, id: record.syncRecordId! });
    requests = [];
    return record;
  }

  it.each(['update', 'delete'] as const)('keeps the exact Free edit after a peer %s, without any upload', async change => {
    const original = await acknowledged();
    environment.plan = 'free';
    await source.update(original.id, 'Free C');
    const edited = await getRecordById<Row>(source.store, original.id);
    expect(requests).toEqual([]);
    expect(edited).toMatchObject({ id: original.id, memo: 'Free C', unknownBusiness: rawUnknown,
      createdAt: original.createdAt, cloudUpdatedAt: revisionA });
    const peer = { ...cloud.get(original.syncRecordId!)!, memo: 'peer B', cloudUpdatedAt: revisionB,
      ...(change === 'delete' ? { deletedAt: revisionB } : {}) };
    cloud.set(original.syncRecordId!, peer);
    environment.plan = 'standard';
    expect(await source.list()).toEqual([edited]);
    expect(await source.retry()).toBe(0);
    expect(await source.list()).toEqual([edited]);
    expect(await getRecordById(source.store, original.id)).toEqual(edited);
    expect(cloud.get(original.syncRecordId!)).toEqual(peer);
    expect(requests.every(request => request.method === 'GET')).toBe(true);
  });

  it('keeps repeated Free edits and lets the next explicit paid save acknowledge the same record', async () => {
    const original = await acknowledged(); environment.plan = 'free';
    await source.update(original.id, 'Free C1'); await source.update(original.id, 'Free C2');
    const edited = await getRecordById<Row>(source.store, original.id);
    expect(requests).toEqual([]);
    environment.plan = 'pro';
    expect(await source.list()).toEqual([edited]);
    await source.retry();
    expect(requests.every(request => request.method === 'GET')).toBe(true);
    await source.update(original.id, 'explicit paid C');
    const confirmed = await getRecordById<Row>(source.store, original.id);
    expect(confirmed).toMatchObject({ id: original.id, syncRecordId: original.syncRecordId, cloudSyncPending: false,
      cloudUpdatedAt: revisionC, memo: 'explicit paid C', unknownBusiness: rawUnknown, createdAt: original.createdAt });
    expect(cloud.get(original.syncRecordId!)?.memo).toBe('explicit paid C');
    expect(await getAllRecords(source.store)).toHaveLength(1);
  });

  it('retains the Free original when the next explicit paid save is rejected', async () => {
    const original = await acknowledged(); environment.plan = 'free';
    await source.update(original.id, 'Free C');
    const edited = await getRecordById<Row>(source.store, original.id);
    environment.plan = 'standard'; rejectPut = true;
    await expect(source.update(original.id, 'attempt D')).rejects.toThrow('fixture: reject update');
    expect(await getRecordById(source.store, original.id)).toEqual(edited);
    expect(cloud.get(original.syncRecordId!)?.memo).toBe('A');
  });

  it('keeps ordinary Free-only creation and editing local', async () => {
    environment.plan = 'free';
    const saved = await source.create(); await source.update(saved.id, 'local C');
    expect(await source.list()).toHaveLength(1);
    expect(await getRecordById(source.store, saved.id)).toMatchObject({ memo: 'local C', cloudSyncPending: false });
    expect(requests).toEqual([]);
  });
});
