import type { ExpenseRecord } from './expensesApi';
import type { SaleRecord } from './salesApi';
import type { SaleCostSnapshot } from './saleCostSnapshot';

function matchingSettlementExpenses(sale: SaleRecord, expenses: ExpenseRecord[]): ExpenseRecord[] {
  if (sale.status !== '販売済み') return [];
  const animalType = sale.targetType === '子牛' ? 'calf' : sale.targetType === '成牛' ? 'cattle' : null;
  const animalId = animalType === 'calf' ? sale.calfId : animalType === 'cattle' ? sale.cattleId : '';
  const tag = String(sale.targetNumber || '').trim();
  if (!animalType || !tag) return [];
  const saleId = sale.syncRecordId || `sale:${sale.id}`;
  const seen = new Set<string>();
  return expenses.filter((expense) => {
    const expenseId = expense.syncRecordId || `expense:${expense.id}`;
    if (seen.has(expenseId)) return false;
    // The server's exact sale key survives different device-local animal IDs.
    // A different sale of the same animal must never inherit this deduction.
    if (expense.settlementSaleId) {
      if (expense.settlementSaleId !== saleId) return false;
    } else if (!animalId || !/^販売精算\s+/.test(expense.memo || '') ||
        expense.animalType !== animalType ||
        String(expense.target || '').trim() !== tag ||
        String(expense.animalEarTag || '').trim() !== tag ||
        (expense.animalId && expense.animalId !== animalId)) return false;
    seen.add(expenseId);
    return true;
  });
}

/** Read-only total for display. Profit additionally requires cost provenance. */
export function settlementSellingFees(sale: SaleRecord, expenses: ExpenseRecord[]): number {
  return matchingSettlementExpenses(sale, expenses).reduce((sum, expense) => {
    const amount = Number(expense.amount);
    return Number.isSafeInteger(amount) && amount >= 0 ? sum + amount : sum;
  }, 0);
}

export type SettlementProfit = {
  sellingFees: number;
  additionalFees: number;
  profit: number | undefined;
  requiresReview: boolean;
};

/**
 * Apply each deduction once without modifying the stored cost/profit snapshot.
 * New formal expenses are excluded from production costs at source. For a linked
 * pre-existing expense, only the exact IDs recorded with the cost calculation
 * prove whether it has already been deducted. Old snapshots remain unmodified.
 */
export function settlementProfit(
  sale: SaleRecord,
  expenses: ExpenseRecord[],
  snapshot: SaleCostSnapshot | undefined,
): SettlementProfit {
  const matching = matchingSettlementExpenses(sale, expenses);
  const includedIds = snapshot?.breakdown?.includedExpenseIds;
  const includedAmounts = snapshot?.breakdown?.includedExpenseAmounts;
  let sellingFees = 0;
  let additionalFees = 0;
  let requiresReview = false;
  for (const expense of matching) {
    const amount = Number(expense.amount);
    const animalType = sale.targetType === '子牛' ? 'calf' : 'cattle';
    const identifiers = [expense.target, expense.animalEarTag].map((v) => (v || '').trim()).filter(Boolean);
    if (!/^\d+$/.test(expense.amount) || !Number.isSafeInteger(amount) || amount < 0 ||
        expense.animalType !== animalType || identifiers.length === 0 ||
        identifiers.some((id) => id !== sale.targetNumber.trim())) {
      requiresReview = true;
      continue;
    }
    sellingFees += amount;
    if (!expense.settlementSaleId || !expense.settlementExpenseKind) {
      // Memo-only legacy records have neither an exact sale nor cost provenance.
      requiresReview = true;
      continue;
    }
    const expenseId = expense.syncRecordId || `expense:${expense.id}`;
    if (includedIds?.includes(expenseId)) {
      const previousAmount = includedAmounts && Object.prototype.hasOwnProperty.call(includedAmounts, expenseId)
        ? includedAmounts[expenseId] : undefined;
      if (previousAmount === undefined || !Number.isSafeInteger(previousAmount) || previousAmount < 0) {
        requiresReview = true;
        continue;
      }
      additionalFees += amount - previousAmount;
      continue;
    }
    if (expense.settlementExpenseKind === 'linked' && includedIds === undefined) {
      requiresReview = true;
      continue;
    }
    additionalFees += amount;
  }
  if (!Number.isSafeInteger(sellingFees) || !Number.isSafeInteger(additionalFees)) requiresReview = true;
  return {
    sellingFees,
    additionalFees,
    requiresReview,
    profit: !requiresReview && snapshot && Number.isFinite(snapshot.profit)
      ? displayedSaleProfit(snapshot.profit, additionalFees) : undefined,
  };
}

/** The persisted sale-cost snapshot is immutable: apply deductions only to display. */
export function displayedSaleProfit(fixedProfit: number, sellingFees: number): number {
  return Math.round(fixedProfit - sellingFees);
}
