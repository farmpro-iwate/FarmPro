import { describe, expect, it } from 'vitest';
import type { FeedInventoryRecord } from '../services/feedInventoryApi';
import { summarizeMonth, type FeedOption } from './FeedInventoryStocktakePage';

function row(partial: Partial<FeedInventoryRecord>): FeedInventoryRecord {
  return {
    id: partial.id || crypto.randomUUID(),
    transactionDate: partial.transactionDate || '',
    feedName: partial.feedName || '配合飼料',
    transactionType: partial.transactionType || '入庫',
    quantity: partial.quantity || '0',
    unit: partial.unit || 'kg',
    bagWeightKg: partial.bagWeightKg || '',
    totalWeightKg: partial.totalWeightKg || '',
    unitPrice: partial.unitPrice || '',
    totalPrice: partial.totalPrice || '',
    supplier: partial.supplier || '',
    memo: partial.memo || '',
    costing: partial.costing,
    createdAt: partial.createdAt || '',
    updatedAt: partial.updatedAt || '',
  };
}

const option: FeedOption = {
  key: '配合飼料\u0000kg',
  feedName: '配合飼料',
  costUnit: 'kg',
};

describe('飼料在庫 月末棚卸', () => {
  it('記録済みの個別・牛群出庫を差し引いて未記録使用量だけを算出する', () => {
    const rows = [
      row({ transactionDate: '2026-08-31', transactionType: '入庫', quantity: '300' }),
      row({ transactionDate: '2026-09-05', transactionType: '入庫', quantity: '500' }),
      row({ transactionDate: '2026-09-10', transactionType: '出庫', quantity: '100' }),
      row({ transactionDate: '2026-09-20', transactionType: '出庫', quantity: '80' }),
    ];

    const summary = summarizeMonth(rows, option, '2026-09', '220');

    expect(summary).not.toBeNull();
    expect(summary?.opening).toBe(300);
    expect(summary?.inbound).toBe(500);
    expect(summary?.recordedOutbound).toBe(180);
    expect(summary?.stocktakeUsage).toBe(400);
    expect(summary?.totalMonthlyUsage).toBe(580);
  });

  it('同じ月を再棚卸すると、前回の棚卸出庫を含めて追加使用量が0になる', () => {
    const rows = [
      row({ transactionDate: '2026-08-31', transactionType: '入庫', quantity: '300' }),
      row({ transactionDate: '2026-09-05', transactionType: '入庫', quantity: '500' }),
      row({ transactionDate: '2026-09-10', transactionType: '出庫', quantity: '180' }),
      row({ transactionDate: '2026-09-30', transactionType: '出庫', quantity: '400', memo: '月末棚卸 2026-09｜繁殖牛群' }),
    ];

    const summary = summarizeMonth(rows, option, '2026-09', '220');

    expect(summary).not.toBeNull();
    expect(summary?.recordedOutbound).toBe(580);
    expect(summary?.stocktakeUsage).toBe(0);
    expect(summary?.totalMonthlyUsage).toBe(580);
  });

  it('実在庫が帳簿在庫を上回る場合は負の差異を返して確定を止められる', () => {
    const rows = [
      row({ transactionDate: '2026-08-31', transactionType: '入庫', quantity: '100' }),
      row({ transactionDate: '2026-09-05', transactionType: '入庫', quantity: '50' }),
    ];

    const summary = summarizeMonth(rows, option, '2026-09', '170');

    expect(summary).not.toBeNull();
    expect(summary?.expectedBeforeStocktake).toBe(150);
    expect(summary?.stocktakeUsage).toBe(-20);
  });

  it('袋単位の記録はkgへ正規化して月末使用量を計算する', () => {
    const rows = [
      row({
        transactionDate: '2026-08-31',
        transactionType: '入庫',
        quantity: '10',
        unit: '袋',
        bagWeightKg: '20',
        totalWeightKg: '200',
      }),
      row({
        transactionDate: '2026-09-05',
        transactionType: '入庫',
        quantity: '5',
        unit: '袋',
        bagWeightKg: '20',
        totalWeightKg: '100',
      }),
    ];

    const summary = summarizeMonth(rows, option, '2026-09', '180');

    expect(summary).not.toBeNull();
    expect(summary?.opening).toBe(200);
    expect(summary?.inbound).toBe(100);
    expect(summary?.stocktakeUsage).toBe(120);
  });
});
