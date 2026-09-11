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
  return {
    calf,
    startDate: birthday,
    endDate: soldAt ? minDate(soldAt, today) : today,
  };
}

function daysInYear(stay: CalfStay, year: number) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const start = maxDate(stay.startDate, yearStart);
  const end = minDate(stay.endDate, yearEnd);
  return inclusiveDays(start, end);
}

function expenseYear(record: ExpenseRecord) {
  const date = parseDate(record.paymentDate);
  return date ? date.getFullYear() : null;
}

export async function getCalfYearlyFarmExpenseAllocation(
  calfId: string,
): Promise<number> {
  const settings = await getFarmSettings();

  if (settings.farmExpenseAllocation !== 'equal') return 0;
  if ((settings.farmExpenseAllocationTarget || 'all') !== 'calf') return 0;
  if ((settings.farmExpenseAllocationPeriod || 'monthly') !== 'yearly') return 0;
  if ((settings.farmExpenseAllocationMethod || 'headcount') !== 'days') return 0;

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
  const years = Array.from(new Set(
    farmExpenses
      .map(expenseYear)
      .filter((year): year is number => year !== null),
  ));

  let allocatedTotal = 0;

  for (const year of years) {
    const targetDays = daysInYear(targetStay, year);
    if (targetDays <= 0) continue;

    const totalEligibleDays = stays.reduce((sum, stay) => sum + daysInYear(stay, year), 0);
    if (totalEligibleDays <= 0) continue;

    const farmExpenseTotal = farmExpenses.reduce((sum, expense) => {
      if (expenseYear(expense) !== year) return sum;
      return sum + Number(expense.amount || 0);
    }, 0);

    allocatedTotal += farmExpenseTotal * (targetDays / totalEligibleDays);
  }

  return allocatedTotal;
}
