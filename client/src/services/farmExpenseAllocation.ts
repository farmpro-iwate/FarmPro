import type { Calf } from '../types/calf';
import { getAllRecords } from '../storage/repository';
import { getExpensesList, type ExpenseRecord } from './expensesApi';
import { getFarmSettings } from './settingsApi';
import { getSalesList, type SaleRecord } from './salesApi';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type CalfStay = {
  calf: Calf;
  startDate: Date;
  endDate: Date;
};

type ExpensePeriodKey = {
  year: number;
  month?: number;
};

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b;
}

function inclusiveDays(start: Date, end: Date) {
  const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  if (endDay < startDay) return 0;
  return Math.floor((endDay - startDay) / MS_PER_DAY) + 1;
}

function isFarmWideExpense(record: ExpenseRecord) {
  if (record.animalType) return false;
  if (record.category === '飼料費') return false;
  const amount = Number(record.amount);
  return Number.isFinite(amount) && amount > 0;
}

function saleMatchesCalf(sale: SaleRecord, calf: Calf) {
  if (sale.targetType !== '子牛' || sale.status !== '販売済み' || !sale.saleDate) return false;

  const saleCalfId = String(sale.calfId || '').trim();
  if (saleCalfId && saleCalfId === String(calf.id)) return true;

  const calfNumber = String(calf.calfNumber || '').trim();
  const saleNumber = String(sale.targetNumber || '').trim();
  const calfBirthday = String(calf.birthday || '').slice(0, 10);
  const saleBirthday = String(sale.birthday || '').slice(0, 10);

  if (calfNumber && saleNumber && calfNumber === saleNumber) {
    if (!saleBirthday || !calfBirthday || saleBirthday === calfBirthday) return true;
  }

  const calfName = String(calf.name || '').trim();
  const saleName = String(sale.targetName || '').trim();
  return Boolean(
    calfName && saleName && calfName === saleName &&
    calfBirthday && saleBirthday && calfBirthday === saleBirthday,
  );
}

function calfSaleDate(calf: Calf, sales: SaleRecord[]) {
  const dates = sales
    .filter((sale) => saleMatchesCalf(sale, calf))
    .map((sale) => parseDate(sale.saleDate))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
  return dates[0] || null;
}

function calfStay(calf: Calf, sales: SaleRecord[], today: Date): CalfStay | null {
  const birthday = parseDate(calf.birthday);
  if (!birthday) return null;

  const soldAt = calfSaleDate(calf, sales);
  const promotedAt = parseDate(calf.promotedAt);
  let endDate = today;

  if (soldAt) endDate = minDate(endDate, soldAt);
  if (promotedAt) endDate = minDate(endDate, promotedAt);

  return {
    calf,
    startDate: birthday,
    endDate,
  };
}

function daysInPeriod(stay: CalfStay, period: ExpensePeriodKey) {
  const periodStart = period.month === undefined
    ? new Date(period.year, 0, 1)
    : new Date(period.year, period.month, 1);
  const periodEnd = period.month === undefined
    ? new Date(period.year, 11, 31)
    : new Date(period.year, period.month + 1, 0);
  const start = maxDate(stay.startDate, periodStart);
  const end = minDate(stay.endDate, periodEnd);
  return inclusiveDays(start, end);
}

function expensePeriod(record: ExpenseRecord, periodType: 'monthly' | 'yearly'): ExpensePeriodKey | null {
  const date = parseDate(record.paymentDate);
  if (!date) return null;
  return periodType === 'monthly'
    ? { year: date.getFullYear(), month: date.getMonth() }
    : { year: date.getFullYear() };
}

function periodKey(period: ExpensePeriodKey) {
  return period.month === undefined
    ? String(period.year)
    : `${period.year}-${String(period.month + 1).padStart(2, '0')}`;
}

export async function getCalfFarmExpenseAllocation(
  calfId: string,
): Promise<number> {
  const settings = await getFarmSettings();

  if (settings.farmExpenseAllocation !== 'equal') return 0;
  if ((settings.farmExpenseAllocationTarget || 'all') !== 'calf') return 0;

  const periodType = settings.farmExpenseAllocationPeriod || 'monthly';
  const allocationMethod = settings.farmExpenseAllocationMethod || 'headcount';

  const [calves, expenses, sales] = await Promise.all([
    getAllRecords<Calf>('calves'),
    getExpensesList(),
    getSalesList(),
  ]);

  const targetCalf = calves.find((calf) => String(calf.id) === String(calfId));
  if (!targetCalf) return 0;

  const today = dateOnly(new Date());
  const stays = calves
    .map((calf) => calfStay(calf, sales, today))
    .filter((stay): stay is CalfStay => Boolean(stay));
  const targetStay = stays.find((stay) => String(stay.calf.id) === String(calfId));
  if (!targetStay) return 0;

  const farmExpenses = expenses.filter(isFarmWideExpense);
  const periods = new Map<string, ExpensePeriodKey>();
  for (const expense of farmExpenses) {
    const period = expensePeriod(expense, periodType);
    if (period) periods.set(periodKey(period), period);
  }

  let allocatedTotal = 0;

  for (const period of periods.values()) {
    const targetDays = daysInPeriod(targetStay, period);
    if (targetDays <= 0) continue;

    const currentPeriodKey = periodKey(period);
    const farmExpenseTotal = farmExpenses.reduce((sum, expense) => {
      const expensePeriodValue = expensePeriod(expense, periodType);
      if (!expensePeriodValue || periodKey(expensePeriodValue) !== currentPeriodKey) return sum;
      return sum + Number(expense.amount || 0);
    }, 0);

    if (allocationMethod === 'headcount') {
      const eligibleHeadcount = stays.filter((stay) => daysInPeriod(stay, period) > 0).length;
      if (eligibleHeadcount <= 0) continue;
      allocatedTotal += farmExpenseTotal / eligibleHeadcount;
      continue;
    }

    if (allocationMethod === 'days') {
      const totalEligibleDays = stays.reduce((sum, stay) => sum + daysInPeriod(stay, period), 0);
      if (totalEligibleDays <= 0) continue;
      allocatedTotal += farmExpenseTotal * (targetDays / totalEligibleDays);
    }
  }

  return allocatedTotal;
}

export async function getCalfYearlyFarmExpenseAllocation(
  calfId: string,
): Promise<number> {
  return getCalfFarmExpenseAllocation(calfId);
}
