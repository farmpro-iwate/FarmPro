import dayjs from 'dayjs';

export function addDays(dateText: string, days: number) {
  if (!dateText) return '';
  return dayjs(dateText).add(days, 'day').format('YYYY-MM-DD');
}

export function calculateExpectedCalvingDate(breedingDate: string) {
  return addDays(breedingDate, 285);
}

export function calculateNextHeatExpectedDate(breedingDate: string, cycleDays: number) {
  return addDays(breedingDate, cycleDays);
}

export function calculatePregnancyCheckExpectedDate(breedingDate: string, cycleDays: number) {
  return addDays(breedingDate, cycleDays * 2);
}

export function daysUntil(dateText: string) {
  if (!dateText) return 0;
  return dayjs(dateText).diff(dayjs(), 'day');
}

type BreedingScheduleLike = {
  breedingMethod?: string;
  heatDate?: string;
  nextHeatExpectedDate?: string;
  pregnancyCheckExpectedDate?: string;
  expectedCalvingDate?: string;
  [key: string]: unknown;
};

export function withEtHeatBasedSchedule<T extends BreedingScheduleLike>(record: T, cycleDays: number): T {
  if (record.breedingMethod !== '受精卵移植' || !record.heatDate) return record;
  return {
    ...record,
    nextHeatExpectedDate: calculateNextHeatExpectedDate(record.heatDate, cycleDays),
    pregnancyCheckExpectedDate: calculatePregnancyCheckExpectedDate(record.heatDate, cycleDays),
    expectedCalvingDate: calculateExpectedCalvingDate(record.heatDate)
  };
}
