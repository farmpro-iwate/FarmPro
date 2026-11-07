import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as repository from '../storage/repository';
import { createFeedPurchaseExpense, findMatchingFeedPurchaseExpenses, isLinkableFeedPurchaseExpense,
  linkFeedPurchaseExpense, loadFeedPurchaseExpenseReview, prepareFeedPurchaseExpense,
  bindFeedPurchaseExpenseReview, type FeedPurchaseExpenseInput } from './feedPurchaseExpenses';
import { deleteExpense, expenseSyncContext, getExpensesList, type ExpenseRecord } from './expensesApi';
import { createFeedInventory, type FeedInventoryRecord } from './feedInventoryApi';
import { getMonthlyBalance } from './monthlyBalanceApi';

const environment = vi.hoisted(() => ({
  plan: 'free', token: 'fixture-token' as string | null,
  user: { id: 'fixture-user', farmId: 'fixture-feed-expense-farm' } as { id: string; farmId: string } | null,
}));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => environment.plan }));
vi.mock('../plans/policy', () => ({ getFarmProPlan: () => ({ multiDeviceSync: environment.plan !== 'free' }) }));
vi.mock('./authClient', () => ({ getAuthToken: () => environment.token, getStoredAuthUser: () => environment.user }));
vi.mock('./salesApi', () => ({ getSalesList: vi.fn(async () => []) }));

const farmId = 'fixture-feed-expense-farm';
const source = {
  id: 'fixture-local-purchase', syncRecordId: 'feed-inventory:fixture-stable-purchase',
  transactionDate: '2026-11-01', feedName: '試験飼料', transactionType: '入庫', sourceType: 'purchased' as const,
  quantity: '10', unit: 'kg', bagWeightKg: '', totalWeightKg: '', unitPrice: '110', totalPrice: '1100',
  supplier: '飼料店', taxRate: '10', taxExcludedPrice: '1000', taxAmount: '100', memo: '元記録を保持',
  createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z',
};
const input: FeedPurchaseExpenseInput = { paymentDate: '2026-11-02', amount: '1100', paymentMethod: '銀行振込',
  vendor: '飼料店', description: '試験飼料 購入', memo: '' };
