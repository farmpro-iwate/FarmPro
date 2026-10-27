import type { ExpenseRecord } from './expensesApi';
import type { SaleRecord } from './salesApi';

/** Read-only selling expense total. Excluded from production costs. */
export function settlementSellingFees(sale: SaleRecord, expenses: ExpenseRecord[]): number {
  if (sale.status !== '販売済み') return 0;
  const animalType = sale.targetType === '子牛' ? 'calf' : sale.targetType === '成牛' ? 'cattle' : null;
  const animalId = animalType === 'calf' ? sale.calfId : animalType === 'cattle' ? sale.cattleId : '';
  const tag = String(sale.targetNumber || '').trim();
  if (!animalType || !animalId || !tag) return 0;
  const seen = new Set<string>();
  return expenses.reduce((sum, expense) => {
    if (seen.has(expense.id)) return sum;
    seen.add(expense.id);
    if (!/^販売精算\s+/.test(expense.memo || '') ||
        expense.animalType !== animalType ||
        String(expense.target || '').trim() !== tag ||
        String(expense.animalEarTag || '').trim() !== tag ||
        (expense.animalId && expense.animalId !== animalId)) return sum;
    const amount = Number(expense.amount);
    return Number.isSafeInteger(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
}

/** The persisted sale-cost snapshot is immutable: apply deductions only to display. */
export function displayedSaleProfit(fixedProfit: number, sellingFees: number): number {
  return Math.round(fixedProfit - sellingFees);
}
