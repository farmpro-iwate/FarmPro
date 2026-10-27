import { describe, expect, it } from 'vitest';
import { displayedSaleProfit, settlementSellingFees } from './settlementSellingFees';
import type { SaleRecord } from './salesApi';
import type { ExpenseRecord } from './expensesApi';

const sale = { status: '販売済み', targetType: '子牛', calfId: 'calf-1', targetNumber: 'TEST5954' } as SaleRecord;
const expense = { id: 'fee-1', amount: '10000', target: 'TEST5954',
  animalType: 'calf', animalId: 'calf-1', animalEarTag: 'TEST5954',
  memo: '販売精算 TEST5954-001' } as ExpenseRecord;

describe('read-only selling expense calculation', () => {
  it('counts a verified settlement deduction once', () => {
    expect(settlementSellingFees(sale, [expense, expense])).toBe(10000);
  });
  it('does not count different animals or non-settlement expenses', () => {
    expect(settlementSellingFees(sale, [
      { ...expense, id: 'other-calf', animalId: 'calf-2' },
      { ...expense, id: 'wrong-tag', animalEarTag: 'OTHER' },
      { ...expense, id: 'feed', memo: '配合飼料' },
    ])).toBe(0);
  });
  it('requires a real animal link and sold status', () => {
    expect(settlementSellingFees({ ...sale, calfId: '' }, [expense])).toBe(0);
    expect(settlementSellingFees({ ...sale, status: '出荷予定' }, [expense])).toBe(0);
  });
});

describe('profit read-only display', () => {
  it('subtracts a settlement deduction once from fixed snapshot profit', () => {
    const fixed = 300000;
    expect(displayedSaleProfit(fixed, settlementSellingFees(sale, [expense, expense]))).toBe(290000);
    expect(fixed).toBe(300000);
  });
});

describe('nonzero production cost and existing sale compatibility', () => {
  it('keeps 200,000 yen production cost unchanged and shows 290,000 yen net profit', () => {
    const productionCost = 200000;
    const saleAmount = 500000;
    const fixedProfit = saleAmount - productionCost;
    const fees = settlementSellingFees(sale, [expense, expense]);
    expect(fees).toBe(10000);
    expect(displayedSaleProfit(fixedProfit, fees)).toBe(290000);
    expect(productionCost).toBe(200000);
  });

  it('preserves previous profit where no settlement deductions exist', () => {
    expect(displayedSaleProfit(300000, settlementSellingFees(sale, []))).toBe(300000);
  });

  it('does not count farm-wide or another calf deductions', () => {
    expect(settlementSellingFees(sale, [
      { ...expense, id: 'farm-wide', animalType: undefined, animalId: undefined },
      { ...expense, id: 'another-calf', animalEarTag: 'TEST9999', target: 'TEST9999' },
    ])).toBe(0);
  });
});
