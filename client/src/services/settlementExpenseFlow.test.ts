import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords, getRecordById, saveRecordPreservingTimestamps } from '../storage/repository';
import { deleteExpense, getAnimalExpenseTotals, getExpensesList, recordToInput, updateExpense, type ExpenseRecord } from './expensesApi';
import { getCalfProductionCostBreakdown } from './calfProductionCost';
import { getOrCreateSaleCostSnapshot } from './saleCostSnapshot';
import { getMonthlyBalance } from './monthlyBalanceApi';
import { getSalesList, type SaleRecord } from './salesApi';
import { settlementProfit } from './settlementSellingFees';

const plan = vi.hoisted(() => ({ cloud: true }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'standard' }));
vi.mock('../plans/policy', () => ({ getFarmProPlan: () => ({ multiDeviceSync: plan.cloud }) }));
vi.mock('./authClient', () => ({
  getAuthToken: () => 'test-token',
  getStoredAuthUser: () => ({ farmId: 'settlement-expense-flow-test' }),
}));
vi.mock('./feedInventoryApi', () => ({ getAnimalFeedCostTotal: async () => 0 }));
vi.mock('./farmExpenseAllocation', () => ({ getCalfFarmExpenseAllocation: async () => 0 }));
vi.mock('./allFarmExpenseAllocation', () => ({ getAllFarmExpenseAllocation: async () => 0 }));
vi.mock('./cattleFarmExpenseAllocation', () => ({ getCattleFarmExpenseAllocation: async () => 0 }));
vi.mock('./breedingCattleAcquisitionAllocation', () => ({ getBreedingCattleAcquisitionAllocationForCalf: async () => ({ amount: 0 }) }));
vi.mock('./salesApi', () => ({ getSalesList: vi.fn(), updateSale: vi.fn(), recordToInput: (record: unknown) => record }));

const sale = {
  id: 'local-sale', syncRecordId: 'sale:shared-sale', status: '販売済み', targetType: '子牛',
  calfId: 'device-two-calf', targetNumber: 'TEST5954', salePrice: '500000', saleDate: '2026-10-27',
  productionCostSnapshot: 200000, profitSnapshot: 300000,
  createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z',
} as SaleRecord;
const production = {
  id: 'expense:production', amount: '200000', category: 'その他', description: '生産費',
  paymentDate: '2026-10-27', target: 'TEST5954', animalType: 'calf', animalId: 'device-one-calf',
  animalEarTag: 'TEST5954', memo: '', createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z', cloudUpdatedAt: '2026-10-20T00:00:00.000Z',
};
const fee = {
  ...production, id: 'settlement:fee-1', amount: '10000', category: '手数料', description: '市場手数料',
  memo: '販売精算 TEST-001', settlementSaleId: sale.syncRecordId, settlementNumber: 'TEST-001',
  settlementExpenseKind: 'created', createdAt: '2026-10-27T00:00:00.000Z',
  updatedAt: '2026-10-27T00:00:00.000Z', cloudUpdatedAt: '2026-10-27T00:00:00.000Z',
};
let cloud: Record<string, unknown>[];

beforeEach(async () => {
  plan.cloud = true;
  for (const store of ['expenses', 'sales', 'calves', 'metadata'] as const) await clearStore(store);
  await saveRecordPreservingTimestamps('sales', { ...sale });
  await saveRecordPreservingTimestamps('calves', { id: 'device-two-calf', calfNumber: 'TEST5954', birthday: '2026-01-01' });
  vi.mocked(getSalesList).mockImplementation(() => getAllRecords<SaleRecord>('sales'));
  cloud = [{ ...production }, { ...fee }];
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(cloud), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })));
});

