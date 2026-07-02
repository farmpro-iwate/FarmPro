import dayjs from 'dayjs';
import { readJson } from './jsonStore';
import { Cattle } from './dataStore';
import { Calf } from './calfStore';
import { Breeding } from './breedingStore';
import { Vaccine } from './vaccineStore';
import { BlvTest } from './blvStore';

function daysUntil(dateText: string) {
  if (!dateText) return null;
  return dayjs(dateText).diff(dayjs(), 'day');
}

function isWithin(dateText: string, days: number) {
  const remaining = daysUntil(dateText);
  return remaining !== null && remaining >= 0 && remaining <= days;
}

export async function getDashboard() {
  const cattle = await readJson<Cattle>('cattle.json');
  const calves = await readJson<Calf>('calves.json');
  const breedings = await readJson<Breeding>('breedings.json');
  const vaccines = await readJson<Vaccine>('vaccines.json');
  const blvTests = await readJson<BlvTest>('blvTests.json');

  const nearCalvings = breedings
    .filter((item) => item.expectedCalvingDate && isWithin(item.expectedCalvingDate, 60))
    .map((item) => ({
      id: item.id,
      cowName: item.cowName,
      cowEarTag: item.cowEarTag,
      expectedCalvingDate: item.expectedCalvingDate,
      daysUntil: daysUntil(item.expectedCalvingDate)
    }))
    .sort((a, b) => (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999));

  const vaccineDueSoon = vaccines
    .filter((item) => item.nextDueDate && item.status !== '接種済み' && isWithin(item.nextDueDate, 30))
    .map((item) => ({
      id: item.id,
      targetName: item.targetName,
      vaccineName: item.vaccineName,
      nextDueDate: item.nextDueDate,
      daysUntil: daysUntil(item.nextDueDate)
    }))
    .sort((a, b) => (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999));

  const blvDueSoon = blvTests
    .filter((item) => item.nextTestDate && item.result !== '陽性' && isWithin(item.nextTestDate, 60))
    .map((item) => ({
      id: item.id,
      cowName: item.cowName,
      result: item.result,
      nextTestDate: item.nextTestDate,
      daysUntil: daysUntil(item.nextTestDate)
    }))
    .sort((a, b) => (a.daysUntil ?? 9999) - (b.daysUntil ?? 9999));

  return {
    counts: {
      cattle: cattle.length,
      calves: calves.length,
      breedings: breedings.length,
      vaccines: vaccines.length,
      blvPositive: blvTests.filter((item) => item.result === '陽性').length
    },
    alerts: { nearCalvings, vaccineDueSoon, blvDueSoon }
  };
}
