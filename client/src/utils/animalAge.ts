import dayjs from 'dayjs';
import type { AnimalLifecycle } from '../types/animalLifecycle';
import { animalLifecycleDate, animalLifecycleToday, getAnimalLifecycleState } from './animalLifecycle';

type AgeAnimal = Readonly<{
  birthday?: string;
  lifecycle?: AnimalLifecycle;
  managementStatus?: string;
}>;

/** Completed calendar months and total calendar days, ending at death when recorded.
 * Date-only values are parsed locally, so a new day begins at local midnight.
 * Month ends use the same clamped calendar-month convention as the calf chart. */
export function calculateAnimalAge(animal: AgeAnimal, today = animalLifecycleToday()) {
  const birthDate = animalLifecycleDate(animal.birthday);
  const currentDate = animalLifecycleDate(today);
  if (!birthDate || !currentDate) return null;

  const state = getAnimalLifecycleState(animal, currentDate);
  const asOf = state.deceased ? state.deathDate : currentDate;
  if (!asOf || birthDate > asOf) return null;

  const birth = dayjs(birthDate);
  const end = dayjs(asOf);
  return {
    months: end.diff(birth, 'month'),
    days: end.diff(birth, 'day'),
    atDeath: state.deceased,
  };
}

export function formatAnimalAge(animal: AgeAnimal, today = animalLifecycleToday()): string {
  const age = calculateAnimalAge(animal, today);
  if (!age) return '月齢・日齢：-';
  return `${age.months}か月齢（${age.days}日齢${age.atDeath ? '・死亡時' : ''}）`;
}
