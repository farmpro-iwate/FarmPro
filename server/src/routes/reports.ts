import { Router } from 'express';
import fs from 'fs';
import path from 'path';

export const reportsRouter = Router();

const dataDir = path.join(process.cwd(), 'src', 'data');

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

function average(values: number[]): number {
  const valid = values.filter((v) => !Number.isNaN(v) && v > 0);
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((sum, v) => sum + v, 0) / valid.length);
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function makeCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '\ufeff';
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
  ];
  return '\ufeff' + lines.join('\r\n');
}

function yearMonthFromDate(dateText: string | undefined): string {
  if (!dateText) return '';
  const text = String(dateText);
  if (text.length >= 7) return text.slice(0, 7);
  return '';
}

function yearFromDate(dateText: string | undefined): string {
  if (!dateText) return '';
  const text = String(dateText);
  if (text.length >= 4) return text.slice(0, 4);
  return '';
}

reportsRouter.get('/summary', (_req, res) => {
  const cattle = readJsonFile<any[]>('cattle.json', []);
  const calves = readJsonFile<any[]>('calves.json', []);
  const breedings = readJsonFile<any[]>('breedings.json', []);
  const vaccines = readJsonFile<any[]>('vaccines.json', []);
  const blv = readJsonFile<any[]>('blv.json', []);
  const schedules = readJsonFile<any[]>('schedules.json', []);
  const treatments = readJsonFile<any[]>('treatments.json', []);
  const sales = readJsonFile<any[]>('sales.json', []);
  const expenses = readJsonFile<any[]>('expenses.json', []);

  const today = new Date();
  const thisYear = String(today.getFullYear());
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const in30Days = new Date();
  in30Days.setDate(today.getDate() + 30);

  function isUpcoming(dateText: string) {
    if (!dateText) return false;
    const d = new Date(dateText);
    if (Number.isNaN(d.getTime())) return false;
    return d >= today && d <= in30Days;
  }

  function isOverdue(dateText: string) {
    if (!dateText) return false;
    const d = new Date(dateText);
    if (Number.isNaN(d.getTime())) return false;
    return d < today;
  }

  const salesSold = sales.filter((row) => row.status === '販売済み');
  const salesPlan = sales.filter((row) => row.status === '出荷予定');
  const salesShipped = sales.filter((row) => row.status === '出荷済み');
  const salesCanceled = sales.filter((row) => row.status === '取消');

  const salePrices = salesSold.map((row) => numberValue(row.salePrice)).filter((v) => v > 0);
  const saleWeights = salesSold.map((row) => numberValue(row.saleWeight)).filter((v) => v > 0);
  const salesTotalAmount = salePrices.reduce((sum, v) => sum + v, 0);

  const expenseAmounts = expenses.map((row) => numberValue(row.amount)).filter((v) => v > 0);
  const expenseTotalAmount = expenseAmounts.reduce((sum, v) => sum + v, 0);

  const expenseFeedAmount = expenses
    .filter((row) => row.category === '飼料費')
    .reduce((sum, row) => sum + numberValue(row.amount), 0);

  const expenseMedicalAmount = expenses
    .filter((row) => row.category === '診療費' || row.category === '医薬品費')
    .reduce((sum, row) => sum + numberValue(row.amount), 0);

  const expenseBreedingAmount = expenses
    .filter((row) => row.category === '種付け・繁殖費')
    .reduce((sum, row) => sum + numberValue(row.amount), 0);

  const expenseOtherAmount = expenses
    .filter((row) => !['飼料費', '診療費', '医薬品費', '種付け・繁殖費'].includes(row.category))
    .reduce((sum, row) => sum + numberValue(row.amount), 0);

  const thisMonthSalesAmount = salesSold
    .filter((row) => yearMonthFromDate(row.saleDate) === thisMonth)
    .reduce((sum, row) => sum + numberValue(row.salePrice), 0);

  const thisMonthExpenseAmount = expenses
    .filter((row) => yearMonthFromDate(row.paymentDate) === thisMonth)
    .reduce((sum, row) => sum + numberValue(row.amount), 0);

  const thisYearSalesAmount = salesSold
    .filter((row) => yearFromDate(row.saleDate) === thisYear)
    .reduce((sum, row) => sum + numberValue(row.salePrice), 0);

  const thisYearExpenseAmount = expenses
    .filter((row) => yearFromDate(row.paymentDate) === thisYear)
    .reduce((sum, row) => sum + numberValue(row.amount), 0);

  const summary = {
    cattleCount: cattle.length,
    calfCount: calves.length,
    breedingCount: breedings.length,
    vaccineCount: vaccines.length,
    blvPositiveCount: blv.filter((row) => row.result === '陽性').length,
    scheduleOpenCount: schedules.filter((row) => row.status !== '完了').length,
    scheduleOverdueCount: schedules.filter((row) => row.status !== '完了' && isOverdue(row.date)).length,
    treatmentActiveCount: treatments.filter((row) => row.progress === '治療中' || row.progress === '要再診').length,
    withdrawalActiveCount: treatments.filter((row) => row.withdrawalEndDate && !isOverdue(row.withdrawalEndDate)).length,

    upcomingCalvingCount: breedings.filter((row) => isUpcoming(row.expectedCalvingDate)).length,
    upcomingVaccineCount: vaccines.filter((row) => isUpcoming(row.nextDate)).length,
    upcomingBlvCount: blv.filter((row) => isUpcoming(row.nextTestDate)).length,
    upcomingScheduleCount: schedules.filter((row) => row.status !== '完了' && isUpcoming(row.date)).length,

    salesCount: sales.length,
    salesSoldCount: salesSold.length,
    salesPlanCount: salesPlan.length,
    salesShippedCount: salesShipped.length,
    salesCanceledCount: salesCanceled.length,
    salesTotalAmount,
    salesAverageAmount: average(salePrices),
    salesAverageWeight: average(saleWeights),

    expenseCount: expenses.length,
    expenseTotalAmount,
    expenseAverageAmount: average(expenseAmounts),
    expenseFeedAmount,
    expenseMedicalAmount,
    expenseBreedingAmount,
    expenseOtherAmount,

    thisMonthSalesAmount,
    thisMonthExpenseAmount,
    thisMonthBalanceAmount: thisMonthSalesAmount - thisMonthExpenseAmount,
    thisYearSalesAmount,
    thisYearExpenseAmount,
    thisYearBalanceAmount: thisYearSalesAmount - thisYearExpenseAmount
  };

  res.json(summary);
});

reportsRouter.get('/csv/:kind', (req, res) => {
  const { kind } = req.params;

  const fileMap: Record<string, string> = {
    cattle: 'cattle.json',
    calves: 'calves.json',
    breedings: 'breedings.json',
    vaccines: 'vaccines.json',
    blv: 'blv.json',
    schedules: 'schedules.json',
    treatments: 'treatments.json',
    sales: 'sales.json',
    expenses: 'expenses.json'
  };

  const fileName = fileMap[kind];

  if (!fileName) {
    res.status(404).json({ message: 'CSV種別が見つかりません。' });
    return;
  }

  const rows = readJsonFile<Record<string, unknown>[]>(fileName, []);
  const csv = makeCsv(rows);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="farmpro_${kind}.csv"`);
  res.send(csv);
});

export default reportsRouter;
