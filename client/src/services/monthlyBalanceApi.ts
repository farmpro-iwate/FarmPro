import { getAllRecords } from '../storage/repository';
import type { ExpenseRecord } from './expensesApi';
import type { SaleRecord } from './salesApi';

export type MonthlyBalanceRow = {
  yearMonth: string;
  salesTotalAmount: number;
  expenseTotalAmount: number;
  balanceAmount: number;
  salesSoldCount: number;
  salesAverageAmount: number;
  salesAverageWeight: number;
  expenseCount: number;
  expenseFeedAmount: number;
  expenseMedicalAmount: number;
  expenseBreedingAmount: number;
  expenseOtherAmount: number;
};

export type MonthlyBalanceTotals = {
  salesTotalAmount: number;
  expenseTotalAmount: number;
  balanceAmount: number;
  salesSoldCount: number;
  expenseCount: number;
  expenseFeedAmount: number;
  expenseMedicalAmount: number;
  expenseBreedingAmount: number;
  expenseOtherAmount: number;
};

export type MonthlyBalanceResponse = {
  rows: MonthlyBalanceRow[];
  totals: MonthlyBalanceTotals;
};

type MonthlyAccumulator = {
  salesTotalAmount: number;
  salesSoldCount: number;
  salesWeightTotal: number;
  salesWeightCount: number;
  expenseTotalAmount: number;
  expenseCount: number;
  expenseFeedAmount: number;
  expenseMedicalAmount: number;
  expenseBreedingAmount: number;
  expenseOtherAmount: number;
};

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function yearMonthFromDate(value: unknown): string {
  if (typeof value !== 'string') return '';

  const match = value.match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function createAccumulator(): MonthlyAccumulator {
  return {
    salesTotalAmount: 0,
    salesSoldCount: 0,
    salesWeightTotal: 0,
    salesWeightCount: 0,
    expenseTotalAmount: 0,
    expenseCount: 0,
    expenseFeedAmount: 0,
    expenseMedicalAmount: 0,
    expenseBreedingAmount: 0,
    expenseOtherAmount: 0,
  };
}

function expenseGroup(
  category: string,
): 'feed' | 'medical' | 'breeding' | 'other' {
  if (category === '飼料費' || category === '敷料費') {
    return 'feed';
  }

  if (category === '医薬品費' || category === '診療費') {
    return 'medical';
  }

  if (category === '種付け・繁殖費') {
    return 'breeding';
  }

  return 'other';
}

export async function getMonthlyBalance(): Promise<MonthlyBalanceResponse> {
  const [sales, expenses] = await Promise.all([
    getAllRecords<SaleRecord>('sales'),
    getAllRecords<ExpenseRecord>('expenses'),
  ]);

  const monthly = new Map<string, MonthlyAccumulator>();

  for (const sale of sales) {
    const yearMonth = yearMonthFromDate(sale.saleDate);
    if (!yearMonth || sale.status !== '販売済み') continue;

    const row = monthly.get(yearMonth) ?? createAccumulator();
    const salePrice = numberValue(sale.salePrice);
    const saleWeight = numberValue(sale.saleWeight);

    row.salesTotalAmount += salePrice;
    row.salesSoldCount += 1;

    if (saleWeight > 0) {
      row.salesWeightTotal += saleWeight;
      row.salesWeightCount += 1;
    }

    monthly.set(yearMonth, row);
  }

  for (const expense of expenses) {
    const yearMonth = yearMonthFromDate(expense.paymentDate);
    if (!yearMonth) continue;

    const row = monthly.get(yearMonth) ?? createAccumulator();
    const amount = numberValue(expense.amount);

    row.expenseTotalAmount += amount;
    row.expenseCount += 1;

    switch (expenseGroup(expense.category)) {
      case 'feed':
        row.expenseFeedAmount += amount;
        break;
      case 'medical':
        row.expenseMedicalAmount += amount;
        break;
      case 'breeding':
        row.expenseBreedingAmount += amount;
        break;
      default:
        row.expenseOtherAmount += amount;
        break;
    }

    monthly.set(yearMonth, row);
  }

  const rows: MonthlyBalanceRow[] = Array.from(monthly.entries())
    .map(([yearMonth, row]) => ({
      yearMonth,
      salesTotalAmount: row.salesTotalAmount,
      expenseTotalAmount: row.expenseTotalAmount,
      balanceAmount: row.salesTotalAmount - row.expenseTotalAmount,
      salesSoldCount: row.salesSoldCount,
      salesAverageAmount:
        row.salesSoldCount > 0
          ? Math.round(row.salesTotalAmount / row.salesSoldCount)
          : 0,
      salesAverageWeight:
        row.salesWeightCount > 0
          ? Math.round((row.salesWeightTotal / row.salesWeightCount) * 10) / 10
          : 0,
      expenseCount: row.expenseCount,
      expenseFeedAmount: row.expenseFeedAmount,
      expenseMedicalAmount: row.expenseMedicalAmount,
      expenseBreedingAmount: row.expenseBreedingAmount,
      expenseOtherAmount: row.expenseOtherAmount,
    }))
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));

  const totals = rows.reduce<MonthlyBalanceTotals>(
    (result, row) => ({
      salesTotalAmount:
        result.salesTotalAmount + row.salesTotalAmount,
      expenseTotalAmount:
        result.expenseTotalAmount + row.expenseTotalAmount,
      balanceAmount:
        result.balanceAmount + row.balanceAmount,
      salesSoldCount:
        result.salesSoldCount + row.salesSoldCount,
      expenseCount:
        result.expenseCount + row.expenseCount,
      expenseFeedAmount:
        result.expenseFeedAmount + row.expenseFeedAmount,
      expenseMedicalAmount:
        result.expenseMedicalAmount + row.expenseMedicalAmount,
      expenseBreedingAmount:
        result.expenseBreedingAmount + row.expenseBreedingAmount,
      expenseOtherAmount:
        result.expenseOtherAmount + row.expenseOtherAmount,
    }),
    {
      salesTotalAmount: 0,
      expenseTotalAmount: 0,
      balanceAmount: 0,
      salesSoldCount: 0,
      expenseCount: 0,
      expenseFeedAmount: 0,
      expenseMedicalAmount: 0,
      expenseBreedingAmount: 0,
      expenseOtherAmount: 0,
    },
  );

  return { rows, totals };
}
