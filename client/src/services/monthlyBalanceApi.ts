const API_BASE = 'http://localhost:4000/api/monthly-balance';

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

export async function getMonthlyBalance(): Promise<MonthlyBalanceResponse> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error('月別収支を取得できませんでした。');
  return res.json();
}
