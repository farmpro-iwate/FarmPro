import type { Calf } from '../types/calf';
import type { Cattle } from '../types/cattle';
import { getAllRecords } from '../storage/repository';
import { getExpensesList, type ExpenseRecord } from './expensesApi';
import { getFarmSettings } from './settingsApi';
import { getSalesList, type SaleRecord } from './salesApi';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type AnimalKind = 'calf' | 'cattle';

type AnimalStay = {
  kind: AnimalKind;
  id: string;
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

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return dateOnly(result);
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function maxDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b;
}

function inclusiveDays(start: Date, end: Date) {
  const startDay = Date.UTC(
    start.getFullYear(),
    start.getMonth(),
    start.getDate(),
  );
  const endDay = Date.UTC(
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
  );

  if (endDay < startDay) return 0;

  return Math.floor((endDay - startDay) / MS_PER_DAY) + 1;
}

function isFarmWideExpense(record: ExpenseRecord) {
  if (record.animalType) return false;
  if (record.category === '\u98fc\u6599\u8cbb') return false;

  const amount = Number(record.amount);
  return Number.isFinite(amount) && amount > 0;
}

function saleMatchesCalf(sale: SaleRecord, calf: Calf) {
  if (
    sale.targetType !== '\u5b50\u725b' ||
    sale.status !== '\u8ca9\u58f2\u6e08\u307f' ||
    !sale.saleDate
  ) {
    return false;
  }

  const saleCalfId = String(sale.calfId || '').trim();

  if (saleCalfId && saleCalfId === String(calf.id)) {
    return true;
  }

  const calfNumber = String(calf.calfNumber || '').trim();
  const saleNumber = String(sale.targetNumber || '').trim();

  const calfBirthday = String(calf.birthday || '').slice(0, 10);
  const saleBirthday = String(sale.birthday || '').slice(0, 10);

  if (calfNumber && saleNumber && calfNumber === saleNumber) {
    if (
      !saleBirthday ||
      !calfBirthday ||
      saleBirthday === calfBirthday
    ) {
      return true;
    }
  }

  const calfName = String(calf.name || '').trim();
  const saleName = String(sale.targetName || '').trim();

  return Boolean(
    calfName &&
    saleName &&
    calfName === saleName &&
    calfBirthday &&
    saleBirthday &&
    calfBirthday === saleBirthday
  );
}

function saleMatchesCattle(sale: SaleRecord, cattle: Cattle) {
  if (
    sale.targetType !== '\u6210\u725b' ||
    sale.status !== '\u8ca9\u58f2\u6e08\u307f' ||
    !sale.saleDate
  ) {
    return false;
  }

  const saleCattleId = String((sale as any).cattleId || '').trim();

  if (saleCattleId && saleCattleId === String(cattle.id)) {
    return true;
  }

  const earTag = String(cattle.earTag || '').trim();
  const saleNumber = String(sale.targetNumber || '').trim();

  if (earTag && saleNumber && earTag === saleNumber) {
    return true;
  }

  const name = String(cattle.name || '').trim();
  const saleName = String(sale.targetName || '').trim();

  return Boolean(name && saleName && name === saleName);
}

function firstSaleDate(
  sales: SaleRecord[],
  matcher: (sale: SaleRecord) => boolean,
) {
  const dates = sales
    .filter(matcher)
    .map((sale) => parseDate(sale.saleDate))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());

  return dates[0] || null;
}

function calfStay(
  calf: Calf,
  sales: SaleRecord[],
  today: Date,
): AnimalStay | null {
  const birthday = parseDate(calf.birthday);

  if (!birthday) return null;

  const soldAt = firstSaleDate(
    sales,
    (sale) => saleMatchesCalf(sale, calf),
  );

  const promotedAt = parseDate(calf.promotedAt);

  let endDate = today;

  if (soldAt) {
    endDate = minDate(endDate, soldAt);
  }

  // On the promotion date the animal belongs to cattle only.
  // This avoids counting the same physical animal twice.
  if (promotedAt) {
    endDate = minDate(endDate, addDays(promotedAt, -1));
  }

  if (endDate.getTime() < birthday.getTime()) {
    return null;
  }

  return {
    kind: 'calf',
    id: String(calf.id),
    startDate: birthday,
    endDate,
  };
}

function isBreedingCattle(cattle: Cattle) {
  return cattle.stage !== '\u80b2\u6210\u725b';
}

