import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAllRecords,
  getRecordById,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import { buildFeedCostingSnapshot } from './feedCostingSnapshot';
import { getAnimalFeedCostTotal } from './feedInventoryApi';
import { getCalfProductionCostBreakdown } from './calfProductionCost';
import { getOrCreateSaleCostSnapshot } from './saleCostSnapshot';
import { getMonthlyBalance } from './monthlyBalanceApi';
import { getFeedAllocationTargets } from './feedAllocationTargets';
import { getSalesList, recordToInput, updateSale } from './salesApi';
import { getAnimalExpenseTotals } from './expensesApi';
import { getCalfFarmExpenseAllocation } from './farmExpenseAllocation';
import { getAllFarmExpenseAllocation } from './allFarmExpenseAllocation';
import { getBreedingCattleAcquisitionAllocationForCalf } from './breedingCattleAcquisitionAllocation';

vi.mock('../storage/repository', () => ({
  getAllRecords: vi.fn(),
  getRecordById: vi.fn(),
  saveRecord: vi.fn(),
  saveRecordPreservingTimestamps: vi.fn(),
  deleteRecord: vi.fn(),
}));

vi.mock('../plans/current-plan', () => ({
  getCurrentFarmProPlanId: () => 'free',
}));

vi.mock('../plans/policy', () => ({
  getFarmProPlan: () => ({ multiDeviceSync: false }),
}));

vi.mock('./feedAllocationTargets', () => ({
  getFeedAllocationTargets: vi.fn(),
}));

vi.mock('./expensesApi', () => ({
  getAnimalExpenseTotals: vi.fn(),
}));

vi.mock('./farmExpenseAllocation', () => ({
  getCalfFarmExpenseAllocation: vi.fn(),
}));

vi.mock('./allFarmExpenseAllocation', () => ({
  getAllFarmExpenseAllocation: vi.fn(),
}));

vi.mock('./breedingCattleAcquisitionAllocation', () => ({
  getBreedingCattleAcquisitionAllocationForCalf: vi.fn(),
}));

vi.mock('./salesApi', () => ({
  getSalesList: vi.fn(),
  recordToInput: vi.fn(),
  updateSale: vi.fn(),
}));

type AnyRecord = Record<string, any>;

