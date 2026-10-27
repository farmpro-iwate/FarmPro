import { describe, expect, it } from 'vitest';
import { displayedSaleProfit, settlementSellingFees, settlementProfit } from './settlementSellingFees';
import type { SaleRecord } from './salesApi';
import type { ExpenseRecord } from './expensesApi';
import type { SaleCostSnapshot } from './saleCostSnapshot';

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

describe('legacy settlement compatibility: never infer historical costs', () => {
  it('does not deduct legacy settlement expenses a second time', () => {
    const legacyExpense = { ...expense, id: 'legacy-1', memo: '精算No.OLD-001 / 牛名 / 耳標TEST5954' };
    expect(settlementSellingFees(sale, [legacyExpense])).toBe(0);
    expect(displayedSaleProfit(290000, settlementSellingFees(sale, [legacyExpense]))).toBe(290000);
  });

  it('counts only explicit new cloud settlement expenses in mixed historical records', () => {
    const legacyExpense = { ...expense, id: 'legacy-1', memo: '精算No.OLD-001 / 牛名 / 耳標TEST5954' };
    expect(settlementSellingFees(sale, [legacyExpense, expense])).toBe(10000);
  });
});

describe('formal settlement profit and fixed-cost provenance', () => {
  const formalSale = { ...sale, id: 'sale-1', syncRecordId: 'sale:sale-1' };
  const formalExpense: ExpenseRecord = {
    ...expense, syncRecordId: 'settlement-fee-1', settlementSaleId: 'sale:sale-1',
    settlementNumber: 'S001', settlementExpenseKind: 'created',
  };
  const fixed: SaleCostSnapshot = { productionCost: 200000, profit: 300000 };
  const breakdown = (ids: string[]) => ({
    acquisition: 0, feed: 0, medical: 0, breeding: 0, other: 200000,
    farmCommon: 0, total: 200000, includedExpenseIds: ids,
    includedExpenseAmounts: Object.fromEntries(ids.map((id) => [id, 10000])),
  });

  it('keeps the fixed cost and profit unchanged while displaying 290000', () => {
    const before = JSON.stringify(fixed);
    expect(settlementProfit(formalSale, [formalExpense, formalExpense], fixed)).toEqual({
      sellingFees: 10000, additionalFees: 10000, profit: 290000, requiresReview: false,
    });
    expect(JSON.stringify(fixed)).toBe(before);
  });

  it('uses the stable sale key on a second device and never another sale of the same calf', () => {
    const secondDeviceSale = { ...formalSale, id: 'different-local-sale', calfId: 'local-calf-12' };
    expect(settlementProfit(secondDeviceSale, [formalExpense], fixed).profit).toBe(290000);
    expect(settlementProfit({ ...secondDeviceSale, syncRecordId: 'sale:other-sale' }, [formalExpense], fixed).profit).toBe(300000);
  });

  it('uses an exact cloud sale association even if a historical sale lacks a local animal link', () => {
    expect(settlementProfit({ ...formalSale, calfId: undefined }, [formalExpense], fixed).profit).toBe(290000);
  });

  it('counts one cloud expense once even if local IDs differ', () => {
    expect(settlementProfit(formalSale, [formalExpense, { ...formalExpense, id: 'other-local-id' }], fixed).profit).toBe(290000);
  });

  it('does not deduct a linked fee already included in the original snapshot again', () => {
    const withFee = { productionCost: 210000, profit: 290000, breakdown: breakdown(['settlement-fee-1']) };
    expect(settlementProfit(formalSale, [{ ...formalExpense, settlementExpenseKind: 'linked' }], withFee)).toMatchObject({
      additionalFees: 0, sellingFees: 10000, profit: 290000, requiresReview: false,
    });
  });

  it('deducts a later linked fee when the snapshot proves it was not included', () => {
    const beforeFee = { ...fixed, breakdown: breakdown(['expense:earlier-cost']) };
    expect(settlementProfit(formalSale, [{ ...formalExpense, settlementExpenseKind: 'linked' }], beforeFee).profit).toBe(290000);
  });

  it('adjusts only the fee amount difference since the frozen snapshot, in either direction', () => {
    const included = { ...fixed, breakdown: breakdown(['settlement-fee-1']) };
    expect(settlementProfit(formalSale, [{ ...formalExpense, amount: '15000', settlementExpenseKind: 'linked' }], included))
      .toMatchObject({ additionalFees: 5000, profit: 295000, requiresReview: false });
    expect(settlementProfit(formalSale, [{ ...formalExpense, amount: '6000', settlementExpenseKind: 'linked' }], included))
      .toMatchObject({ additionalFees: -4000, profit: 304000, requiresReview: false });
  });

  it('does not infer a historical included amount from an ID alone', () => {
    const idsOnly = { ...fixed, breakdown: { ...breakdown(['settlement-fee-1']), includedExpenseAmounts: undefined } };
    expect(settlementProfit(formalSale, [{ ...formalExpense, settlementExpenseKind: 'linked' }], idsOnly).requiresReview).toBe(true);
  });

  it('withholds historical linked profit when the frozen snapshot has no provenance', () => {
    expect(settlementProfit(formalSale, [{ ...formalExpense, settlementExpenseKind: 'linked' }], fixed)).toMatchObject({
      profit: undefined, requiresReview: true,
    });
    expect(fixed).toEqual({ productionCost: 200000, profit: 300000 });
  });

  it('does not infer a sale association or past cost for memo-only legacy fees', () => {
    expect(settlementProfit(formalSale, [expense], fixed)).toMatchObject({ profit: undefined, requiresReview: true });
  });

  it('withholds a malformed or contradictory exact-sale fee instead of omitting it silently', () => {
    expect(settlementProfit(formalSale, [{ ...formalExpense, animalEarTag: 'OTHER' }], fixed).requiresReview).toBe(true);
    expect(settlementProfit(formalSale, [{ ...formalExpense, amount: '10000.5' }], fixed).requiresReview).toBe(true);
  });
});