function cattleStay(
  cattle: Cattle,
  sales: SaleRecord[],
  today: Date,
): AnimalStay | null {
  if (!isBreedingCattle(cattle)) return null;

  const startDate = parseDate(
    cattle.acquisitionDate ||
    cattle.createdAt ||
    cattle.birthday,
  );

  if (!startDate) return null;

  const soldAt = firstSaleDate(
    sales,
    (sale) => saleMatchesCattle(sale, cattle),
  );

  const endDate = soldAt
    ? minDate(today, soldAt)
    : today;

  if (endDate.getTime() < startDate.getTime()) {
    return null;
  }

  return {
    kind: 'cattle',
    id: String(cattle.id),
    startDate,
    endDate,
  };
}

function expensePeriod(
  record: ExpenseRecord,
  periodType: 'monthly' | 'yearly',
): ExpensePeriodKey | null {
  const date = parseDate(record.paymentDate);

  if (!date) return null;

  return periodType === 'monthly'
    ? {
        year: date.getFullYear(),
        month: date.getMonth(),
      }
    : {
        year: date.getFullYear(),
      };
}

function daysInPeriod(
  stay: AnimalStay,
  period: ExpensePeriodKey,
) {
  const periodStart =
    period.month === undefined
      ? new Date(period.year, 0, 1)
      : new Date(period.year, period.month, 1);

  const periodEnd =
    period.month === undefined
      ? new Date(period.year, 11, 31)
      : new Date(period.year, period.month + 1, 0);

  const start = maxDate(stay.startDate, periodStart);
  const end = minDate(stay.endDate, periodEnd);

  return inclusiveDays(start, end);
}

export async function getAllFarmExpenseAllocation(
  kind: AnimalKind,
  animalId: string,
): Promise<number> {
  const settings = await getFarmSettings();

  if (settings.farmExpenseAllocation !== 'equal') {
    return 0;
  }

  if ((settings.farmExpenseAllocationTarget || 'all') !== 'all') {
    return 0;
  }

  const periodType =
    settings.farmExpenseAllocationPeriod || 'monthly';

  const allocationMethod =
    settings.farmExpenseAllocationMethod || 'headcount';

  const [calves, cattleList, expenses, sales] =
    await Promise.all([
      getAllRecords<Calf>('calves'),
      getAllRecords<Cattle>('cattle'),
      getExpensesList(),
      getSalesList(),
    ]);

  const today = dateOnly(new Date());

  const calfStays = calves
    .map((calf) => calfStay(calf, sales, today))
    .filter(
      (stay): stay is AnimalStay => Boolean(stay),
    );

  const cattleStays = cattleList
    .map((cattle) => cattleStay(cattle, sales, today))
    .filter(
      (stay): stay is AnimalStay => Boolean(stay),
    );

  const stays = [...calfStays, ...cattleStays];

  const targetStay = stays.find(
    (stay) =>
      stay.kind === kind &&
      stay.id === String(animalId),
  );

  if (!targetStay) return 0;

  const farmExpenses = expenses.filter(isFarmWideExpense);

  let allocatedTotal = 0;

  for (const expense of farmExpenses) {
    const expenseDate = parseDate(expense.paymentDate);

    if (!expenseDate) continue;

    const targetIsEligible =
      targetStay.startDate.getTime() <= expenseDate.getTime() &&
      targetStay.endDate.getTime() >= expenseDate.getTime();

    if (!targetIsEligible) continue;

    if (allocationMethod === 'headcount') {
      const eligibleHeadcount = stays.filter(
        (stay) =>
          stay.startDate.getTime() <= expenseDate.getTime() &&
          stay.endDate.getTime() >= expenseDate.getTime(),
      ).length;

      if (eligibleHeadcount <= 0) continue;

      allocatedTotal +=
        Number(expense.amount || 0) / eligibleHeadcount;

      continue;
    }

    const period = expensePeriod(expense, periodType);

    if (!period) continue;

    const targetDays = daysInPeriod(targetStay, period);

    if (targetDays <= 0) continue;

    const totalEligibleDays = stays.reduce(
      (sum, stay) => sum + daysInPeriod(stay, period),
      0,
    );

    if (totalEligibleDays <= 0) continue;

    allocatedTotal +=
      Number(expense.amount || 0) *
      (targetDays / totalEligibleDays);
  }

  return allocatedTotal;
}