describe('formal settlement -> expense sync -> production cost -> sale/monthly profit', () => {
  it('imports once on another device, excludes new fee from cost and shows 290000 without changing fixed snapshots', async () => {
    const expenses = await getExpensesList({ requireCloudSync: true });
    expect(expenses).toHaveLength(2);
    expect(expenses.find((item) => item.id === fee.id)).toMatchObject({
      settlementSaleId: sale.syncRecordId, settlementExpenseKind: 'created', syncRecordId: fee.id,
    });
    const costs = await getCalfProductionCostBreakdown(sale.calfId!, sale.targetNumber);
    expect(costs.total).toBe(200000);
    expect(costs.includedExpenseIds).toEqual(['expense:production']);
    expect(costs.includedExpenseAmounts).toEqual({ 'expense:production': 200000 });
    expect(settlementProfit(sale, expenses, { productionCost: 200000, profit: 300000 }).profit).toBe(290000);
    const monthly = await getMonthlyBalance();
    expect(monthly.rows[0]).toMatchObject({
      salesProfitAmount: 290000, salesProfitNeedsReview: false,
      expenseTotalAmount: 210000, expenseCount: 2, balanceAmount: 290000,
    });
    expect(await getExpensesList({ requireCloudSync: true })).toHaveLength(2);
    expect(await getRecordById('sales', sale.id)).toEqual(sale);
  });

  it('records exact expense provenance in a new snapshot so a linked fee is not counted twice', async () => {
    cloud[1] = { ...fee, settlementExpenseKind: 'linked', memo: '以前に登録した市場手数料' };
    const noSnapshot = { ...sale, productionCostSnapshot: undefined, profitSnapshot: undefined };
    await saveRecordPreservingTimestamps('sales', noSnapshot);
    const snapshot = await getOrCreateSaleCostSnapshot(noSnapshot);
    expect(snapshot?.productionCost).toBe(210000);
    expect(snapshot?.breakdown?.includedExpenseIds).toContain(fee.id);
    expect(snapshot?.breakdown?.includedExpenseAmounts?.[fee.id]).toBe(10000);
    const monthly = await getMonthlyBalance();
    expect(monthly.rows[0]).toMatchObject({ salesProfitAmount: 290000, salesProfitNeedsReview: false });
  });

  it('preserves old snapshots and marks profit uncertain when a linked old fee has no cost provenance', async () => {
    cloud[1] = { ...fee, settlementExpenseKind: 'linked', memo: '以前に登録した市場手数料' };
    const monthly = await getMonthlyBalance();
    expect(monthly.rows[0].salesProfitNeedsReview).toBe(true);
    expect(monthly.totals.salesProfitNeedsReview).toBe(true);
    expect(monthly.rows[0].balanceAmount).toBe(290000);
    expect(await getRecordById('sales', sale.id)).toEqual(sale);
  });

  it('never overwrites a local expense when a cloud key maps to an occupied local ID', async () => {
    const existing = { id: 'collision', syncRecordId: 'different-cloud-key', amount: '123' };
    await saveRecordPreservingTimestamps('expenses', existing);
    cloud = [{ ...fee, id: 'expense:collision' }];
    await expect(getExpensesList({ requireCloudSync: true })).rejects.toThrow('同期ID');
    expect(await getRecordById('expenses', 'collision')).toMatchObject(existing);
  });
});

describe('settled expense edit/delete protection', () => {
  it('rejects edits/deletes of recognized settled expenses before any local change', async () => {
    const records = await getExpensesList({ requireCloudSync: true });
    const existing = records.find((record) => record.id === fee.id)!;
    await expect(updateExpense(existing.id, { ...recordToInput(existing), amount: '999' })).rejects.toThrow('精算確定済み');
    await expect(deleteExpense(existing.id)).rejects.toThrow('精算確定済み');
    expect(await getRecordById('expenses', existing.id)).toEqual(existing);
  });

  it('preserves a stale device record when the server rejects a newly finalized fee', async () => {
    const existing = { ...production, id: 'production', syncRecordId: production.id, cloudSyncPending: true } as unknown as ExpenseRecord;
    await saveRecordPreservingTimestamps('expenses', existing);
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({
      code: 'SETTLEMENT_EXPENSE_IMMUTABLE', message: '精算確定済みの経費は変更できません',
    }), { status: 409 }));
    await expect(updateExpense(existing.id, { ...recordToInput(existing), amount: '999' })).rejects.toThrow('精算確定済み');
    await expect(deleteExpense(existing.id)).rejects.toThrow('精算確定済み');
    expect(await getRecordById('expenses', existing.id)).toEqual(existing);
  });

  it('retains existing Free local editing behavior', async () => {
    plan.cloud = false;
    const existing = { ...production, id: 'production' } as unknown as ExpenseRecord;
    await saveRecordPreservingTimestamps('expenses', existing);
    const updated = await updateExpense(existing.id, { ...recordToInput(existing), amount: '999' });
    expect(updated.amount).toBe('999');
    expect(fetch).not.toHaveBeenCalled();
    await deleteExpense(existing.id);
    expect(await getRecordById('expenses', existing.id)).toBeUndefined();
  });
});
