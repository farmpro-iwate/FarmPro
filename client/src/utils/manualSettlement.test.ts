import { describe, expect, it } from 'vitest';
import { reviewSettlement } from './manualSettlement';

const base = {
  saleId: 'sale-existing',
  settlementNumber: 'statement-001',
  grossYen: 712800,
  expectedNetYen: 663597,
  adjustmentYen: 0,
  deductions: [{ label: '既存ワクチン費', amountYen: 3640, existingExpenseId: 'expense-existing' }, { label: 'その他控除', amountYen: 45563 }],
};

describe('manual settlement review', () => {
  it('matches and reuses an existing expense rather than creating it again', () => {
    const result = reviewSettlement(base);
    expect(result.matchesStatement).toBe(true);
    expect(result.linkedExistingExpenses).toHaveLength(1);
    expect(result.newExpenses).toHaveLength(1);
    expect(result.calculatedNetYen).toBe(663597);
  });
  it('warns on a mismatch', () => {
    const result = reviewSettlement({ ...base, expectedNetYen: 663598 });
    expect(result.matchesStatement).toBe(false);
    expect(result.errors).toContain('差引精算額が一致しません。控除・税額調整を確認してください');
  });
  it('rejects linking the same expense twice', () => {
    const result = reviewSettlement({ ...base, deductions: [
      { label: 'A', amountYen: 100, existingExpenseId: 'same' },
      { label: 'B', amountYen: 100, existingExpenseId: 'same' },
    ] });
    expect(result.errors).toContain('既存経費が重複選択されています');
  });
  it('does not treat a signed adjustment as an expense', () => {
    const result = reviewSettlement({ ...base, adjustmentYen: -200, expectedNetYen: 663397 });
    expect(result.matchesStatement).toBe(true);
    expect(result.newExpenses).toHaveLength(1);
  });
  it('rejects missing existing expense references', () => {
    const result = reviewSettlement({ ...base, existingExpenses: [] });
    expect(result.matchesStatement).toBe(false);
    expect(result.errors).toContain('既存経費が見つかりません。再確認してください');
  });
  it('rejects mismatching amounts for linked expenses', () => {
    const result = reviewSettlement({ ...base, existingExpenses: [{ id: 'expense-existing', amount: '3600' }] });
    expect(result.matchesStatement).toBe(false);
    expect(result.errors).toContain('既存経費の金額が控除明細と一致しません');
  });
  it('accepts a verified linked expense', () => {
    const result = reviewSettlement({ ...base, existingExpenses: [{ id: 'expense-existing', amount: '3640' }] });
    expect(result.matchesStatement).toBe(true);
  });
});
