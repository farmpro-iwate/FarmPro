import { getExpensesList } from './expensesApi';
import { getSalesList, type SaleRecord } from './salesApi';
import { settlementProfit } from './settlementSellingFees';
import type { SaleCostSnapshot } from './saleCostSnapshot';

export type MonthlyBalanceRow = {
  yearMonth: string;
  salesTotalAmount: number;
  salesProductionCostAmount: number;
  salesProfitAmount: number;
  salesProfitNeedsReview?: boolean;
  expenseTotalAmount: number;
  balanceAmount: number;
  salesSoldCount: number;
  salesAverageAmount: number;
  salesAverageWeight: number;
  expenseCount: number;
  expenseFeedAmount: number;
  expenseMedicalAmount: number;
  expenseBreedingAmount: number;
  expenseLaborAmount: number;
  expenseOtherAmount: number;
};

export type MonthlyBalanceTotals = {
  salesTotalAmount: number;
  salesProductionCostAmount: number;
  salesProfitAmount: number;
  salesProfitNeedsReview?: boolean;
  expenseTotalAmount: number;
  balanceAmount: number;
  salesSoldCount: number;
  expenseCount: number;
  expenseFeedAmount: number;
  expenseMedicalAmount: number;
  expenseBreedingAmount: number;
  expenseLaborAmount: number;
  expenseOtherAmount: number;
};

export type MonthlyBalanceResponse = {
  rows: MonthlyBalanceRow[];
  totals: MonthlyBalanceTotals;
};

type MonthlyAccumulator = {
  salesTotalAmount: number;
  salesProductionCostAmount: number;
  salesProfitAmount: number;
  salesProfitNeedsReview: boolean;
  salesSoldCount: number;
  salesWeightTotal: number;
  salesWeightCount: number;
  expenseTotalAmount: number;
  expenseCount: number;
  expenseFeedAmount: number;
  expenseMedicalAmount: number;
  expenseBreedingAmount: number;
  expenseLaborAmount: number;
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
    salesProductionCostAmount: 0,
    salesProfitAmount: 0,
    salesProfitNeedsReview: false,
    salesSoldCount: 0,
    salesWeightTotal: 0,
    salesWeightCount: 0,
    expenseTotalAmount: 0,
    expenseCount: 0,
    expenseFeedAmount: 0,
    expenseMedicalAmount: 0,
    expenseBreedingAmount: 0,
    expenseLaborAmount: 0,
    expenseOtherAmount: 0,
  };
}

function expenseGroup(
  category: string,
): 'feed' | 'medical' | 'breeding' | 'labor' | 'other' {
  if (category === '飼料費' || category === '敷料費') {
    return 'feed';
  }

  if (category === '医薬品費' || category === '診療費') {
    return 'medical';
  }

  if (category === '種付け・繁殖費') {
    return 'breeding';
  }

  if (category === '人件費') {
    return 'labor';
  }

  return 'other';
}

export async function getMonthlyBalance(): Promise<MonthlyBalanceResponse> {
  const [sales, expenses] = await Promise.all([
    getSalesList(),
    getExpensesList({ requireCloudSync: true }),
  ]);

  const monthly = new Map<string, MonthlyAccumulator>();

  for (const sale of sales as SaleRecord[]) {
    const yearMonth = yearMonthFromDate(sale.saleDate);
    const salePrice = numberValue(sale.salePrice);
    const hasRealizedSale = Boolean(yearMonth) && salePrice > 0 && sale.status === '販売済み';
    if (!hasRealizedSale) continue;

    const row = monthly.get(yearMonth) ?? createAccumulator();
    const saleWeight = numberValue(sale.saleWeight);
    // Missing historical production costs are not zero-cost evidence. Never
    // present the sale price minus fees as verified profit without a fixed cost.
    const hasCostSnapshot = typeof sale.productionCostSnapshot === 'number' &&
      Number.isFinite(sale.productionCostSnapshot) && sale.productionCostSnapshot >= 0;
    const productionCost = numberValue(sale.productionCostSnapshot);
    const storedProfit = numberValue(sale.profitSnapshot);
    const fixedProfit = sale.profitSnapshot === undefined || sale.profitSnapshot === null
      ? salePrice - productionCost
      : storedProfit;
    const result = hasCostSnapshot ? settlementProfit(sale, expenses, {
      productionCost, profit: fixedProfit,
      breakdown: sale.productionCostBreakdownSnapshot as SaleCostSnapshot['breakdown'],
    }) : null;

    row.salesTotalAmount += salePrice;
    row.salesProductionCostAmount += productionCost;
    if (result.profit !== undefined) row.salesProfitAmount += result.profit;
    else row.salesProfitNeedsReview = true;
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
      case 'labor':
        row.expenseLaborAmount += amount;
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
      salesProductionCostAmount: row.salesProductionCostAmount,
      salesProfitAmount: row.salesProfitAmount,
      salesProfitNeedsReview: row.salesProfitNeedsReview,
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
      expenseLaborAmount: row.expenseLaborAmount,
      expenseOtherAmount: row.expenseOtherAmount,
    }))
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));

  const totals = rows.reduce<MonthlyBalanceTotals>(
    (result, row) => ({
      salesTotalAmount:
        result.salesTotalAmount + row.salesTotalAmount,
      salesProductionCostAmount:
        result.salesProductionCostAmount + row.salesProductionCostAmount,
      salesProfitAmount:
        result.salesProfitAmount + row.salesProfitAmount,
      salesProfitNeedsReview:
        Boolean(result.salesProfitNeedsReview || row.salesProfitNeedsReview),
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
      expenseLaborAmount:
        result.expenseLaborAmount + row.expenseLaborAmount,
      expenseOtherAmount:
        result.expenseOtherAmount + row.expenseOtherAmount,
    }),
    {
      salesTotalAmount: 0,
      salesProductionCostAmount: 0,
      salesProfitAmount: 0,
      salesProfitNeedsReview: false,
      expenseTotalAmount: 0,
      balanceAmount: 0,
      salesSoldCount: 0,
      expenseCount: 0,
      expenseFeedAmount: 0,
      expenseMedicalAmount: 0,
      expenseBreedingAmount: 0,
      expenseLaborAmount: 0,
      expenseOtherAmount: 0,
    },
  );

  return { rows, totals };
}
