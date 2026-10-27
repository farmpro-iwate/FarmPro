import { describe, expect, it } from 'vitest';
import { settlementSellingFees } from './settlementSellingFees';
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