const manual: ExpenseRecord = { id: 'fixture-manual', syncRecordId: 'expense:fixture-manual',
  paymentDate: input.paymentDate, category: '飼料費', description: '確認済み請求書', vendor: '飼料店', amount: '1100',
  paymentMethod: '銀行振込', target: '農場全体', sourceType: 'manual', memo: '元の経費を保持',
  createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' };

type CloudExpense = ExpenseRecord & { cloudUpdatedAt: string; deletedAt?: string };
type Request = { path: string; method: string; headers: Headers; body?: Record<string, any> };
let cloud: Map<string, CloudExpense>;
let requests: Request[];
let intercept: ((request: Request) => Response | undefined | Promise<Response | undefined>) | undefined;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const writes = () => requests.filter(row => row.method !== 'GET');

function serve(request: Request): Response {
  if (request.method === 'GET' && request.path === '/api/expenses/record-sync') return json([...cloud.values()]);
  if (request.method === 'GET' && request.path === '/api/expenses/settlement-adjustments') return json([]);
  if (request.method === 'PUT' && request.path.startsWith('/api/feed-inventory/record-sync/')) {
    return json({ ...request.body, cloudUpdatedAt: '2026-11-03T00:00:00.000Z' });
  }
  const prefix = '/api/expenses/record-sync/';
  if (request.method === 'PUT' && request.path.startsWith(prefix)) {
    const id = decodeURIComponent(request.path.slice(prefix.length));
    const { feedPurchaseConfirmedSimilarExpenses: _confirmed, ...record } = request.body!;
    if (cloud.has(id) || [...cloud.values()].some(row => row.sourceType === 'feed-purchase' && row.sourceId === record.sourceId)) {
      return json({ message: '登録済みです' }, 412);
    }
    const saved = { ...record, id, cloudUpdatedAt: '2026-11-03T00:00:00.000Z' } as CloudExpense;
    cloud.set(id, saved);
    return json(saved);
  }
  if (request.method === 'POST' && request.path.endsWith('/feed-purchase-link')) {
    const id = decodeURIComponent(request.path.slice(prefix.length, -'/feed-purchase-link'.length));
    const existing = cloud.get(id)!;
    const saved = { ...existing, sourceType: 'feed-purchase' as const, sourceId: request.body!.sourceId,
      sourceDetail: 'purchase', cloudUpdatedAt: '2026-11-03T00:00:00.000Z' };
    cloud.set(id, saved);
    return json(saved);
  }
  if (request.method === 'DELETE' && request.path.startsWith(prefix)) {
    const id = decodeURIComponent(request.path.slice(prefix.length));
    const saved = { ...cloud.get(id)!, deletedAt: '2026-11-04T00:00:00.000Z', cloudUpdatedAt: '2026-11-04T00:00:00.000Z' };
    cloud.set(id, saved);
    return json(saved);
  }
  throw new Error(`Unexpected fixture request: ${request.method} ${request.path}`);
}

async function saveManual(changes: Partial<ExpenseRecord> & { cloudUpdatedAt?: string } = {}) {
  const record = { ...manual, ...changes };
  await repository.saveRecordPreservingTimestamps('expenses', record);
  return record;
}

beforeEach(async () => {
  environment.plan = 'free'; environment.token = 'fixture-token';
  environment.user = { id: 'fixture-user', farmId };
  localStorage.clear();
  for (const store of ['expenses', 'feedInventory', 'metadata'] as const) await repository.clearStore(store);
  await repository.saveRecordPreservingTimestamps('feedInventory', source);
  cloud = new Map(); requests = []; intercept = undefined;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async (path: RequestInfo | URL, options?: RequestInit) => {
    const request: Request = { path: String(path), method: options?.method || 'GET', headers: new Headers(options?.headers),
      ...(options?.body ? { body: JSON.parse(String(options.body)) } : {}) };
    requests.push(request);
    return await intercept?.(request) ?? serve(request);
  }));
});

