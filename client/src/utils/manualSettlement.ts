/**
 * Manual market settlement reconciliation. Pure functions: no IndexedDB writes.
 * Existing expenses are linked by ID, NEVER copied, deleted or overwritten.
 */
export type SettlementDeduction = {
  label: string;
  amountYen: number;
  existingExpenseId?: string;
};
export type SettlementReview = {
  saleId: string;
  settlementNumber: string;
  grossYen: number;
  expectedNetYen: number;
  deductions: SettlementDeduction[];
  /** Tax/accounting adjustments may be signed, and aren't expense records. */
  adjustmentYen: number;
};
export type SettlementCheck = {
  calculatedNetYen: number;
  matchesStatement: boolean;
  newExpenses: SettlementDeduction[];
  linkedExistingExpenses: SettlementDeduction[];
  errors: string[];
};

export function reviewSettlement(input: SettlementReview): SettlementCheck {
  const errors: string[] = [];
  const whole = (n: number) => Number.isSafeInteger(n);
  if (!input.saleId.trim()) errors.push('販売記録の選択が必要です');
  if (!input.settlementNumber.trim()) errors.push('精算番号を入力してください');
  if (!whole(input.grossYen) || input.grossYen < 0) errors.push('販売金額が不正です');
  if (!whole(input.expectedNetYen) || input.expectedNetYen < 0) errors.push('差引精算額が不正です');
  if (!whole(input.adjustmentYen)) errors.push('調整額が不正です');
  const seenIds = new Set<string>();
  input.deductions.forEach((d, i) => {
    if (!d.label.trim() || !whole(d.amountYen) || d.amountYen < 0) {
      errors.push(`控除明細${i + 1}を確認してください`);
    }
    if (d.existingExpenseId) {
      if (seenIds.has(d.existingExpenseId)) errors.push('既存経費が重複選択されています');
      seenIds.add(d.existingExpenseId);
    }
  });
  const calculatedNetYen = input.grossYen -
    input.deductions.reduce((total, d) => total + d.amountYen, 0) +
    input.adjustmentYen;
  const matchesStatement = errors.length === 0 && calculatedNetYen === input.expectedNetYen;
  if (errors.length === 0 && !matchesStatement) {
    errors.push('差引精算額が一致しません。控除・税額調整を確認してください');
  }
  return {
    calculatedNetYen,
    matchesStatement,
    newExpenses: input.deductions.filter((d) => !d.existingExpenseId),
    linkedExistingExpenses: input.deductions.filter((d) => !!d.existingExpenseId),
    errors,
  };
}
