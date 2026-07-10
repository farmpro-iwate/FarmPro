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