describe('preflight for inline stock registration', () => {
  async function savePurchase() {
    const { id: _id, syncRecordId: _sync, createdAt: _created, updatedAt: _updated, ...values } = source;
    return createFeedInventory({ ...values, taxRate: '10' },
      { farmId: environment.user!.farmId, userId: environment.user!.id });
  }

  beforeEach(async () => { await repository.clearStore('feedInventory'); });

  it('prepares without stock writes, then reuses confirmed creation for one stock entry and one expense', async () => {
    const prepared = await prepareFeedPurchaseExpense(input, expenseSyncContext());
    expect(prepared.ready).toBe(true);
    expect(await repository.getAllRecords('feedInventory')).toEqual([]);
    expect(writes()).toEqual([]);
    const saved = await savePurchase();
    const review = await bindFeedPurchaseExpenseReview(prepared, saved);
    await createFeedPurchaseExpense(review, prepared.input);
    expect(await repository.getAllRecords('feedInventory')).toHaveLength(1);
    expect(await getExpensesList()).toHaveLength(1);
    expect((await getMonthlyBalance()).totals.expenseFeedAmount).toBe(1100);
  });

  it.each([{ paymentDate: '' }, { paymentMethod: '' }, { amount: '0' }])(
    'rejects required new-payment inputs before creating stock: %o', async patch => {
      await expect(prepareFeedPurchaseExpense({ ...input, ...patch }, expenseSyncContext())).rejects.toThrow();
      expect(await repository.getAllRecords('feedInventory')).toEqual([]);
      expect(await getExpensesList()).toEqual([]);
      expect(writes()).toEqual([]);
    });

  it('requires displayed evidence before a similar payment can be confirmed as separate', async () => {
    await saveManual();
    const owner = expenseSyncContext();
    const unreviewed = await prepareFeedPurchaseExpense({ ...input, allowSeparatePayment: true }, owner);
    expect(unreviewed).toMatchObject({ ready: false, input: { allowSeparatePayment: false } });
    expect(unreviewed.matchingExpenses).toHaveLength(1);
    unreviewed.ready = true;
    await expect(bindFeedPurchaseExpenseReview(unreviewed, source as FeedInventoryRecord)).rejects.toThrow(/確認/);
    const confirmed = await prepareFeedPurchaseExpense({ ...input, allowSeparatePayment: true }, owner, { reviewed: unreviewed });
    expect(confirmed.ready).toBe(true);
    expect(await repository.getAllRecords('feedInventory')).toEqual([]);
    const saved = await savePurchase();
    await createFeedPurchaseExpense(await bindFeedPurchaseExpenseReview(confirmed, saved), confirmed.input);
    expect(await getExpensesList()).toHaveLength(2);
  });

  it('carries the reviewed candidate set across the stock save and stops a later unreviewed payment', async () => {
    await saveManual();
    const owner = expenseSyncContext();
    const first = await prepareFeedPurchaseExpense(input, owner);
    const confirmed = await prepareFeedPurchaseExpense({ ...input, allowSeparatePayment: true }, owner, { reviewed: first });
    const saved = await savePurchase();
    await saveManual({ id: 'new-manual-payment', syncRecordId: 'expense:new-manual-payment' });
    const bound = await bindFeedPurchaseExpenseReview(confirmed, saved);
    await expect(createFeedPurchaseExpense(bound, confirmed.input)).rejects.toThrow(/追加または変更/);
    expect(await repository.getAllRecords('feedInventory')).toHaveLength(1);
    expect((await getExpensesList()).filter(row => row.sourceType === 'feed-purchase')).toEqual([]);
    const changed = await prepareFeedPurchaseExpense({ ...input, allowSeparatePayment: true }, owner, { reviewed: confirmed });
    expect(changed.ready).toBe(false);
    expect(changed.matchingExpenses).toHaveLength(2);
  });

  it('prepares an existing-payment link without inventing a new date or method and retains its original values', async () => {
    const original = await saveManual();
    const owner = expenseSyncContext();
    const displayed = await prepareFeedPurchaseExpense({ ...input, paymentDate: '', paymentMethod: '' }, owner, { reviewOnly: true });
    expect(displayed.ready).toBe(false);
    expect(displayed.matchingExpenses).toEqual([]);
    expect(displayed.linkableExpenses).toHaveLength(1);
    const prepared = await prepareFeedPurchaseExpense({ ...input, paymentDate: '', paymentMethod: '' }, owner,
      { reviewed: displayed, linkExpenseId: original.id });
    expect(prepared).toMatchObject({ ready: true, linkExpenseId: original.id, input: { paymentDate: '', paymentMethod: '' } });
    const saved = await savePurchase();
    const linked = await linkFeedPurchaseExpense(await bindFeedPurchaseExpenseReview(prepared, saved), original.id);
    expect(linked).toMatchObject({ amount: original.amount, paymentDate: original.paymentDate,
      paymentMethod: original.paymentMethod, memo: original.memo, updatedAt: original.updatedAt });
    expect(await getExpensesList()).toHaveLength(1);
    expect(await repository.getAllRecords('feedInventory')).toHaveLength(1);
  });

  it('rejects a changed or combined existing payment before any stock write', async () => {
    await saveManual();
    const owner = expenseSyncContext();
    const displayed = await prepareFeedPurchaseExpense(input, owner);
    await saveManual({ amount: '2200' });
    await expect(prepareFeedPurchaseExpense(input, owner, { reviewed: displayed, linkExpenseId: manual.id })).rejects.toThrow(/変更/);
    expect(await repository.getAllRecords('feedInventory')).toEqual([]);
  });

  it('checks the initial form owner before preflight and again before binding a saved record', async () => {
    const originalOwner = expenseSyncContext();
    environment.user = { id: 'different-user', farmId };
    await expect(prepareFeedPurchaseExpense(input, originalOwner)).rejects.toThrow(/変わった/);
    environment.user = { id: 'fixture-user', farmId };
    const prepared = await prepareFeedPurchaseExpense(input, originalOwner);
    const saved = await savePurchase();
    environment.token = 'different-token';
    await expect(bindFeedPurchaseExpenseReview(prepared, saved)).rejects.toThrow(/変わった/);
    expect(await repository.getAllRecords('expenses')).toEqual([]);
    expect(await repository.getAllRecords('feedInventory')).toHaveLength(1);
  });

  it('rejects stock changes and unreviewed payment changes after preflight', async () => {
    const prepared = await prepareFeedPurchaseExpense(input, expenseSyncContext());
    const saved = await savePurchase();
    const review = await bindFeedPurchaseExpenseReview(prepared, saved);
    await expect(createFeedPurchaseExpense(review, { ...prepared.input, paymentDate: '2026-11-03' })).rejects.toThrow(/事前に確認/);
    await repository.saveRecordPreservingTimestamps('feedInventory', { ...saved, quantity: '20' });
    await expect(bindFeedPurchaseExpenseReview(prepared, saved)).rejects.toThrow(/入庫内容が変わ/);
    expect(await getExpensesList()).toEqual([]);
  });

  it('can retry an unknown expense ACK using the same saved stock and preflight without another stock write', async () => {
    environment.plan = 'standard';
    const prepared = await prepareFeedPurchaseExpense(input, expenseSyncContext());
    const saved = await savePurchase();
    intercept = request => {
      if (request.method === 'PUT' && request.path.startsWith('/api/expenses/record-sync/')) {
        serve(request); throw new TypeError('fixture: lost expense ACK');
      }
      return undefined;
    };
    await expect(createFeedPurchaseExpense(await bindFeedPurchaseExpenseReview(prepared, saved), prepared.input)).rejects.toThrow(/保存結果/);
    intercept = undefined;
    await createFeedPurchaseExpense(await bindFeedPurchaseExpenseReview(prepared, saved), prepared.input);
    expect(await repository.getAllRecords('feedInventory')).toHaveLength(1);
    expect(await getExpensesList()).toHaveLength(1);
    expect(writes().filter(row => row.path.startsWith('/api/feed-inventory/'))).toHaveLength(1);
    expect(writes().filter(row => row.path.startsWith('/api/expenses/'))).toHaveLength(1);
  });

  it('can retry an unknown existing-link ACK with the original preflight evidence', async () => {
    environment.plan = 'standard';
    cloud.set(manual.syncRecordId!, { ...manual, id: manual.syncRecordId!, cloudUpdatedAt: '2026-11-02T12:00:00.000Z' });
    const owner = expenseSyncContext();
    const displayed = await prepareFeedPurchaseExpense(input, owner);
    const prepared = await prepareFeedPurchaseExpense(input, owner, { reviewed: displayed, linkExpenseId: manual.id });
    const saved = await savePurchase();
    intercept = request => {
      if (request.method === 'POST') { serve(request); throw new TypeError('fixture: lost link ACK'); }
      return undefined;
    };
    await expect(linkFeedPurchaseExpense(await bindFeedPurchaseExpenseReview(prepared, saved), manual.id)).rejects.toThrow(/保存結果/);
    intercept = undefined;
    await linkFeedPurchaseExpense(await bindFeedPurchaseExpenseReview(prepared, saved), manual.id);
    expect(await repository.getAllRecords('feedInventory')).toHaveLength(1);
    expect(await getExpensesList()).toHaveLength(1);
    expect(writes().filter(row => row.method === 'POST')).toHaveLength(1);
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('reviewed feed purchase expenses', () => {
  it('records one confirmed payment in the ledger/monthly balance and never changes stock or outbound costs', async () => {
    await repository.saveRecordPreservingTimestamps('feedInventory', { ...source, id: 'outbound', transactionType: '出庫',
      costing: { usedCost: 500, allocations: [{ animalType: 'calf', animalId: 'calf-a', allocatedCost: 500 }] } });
    const before = await repository.getAllRecords('feedInventory');
    const review = await loadFeedPurchaseExpenseReview(source.id);
    expect(await getExpensesList()).toEqual([]);
    const [first, second] = await Promise.all([
      createFeedPurchaseExpense(review, input), createFeedPurchaseExpense(review, input),
    ]);
    expect(first.id).toBe(second.id);
    expect(first).toMatchObject({ sourceType: 'feed-purchase', sourceId: source.syncRecordId,
      paymentDate: '2026-11-02', amount: '1100', category: '飼料費' });
    expect(await getExpensesList()).toHaveLength(1);
    const balance = await getMonthlyBalance();
    expect(balance.totals).toMatchObject({ expenseCount: 1, expenseFeedAmount: 1100, expenseTotalAmount: 1100, balanceAmount: -1100 });
    expect(await repository.getAllRecords('feedInventory')).toEqual(before);
    expect(writes()).toEqual([]);
  });

  it.each([
    { paymentDate: '' }, { paymentDate: '2026-02-30' }, { amount: '' }, { amount: 'Infinity' },
    { amount: '-1' }, { paymentMethod: '' }, { description: ' ' },
  ])('does not invent missing/invalid payment values: %o', async patch => {
    const review = await loadFeedPurchaseExpenseReview(source.id);
    await expect(createFeedPurchaseExpense(review, { ...input, ...patch })).rejects.toThrow();
    expect(await getExpensesList()).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it.each([{ sourceType: 'homegrown' }, { transactionType: '出庫' }, { transactionType: '調整' }, { farmId: 'other-farm' }])(
    'rejects a non-purchase or a record belonging to another farm: %o', async patch => {
      await repository.saveRecordPreservingTimestamps('feedInventory', { ...source, ...patch });
      await expect(loadFeedPurchaseExpenseReview(source.id)).rejects.toThrow();
      expect(writes()).toEqual([]);
    });

  it.each(['farm', 'user', 'token', 'plan'] as const)('rejects a changed %s after review', async kind => {
    const review = await loadFeedPurchaseExpenseReview(source.id);
    if (kind === 'farm') environment.user = { id: 'fixture-user', farmId: 'fixture-other-farm' };
    if (kind === 'user') environment.user = { id: 'another-user', farmId };
    if (kind === 'token') environment.token = 'different-token';
    if (kind === 'plan') environment.plan = 'standard';
    await expect(createFeedPurchaseExpense(review, input)).rejects.toThrow(/変わった/);
    expect(writes()).toEqual([]);
    environment.user = { id: 'fixture-user', farmId };
    expect(await repository.getAllRecords('expenses')).toEqual([]);
  });

  it.each(['edit', 'delete'] as const)('stops when the source is changed by %s after review', async action => {
    const review = await loadFeedPurchaseExpenseReview(source.id);
    if (action === 'edit') await repository.saveRecordPreservingTimestamps('feedInventory', { ...source, totalPrice: '2200' });
    else await repository.deleteRecord('feedInventory', source.id);
    await expect(createFeedPurchaseExpense(review, input)).rejects.toThrow();
    expect(await getExpensesList()).toEqual([]);
  });

  it('preserves the purchase identity across local IDs and does not follow later category or source edits', async () => {
    const first = await createFeedPurchaseExpense(await loadFeedPurchaseExpenseReview(source.id), input);
    await repository.saveRecordPreservingTimestamps('expenses', { ...first, category: 'その他', amount: '990' });
    await repository.saveRecordPreservingTimestamps('feedInventory', { ...source, id: 'another-local-id', totalPrice: '3000' });
    const secondReview = await loadFeedPurchaseExpenseReview('another-local-id');
    expect(secondReview.linkedExpense).toMatchObject({ id: first.id, category: 'その他', amount: '990' });
    await expect(createFeedPurchaseExpense(secondReview, input)).rejects.toThrow(/登録済み/);
    expect(await getExpensesList()).toHaveLength(1);
  });

  it('requires separate-payment confirmation for an existing manual expense and never saves the confirmation metadata', async () => {
    await saveManual();
    const review = await loadFeedPurchaseExpenseReview(source.id);
    expect(findMatchingFeedPurchaseExpenses(review, { ...input, vendor: ' 飼料店 ' })).toHaveLength(1);
    await expect(createFeedPurchaseExpense(review, input)).rejects.toThrow(/同じ支払日/);
    await createFeedPurchaseExpense(review, { ...input, allowSeparatePayment: true });
    const rows = await getExpensesList();
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.sourceType === 'feed-purchase')).not.toHaveProperty('allowSeparatePayment');
  });

  it.each(['add', 'edit'] as const)('requires a new review when a confirmed similar expense changes by %s', async action => {
    await saveManual();
    const review = await loadFeedPurchaseExpenseReview(source.id);
    await saveManual(action === 'add' ? { id: 'manual-b', syncRecordId: 'expense:manual-b' } : { memo: '確認後の変更' });
    await expect(createFeedPurchaseExpense(review, { ...input, allowSeparatePayment: true })).rejects.toThrow(/追加または変更/);
    expect((await getExpensesList()).filter(row => row.sourceType === 'feed-purchase')).toEqual([]);
  });

  it('links only the reference to an existing manual payment, leaving every other field unchanged', async () => {
    const original = await saveManual();
    const review = await loadFeedPurchaseExpenseReview(source.id);
    expect(isLinkableFeedPurchaseExpense(original)).toBe(true);
    const result = await linkFeedPurchaseExpense(review, original.id);
    expect(result).toEqual({ ...original, sourceType: 'feed-purchase', sourceId: source.syncRecordId,
      sourceDetail: 'purchase', cloudSyncPending: false });
    expect(await getExpensesList()).toHaveLength(1);
    expect((await getMonthlyBalance()).totals.expenseFeedAmount).toBe(1100);
    expect(await repository.getRecordById('feedInventory', source.id)).toEqual(source);
  });

  it.each([{ amount: '2200' }, { sourceType: 'breeding' as const }, { sourceSupplyMovementId: 'medicine' },
    { settlementSaleId: 'sale-a' }, { cloudSyncPending: true }])('does not link a combined payment or protected expense: %o', async patch => {
    await saveManual(patch);
    const review = await loadFeedPurchaseExpenseReview(source.id);
    await expect(linkFeedPurchaseExpense(review, manual.id)).rejects.toThrow();
    expect((await repository.getRecordById<ExpenseRecord>('expenses', manual.id))?.sourceType).toBe(patch.sourceType || 'manual');
  });

  it('rejects linking a synced expense while Free and rejects an expense edited since review', async () => {
    await saveManual({ cloudUpdatedAt: '2026-11-02T12:00:00.000Z' });
    const review = await loadFeedPurchaseExpenseReview(source.id);
    await expect(linkFeedPurchaseExpense(review, manual.id)).rejects.toThrow(/同期を利用/);
    await saveManual({ memo: '別タブで変更' });
    await expect(linkFeedPurchaseExpense(review, manual.id)).rejects.toThrow(/変更/);
    expect(writes()).toEqual([]);
  });

  it('does not silently recreate a deliberately deleted local purchase expense', async () => {
    const created = await createFeedPurchaseExpense(await loadFeedPurchaseExpenseReview(source.id), input);
    await deleteExpense(created.id);
    expect(await getExpensesList()).toEqual([]);
    await expect(createFeedPurchaseExpense(await loadFeedPurchaseExpenseReview(source.id), input)).rejects.toThrow(/削除/);
    expect(await repository.getRecordById('feedInventory', source.id)).toEqual(source);
  });

  it('uses create-only on paid plans, preserves the reference on cloud pull, and resolves an unknown ACK without another write', async () => {
    environment.plan = 'standard';
    const review = await loadFeedPurchaseExpenseReview(source.id);
    intercept = request => {
      if (request.method === 'PUT') { serve(request); throw new TypeError('fixture: lost ACK'); }
      return undefined;
    };
    await expect(createFeedPurchaseExpense(review, input)).rejects.toThrow(/保存結果を確認/);
    expect(await repository.getAllRecords('expenses')).toEqual([]);
    intercept = undefined;
    const recovered = await createFeedPurchaseExpense(review, input);
    expect(recovered).toMatchObject({ sourceType: 'feed-purchase', sourceId: source.syncRecordId, amount: '1100' });
    expect(writes()).toHaveLength(1);
    expect(writes()[0].headers.get('If-None-Match')).toBe('*');
    expect((await getMonthlyBalance()).totals.expenseFeedAmount).toBe(1100);
  });

  it('does not reinterpret a changed or deleted remote purchase expense as an ACK', async () => {
    environment.plan = 'standard';
    const review = await loadFeedPurchaseExpenseReview(source.id);
    const created = await createFeedPurchaseExpense(review, input);
    const remoteId = created.syncRecordId!;
    cloud.set(remoteId, { ...cloud.get(remoteId)!, amount: '999', cloudUpdatedAt: '2026-11-05T00:00:00.000Z' });
    await expect(createFeedPurchaseExpense(review, input)).rejects.toThrow(/登録済み/);
    cloud.set(remoteId, { ...cloud.get(remoteId)!, deletedAt: '2026-11-06T00:00:00.000Z', cloudUpdatedAt: '2026-11-06T00:00:00.000Z' });
    await expect(createFeedPurchaseExpense(review, input)).rejects.toThrow(/削除/);
    expect(writes()).toHaveLength(1);
  });

  it('remembers a cloud tombstone even when no local expense exists, and cannot resurrect it on Free', async () => {
    environment.plan = 'standard';
    cloud.set('expense:deleted', { ...manual, id: 'expense:deleted', sourceType: 'feed-purchase',
      sourceId: source.syncRecordId, sourceDetail: 'purchase', deletedAt: '2026-11-04T00:00:00.000Z',
      cloudUpdatedAt: '2026-11-04T00:00:00.000Z' });
    await getExpensesList();
    const receipt = (await repository.getAllRecords('metadata'))[0];
    const preservedReceipt = { ...receipt, createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' };
    await repository.saveRecordPreservingTimestamps('metadata', preservedReceipt);
    await getExpensesList();
    expect(await repository.getAllRecords('metadata')).toEqual([preservedReceipt]);
    environment.plan = 'free';
    await expect(createFeedPurchaseExpense(await loadFeedPurchaseExpenseReview(source.id), input)).rejects.toThrow(/削除/);
    expect(writes()).toEqual([]);
  });

  it('does not delete a synced purchase expense while on Free', async () => {
    environment.plan = 'standard';
    const created = await createFeedPurchaseExpense(await loadFeedPurchaseExpenseReview(source.id), input);
    environment.plan = 'free';
    await expect(deleteExpense(created.id)).rejects.toThrow(/同期を利用/);
    expect(await getExpensesList()).toHaveLength(1);
  });

  it('links paid manual expenses through the compare-and-link API without changing economic fields', async () => {
    environment.plan = 'standard';
    cloud.set(manual.syncRecordId!, { ...manual, id: manual.syncRecordId!, cloudUpdatedAt: '2026-11-02T12:00:00.000Z' });
    const review = await loadFeedPurchaseExpenseReview(source.id);
    const original = review.expenses[0];
    const linked = await linkFeedPurchaseExpense(review, original.id);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({ method: 'POST', path: '/api/expenses/record-sync/expense%3Afixture-manual/feed-purchase-link',
      body: { sourceId: source.syncRecordId, expected: JSON.parse(JSON.stringify(original)) } });
    expect(linked).toMatchObject({ paymentDate: manual.paymentDate, amount: manual.amount, memo: manual.memo,
      updatedAt: manual.updatedAt, sourceType: 'feed-purchase', sourceId: source.syncRecordId });
    expect(await getExpensesList()).toHaveLength(1);
  });

  it('sends the reviewed similar-expense evidence only as transient request confirmation', async () => {
    environment.plan = 'standard';
    cloud.set(manual.syncRecordId!, { ...manual, id: manual.syncRecordId!, cloudUpdatedAt: '2026-11-02T12:00:00.000Z' });
    const review = await loadFeedPurchaseExpenseReview(source.id);
    const created = await createFeedPurchaseExpense(review, { ...input, allowSeparatePayment: true });
    expect(writes()[0].headers.get('X-FarmPro-Allow-Separate-Feed-Payment')).toBe('true');
    expect(writes()[0].body?.feedPurchaseConfirmedSimilarExpenses).toHaveLength(1);
    expect(writes()[0].body?.feedPurchaseConfirmedSimilarExpenses[0].id).toBe(manual.syncRecordId);
    expect(created).not.toHaveProperty('feedPurchaseConfirmedSimilarExpenses');
  });

  it('does not write a delayed paid response into another farm after an account switch', async () => {
    environment.plan = 'standard';
    const review = await loadFeedPurchaseExpenseReview(source.id);
    intercept = request => {
      if (request.method === 'PUT') {
        const response = serve(request);
        environment.user = { id: 'different-user', farmId: 'fixture-other-farm' };
        return response;
      }
    };
    await expect(createFeedPurchaseExpense(review, input)).rejects.toThrow(/変わった/);
    expect(await repository.getAllRecords('expenses')).toEqual([]);
    environment.user = { id: 'fixture-user', farmId };
    expect(await repository.getAllRecords('expenses')).toEqual([]);
  });

  it('never retries a rejected conditional create as an unconditional replacement', async () => {
    environment.plan = 'standard';
    const review = await loadFeedPurchaseExpenseReview(source.id);
    intercept = request => request.method === 'PUT' ? json({ message: '登録済みです' }, 412) : undefined;
    await expect(createFeedPurchaseExpense(review, input)).rejects.toThrow(/登録済み/);
    expect(writes()).toHaveLength(1);
    expect(writes()[0].headers.get('If-None-Match')).toBe('*');
    expect(await repository.getAllRecords('expenses')).toEqual([]);
  });

  it('does not overwrite or duplicate expenses when a restore changes the local key during linking', async () => {
    environment.plan = 'standard';
    cloud.set(manual.syncRecordId!, { ...manual, id: manual.syncRecordId!, cloudUpdatedAt: '2026-11-02T12:00:00.000Z' });
    const review = await loadFeedPurchaseExpenseReview(source.id);
    intercept = async request => {
      if (request.method !== 'POST') return;
      await repository.deleteRecord('expenses', manual.id);
      await saveManual({ id: 'restored-local-id' });
      await saveManual({ id: manual.id, syncRecordId: 'expense:other-payment', amount: '777', memo: '別の支払いを保持' });
      return serve(request);
    };
    await expect(linkFeedPurchaseExpense(review, manual.id)).rejects.toThrow(/変更/);
    const rows = await repository.getAllRecords<ExpenseRecord>('expenses');
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.id === manual.id)).toMatchObject({ amount: '777', memo: '別の支払いを保持', sourceType: 'manual' });
    expect(rows.find(row => row.id === 'restored-local-id')).toMatchObject({ syncRecordId: manual.syncRecordId, sourceType: 'manual' });
  });
});