describe('飼料原価から販売利益・月別収支までの連動', () => {
  const stores: Record<string, AnyRecord[]> = {
    feedInventory: [],
    calves: [],
    sales: [],
    expenses: [],
  };

  beforeEach(() => {
    for (const key of Object.keys(stores)) stores[key] = [];

    vi.mocked(getAllRecords).mockImplementation(async (storeName: any) => {
      return [...(stores[String(storeName)] ?? [])] as any;
    });

    vi.mocked(getRecordById).mockImplementation(async (storeName: any, id: any) => {
      return (stores[String(storeName)] ?? []).find((item) => String(item.id) === String(id)) as any;
    });

    vi.mocked(saveRecordPreservingTimestamps).mockImplementation(async (storeName: any, record: any) => {
      const key = String(storeName);
      const rows = stores[key] ?? (stores[key] = []);
      const index = rows.findIndex((item) => String(item.id) === String(record.id));
      const saved = {
        ...record,
        createdAt: record.createdAt ?? '2026-09-01T00:00:00.000Z',
        updatedAt: record.updatedAt ?? '2026-09-01T00:00:00.000Z',
      };
      if (index >= 0) rows[index] = saved;
      else rows.push(saved);
      return saved as any;
    });

    vi.mocked(getFeedAllocationTargets).mockResolvedValue([
      {
        animalType: 'calf',
        animalId: 'calf-1',
        earTag: '1001',
        animalName: 'テスト子牛',
        weight: 1,
      },
    ] as any);

    vi.mocked(getAnimalExpenseTotals).mockResolvedValue({
      medical: 0,
      breeding: 0,
      other: 0,
    } as any);
    vi.mocked(getCalfFarmExpenseAllocation).mockResolvedValue(0);
    vi.mocked(getAllFarmExpenseAllocation).mockResolvedValue(0);
    vi.mocked(getBreedingCattleAcquisitionAllocationForCalf).mockResolvedValue({
      amount: 0,
      allocationParity: 8,
    } as any);

    vi.mocked(getSalesList).mockImplementation(async () => [...stores.sales] as any);
    vi.mocked(recordToInput).mockImplementation((record: any) => record as any);
    vi.mocked(updateSale).mockImplementation(async (id: any) => {
      return stores.sales.find((item) => String(item.id) === String(id)) as any;
    });
  });

  it('入庫→出庫按分→個体別生産費→販売スナップショット→月別収支へ同じ原価を引き継ぐ', async () => {
    stores.feedInventory.push({
      id: 'feed-in-1',
      transactionDate: '2026-09-01',
      feedName: '配合飼料',
      transactionType: '入庫',
      quantity: '100',
      unit: 'kg',
      bagWeightKg: '',
      totalWeightKg: '',
      unitPrice: '100',
      totalPrice: '10000',
      taxExcludedPrice: '',
      supplier: '',
      memo: '',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    const costing = await buildFeedCostingSnapshot(
      {
        transactionDate: '2026-09-10',
        feedName: '配合飼料',
        transactionType: '出庫',
        quantity: '10',
        unit: 'kg',
        bagWeightKg: '',
        totalWeightKg: '',
        unitPrice: '',
        totalPrice: '',
        taxExcludedPrice: '',
        taxAmount: '',
        supplier: '',
        memo: '',
      },
      'individual',
    );

    expect(costing.averageUnitCost).toBe(100);
    expect(costing.usedCost).toBe(1000);
    expect(costing.allocations).toHaveLength(1);
    expect(costing.allocations[0].allocatedCost).toBe(1000);

    stores.feedInventory.push({
      id: 'feed-out-1',
      transactionDate: '2026-09-10',
      feedName: '配合飼料',
      transactionType: '出庫',
      quantity: '10',
      unit: 'kg',
      bagWeightKg: '',
      totalWeightKg: '',
      unitPrice: '100',
      totalPrice: '1000',
      taxExcludedPrice: '',
      supplier: '',
      memo: '',
      costing,
      createdAt: '2026-09-10T00:00:00.000Z',
      updatedAt: '2026-09-10T00:00:00.000Z',
    });

    stores.calves.push({
      id: 'calf-1',
      calfNumber: '1001',
      earTag: '1001',
      name: 'テスト子牛',
      birthday: '2026-01-01',
      sex: '雌',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const feedCost = await getAnimalFeedCostTotal('calf', 'calf-1');
    expect(feedCost).toBe(1000);

    const productionCost = await getCalfProductionCostBreakdown('calf-1', '1001');
    expect(productionCost.feed).toBe(1000);
    expect(productionCost.total).toBe(1000);

    const sale = {
      id: 'sale-1',
      targetType: '子牛',
      targetNumber: '1001',
      targetName: 'テスト子牛',
      sex: '雌',
      birthday: '2026-01-01',
      motherName: '',
      calfId: 'calf-1',
      cattleId: '',
      calvingId: '',
      motherCowId: '',
      shippingPlanDate: '',
      shippingDate: '2026-09-20',
      saleDate: '2026-09-20',
      buyer: 'テスト市場',
      marketName: 'テスト市場',
      saleWeight: '300',
      salePrice: '100000',
      status: '販売済み',
      reason: '',
      memo: '',
      createdAt: '2026-09-20T00:00:00.000Z',
      updatedAt: '2026-09-20T00:00:00.000Z',
    } as any;

    stores.sales.push(sale);

    const snapshot = await getOrCreateSaleCostSnapshot(sale);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.productionCost).toBe(1000);
    expect(snapshot?.profit).toBe(99000);

    const savedSale = stores.sales.find((item) => item.id === 'sale-1');
    expect(savedSale?.productionCostSnapshot).toBe(1000);
    expect(savedSale?.profitSnapshot).toBe(99000);

    const monthly = await getMonthlyBalance();
    const september = monthly.rows.find((row) => row.yearMonth === '2026-09');

    expect(september).toBeDefined();
    expect(september?.salesTotalAmount).toBe(100000);
    expect(september?.salesProductionCostAmount).toBe(1000);
    expect(september?.salesProfitAmount).toBe(99000);
    expect(september?.salesSoldCount).toBe(1);
  });
  it('子牛群への5kg出庫を個体別飼料原価へ反映する', async () => {
    stores.feedInventory.push({
      id: 'feed-in-group',
      transactionDate: '2026-09-01',
      feedName: '腹づくり',
      transactionType: '入庫',
      quantity: '200',
      unit: 'kg',
      bagWeightKg: '',
      totalWeightKg: '',
      unitPrice: '57.6',
      totalPrice: '11520',
      taxExcludedPrice: '',
      supplier: '',
      memo: '',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    });

    vi.mocked(getFeedAllocationTargets).mockResolvedValueOnce(
      Array.from({ length: 6 }, (_, index) => ({
        animalType: 'calf' as const,
        animalId: `calf-${index + 1}`,
        earTag: `10${index + 1}`,
        animalName: `子牛${index + 1}`,
        ageDays: 17,
        weight: 1,
      })) as any,
    );

    const costing = await buildFeedCostingSnapshot(
      {
        transactionDate: '2026-09-25',
        feedName: '腹づくり',
        transactionType: '出庫',
        quantity: '5',
        unit: 'kg',
        bagWeightKg: '',
        totalWeightKg: '',
        unitPrice: '',
        totalPrice: '',
        taxExcludedPrice: '',
        taxAmount: '',
        supplier: '',
        memo: 'AIで記録から登録',
      },
      'calfGroup',
    );

    expect(costing.usedQuantity).toBe(5);
    expect(costing.usedCost).toBeCloseTo(288, 6);
    expect(costing.allocations).toHaveLength(6);
    expect(costing.allocations.reduce((sum, item) => sum + item.allocatedQuantity, 0)).toBeCloseTo(5, 6);
    expect(costing.allocations.reduce((sum, item) => sum + item.allocatedCost, 0)).toBeCloseTo(288, 6);

    stores.feedInventory.push({
      id: 'feed-out-group',
      transactionDate: '2026-09-25',
      feedName: '腹づくり',
      transactionType: '出庫',
      quantity: '5',
      unit: 'kg',
      bagWeightKg: '',
      totalWeightKg: '',
      unitPrice: String(costing.averageUnitCost),
      totalPrice: String(costing.usedCost),
      taxExcludedPrice: '',
      supplier: '',
      memo: 'AIで記録から登録',
      costing,
      createdAt: '2026-09-25T00:00:00.000Z',
      updatedAt: '2026-09-25T00:00:00.000Z',
    });

    const firstCalfFeedCost = await getAnimalFeedCostTotal('calf', 'calf-1');
    expect(firstCalfFeedCost).toBeCloseTo(48, 6);
  });

});
