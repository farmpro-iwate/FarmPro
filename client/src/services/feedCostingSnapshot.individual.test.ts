import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFeedCostingSnapshot } from './feedCostingSnapshot';
import { getFeedInventoryList } from './feedInventoryApi';
import { getFeedAllocationTargets } from './feedAllocationTargets';

vi.mock('./feedInventoryApi', () => ({
  getFeedInventoryList: vi.fn(),
}));

vi.mock('./feedAllocationTargets', () => ({
  getFeedAllocationTargets: vi.fn(),
}));

describe('個体別飼料原価按分', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFeedInventoryList).mockResolvedValue([
      {
        id: 'in-1',
        transactionDate: '2026-09-23',
        feedName: 'テスト原価飼料',
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
        createdAt: '2026-09-23T00:00:00.000Z',
        updatedAt: '2026-09-23T00:00:00.000Z',
      },
    ] as any);
  });

  it('選択した1頭に出庫量と原価を100%紐付ける', async () => {
    const snapshot = await buildFeedCostingSnapshot(
      {
        transactionDate: '2026-09-23',
        feedName: 'テスト原価飼料',
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
      {
        animalType: 'cattle',
        animalId: '1',
        earTag: '7358',
        animalName: 'はなみつ',
        weight: 1,
      },
    );

    expect(snapshot.targetType).toBe('individual');
    expect(snapshot.allocationMethod).toBe('individual');
    expect(snapshot.usedQuantity).toBe(10);
    expect(snapshot.usedCost).toBe(1000);
    expect(snapshot.allocations).toEqual([
      expect.objectContaining({
        animalType: 'cattle',
        animalId: '1',
        earTag: '7358',
        animalName: 'はなみつ',
        allocatedQuantity: 10,
        allocatedCost: 1000,
      }),
    ]);
    expect(getFeedAllocationTargets).not.toHaveBeenCalled();
  });

  it('個体未選択では登録できない', async () => {
    vi.mocked(getFeedAllocationTargets).mockResolvedValue([]);

    await expect(buildFeedCostingSnapshot(
      {
        transactionDate: '2026-09-23',
        feedName: 'テスト原価飼料',
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
    )).rejects.toThrow('個体を選択してください。');
  });
});
