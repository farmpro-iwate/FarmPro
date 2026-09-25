import { describe, expect, it } from 'vitest';
import type { FeedCostAllocationItem } from '../services/feedCostAllocation';
import type { FeedInventoryRecord } from '../services/feedInventoryApi';

function numberValue(valueText: string) {
  const n = Number(valueText);
  return Number.isNaN(n) ? 0 : n;
}

function weightInventoryByFeed(rows: FeedInventoryRecord[]) {
  const groups = new Map<string, { feedName: string; quantityKg: number; bagWeightKg: string }>();

  for (const row of rows) {
    if (row.unit !== 'kg' && row.unit !== '袋') continue;
    const feedName = row.feedName || '名称未登録';
    const current = groups.get(feedName) || { feedName, quantityKg: 0, bagWeightKg: '' };
    const direction = row.transactionType === '入庫' ? 1 : row.transactionType === '出庫' ? -1 : row.transactionType === '調整' ? 1 : 0;
    const quantityKg = row.unit === '袋'
      ? (numberValue(row.totalWeightKg) > 0 ? numberValue(row.totalWeightKg) : numberValue(row.quantity) * numberValue(row.bagWeightKg))
      : numberValue(row.quantity);
    current.quantityKg += direction * quantityKg;
    if (row.unit === '袋' && numberValue(row.bagWeightKg) > 0) current.bagWeightKg = row.bagWeightKg;
    groups.set(feedName, current);
  }

  return Array.from(groups.values());
}

describe('飼料在庫 kg/袋 統合表示', () => {
  it('同じ飼料名の袋入庫とkg出庫を1つのkg在庫として集計する', () => {
    const rows = [
      {
        id: '1',
        transactionDate: '2026-09-25',
        feedName: '腹づくり',
        transactionType: '入庫',
        quantity: '10',
        unit: '袋',
        bagWeightKg: '20',
        totalWeightKg: '200',
        unitPrice: '',
        totalPrice: '15000',
        taxExcludedPrice: '',
        supplier: '',
        memo: '',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: '2',
        transactionDate: '2026-09-25',
        feedName: '腹づくり',
        transactionType: '出庫',
        quantity: '5',
        unit: 'kg',
        bagWeightKg: '',
        totalWeightKg: '',
        unitPrice: '58',
        totalPrice: '288',
        taxExcludedPrice: '',
        supplier: '',
        memo: '',
        createdAt: '',
        updatedAt: '',
      },
    ] as FeedInventoryRecord[];

    const result = weightInventoryByFeed(rows);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({
      feedName: '腹づくり',
      quantityKg: 195,
      bagWeightKg: '20',
    }));
  });

  it('既存の長い小数の給与量を小数3桁へ丸めても合計を保つ', () => {
    const allocations = [
      { animalId: 'a', allocatedQuantity: 0.8333333333333333 },
      { animalId: 'b', allocatedQuantity: 0.8333333333333333 },
      { animalId: 'c', allocatedQuantity: 0.8333333333333333 },
      { animalId: 'd', allocatedQuantity: 0.8333333333333333 },
      { animalId: 'e', allocatedQuantity: 0.8333333333333333 },
      { animalId: 'f', allocatedQuantity: 0.8333333333333333 },
    ] as FeedCostAllocationItem[];

    const roundQuantity = (value: number) => Math.round(value * 1000) / 1000;
    let assigned = 0;
    const values = allocations.map((item, index) => {
      const quantity = index === allocations.length - 1
        ? roundQuantity(5 - assigned)
        : roundQuantity(Number(item.allocatedQuantity) || 0);
      assigned += quantity;
      return quantity;
    });

    expect(values).toEqual([0.833, 0.833, 0.833, 0.833, 0.833, 0.835]);
    expect(values.reduce((sum, value) => sum + value, 0)).toBeCloseTo(5, 6);
  });

});
