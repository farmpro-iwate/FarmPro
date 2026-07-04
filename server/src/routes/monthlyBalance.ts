import { Router } from 'express';
import fs from 'fs';
import path from 'path';

export const monthlyBalanceRouter = Router();

const dataDir = path.join(process.cwd(), 'src', 'data');

type SaleRecord = {
  id?: string;
  status?: string;
  saleDate?: string;
  salePrice?: string;
  saleWeight?: string;
};

type ExpenseRecord = {
  id?: string;
  paymentDate?: string;
  category?: string;
  amount?: string;
};

type MonthlyBalanceRow = {
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

function readJsonFile<T>(fileName: string, fallback: T): T {
  const filePath = path.join(dataDir, fileName);

  try {
    if (!fs.existsSync(filePath)) return fallback;
    const text = fs.readFileSync(filePath, 'utf-8');
    if (!text.trim()) return fallback;
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function numberValue(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function yearMonthFromDate(dateText: string | undefined): string {
  if (!dateText) return '';
  const text = String(dateText);
  if (text.length >= 7) return text.slice(0, 7);
  return '';
}

function average(values: number[]): number {
  const valid = values.filter((v) => !Number.isNaN(v) && v > 0);
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((sum, v) => sum + v, 0) / valid.length);
}

function makeEmptyRow(yearMonth: string): MonthlyBalanceRow {
  return {
    yearMonth,
    salesTotalAmount: 0,
    expenseTotalAmount: 0,
    balanceAmount: 0,
    salesSoldCount: 0,
    salesAverageAmount: 0,
    salesAverageWeight: 0,
    expenseCount: 0,
    expenseFeedAmount: 0,
    expenseMedicalAmount: 0,
    expenseBreedingAmount: 0,
    expenseOtherAmount: 0
  };
}

monthlyBalanceRouter.get('/', (_req, res) => {
  const sales = readJsonFile<SaleRecord[]>('sales.json', []);
  const expenses = readJsonFile<ExpenseRecord[]>('expenses.json', []);

  const map = new Map<string, MonthlyBalanceRow>();
  const salesAmountMap = new Map<string, number[]>();
  const salesWeightMap = new Map<string, number[]>();

  function getRow(yearMonth: string) {
    if (!map.has(yearMonth)) {
      map.set(yearMonth, makeEmptyRow(yearMonth));
    }
    return map.get(yearMonth)!;
  }

  for (const sale of sales) {
    if (sale.status !== '販売済み') continue;

    const yearMonth = yearMonthFromDate(sale.saleDate);
    const salePrice = numberValue(sale.salePrice);

    if (!yearMonth || salePrice <= 0) continue;

    const row = getRow(yearMonth);
    row.salesTotalAmount += salePrice;
    row.salesSoldCount += 1;

    const weights = salesWeightMap.get(yearMonth) || [];
    const weight = numberValue(sale.saleWeight);
    if (weight > 0) weights.push(weight);
    salesWeightMap.set(yearMonth, weights);

    const amounts = salesAmountMap.get(yearMonth) || [];
    amounts.push(salePrice);
    salesAmountMap.set(yearMonth, amounts);
  }

  for (const expense of expenses) {
    const yearMonth = yearMonthFromDate(expense.paymentDate);
    const amount = numberValue(expense.amount);

    if (!yearMonth || amount <= 0) continue;

    const row = getRow(yearMonth);
    row.expenseTotalAmount += amount;
    row.expenseCount += 1;

    if (expense.category === '飼料費') {
      row.expenseFeedAmount += amount;
    } else if (expense.category === '診療費' || expense.category === '医薬品費') {
      row.expenseMedicalAmount += amount;
    } else if (expense.category === '種付け・繁殖費') {
      row.expenseBreedingAmount += amount;
    } else {
      row.expenseOtherAmount += amount;
    }
  }

  const rows = Array.from(map.values())
    .map((row) => {
      const saleAmounts = salesAmountMap.get(row.yearMonth) || [];
      const saleWeights = salesWeightMap.get(row.yearMonth) || [];

      return {
        ...row,
        balanceAmount: row.salesTotalAmount - row.expenseTotalAmount,
        salesAverageAmount: average(saleAmounts),
        salesAverageWeight: average(saleWeights)
      };
    })
    .sort((a, b) => b.yearMonth.localeCompare(a.yearMonth));

  const totals = rows.reduce(
    (acc, row) => {
      acc.salesTotalAmount += row.salesTotalAmount;
      acc.expenseTotalAmount += row.expenseTotalAmount;
      acc.balanceAmount += row.balanceAmount;
      acc.salesSoldCount += row.salesSoldCount;
      acc.expenseCount += row.expenseCount;
      acc.expenseFeedAmount += row.expenseFeedAmount;
      acc.expenseMedicalAmount += row.expenseMedicalAmount;
      acc.expenseBreedingAmount += row.expenseBreedingAmount;
      acc.expenseOtherAmount += row.expenseOtherAmount;
      return acc;
    },
    {
      salesTotalAmount: 0,
      expenseTotalAmount: 0,
      balanceAmount: 0,
      salesSoldCount: 0,
      expenseCount: 0,
      expenseFeedAmount: 0,
      expenseMedicalAmount: 0,
      expenseBreedingAmount: 0,
      expenseOtherAmount: 0
    }
  );

  res.json({
    rows,
    totals
  });
});

export default monthlyBalanceRouter;
