import type { Calf } from '../types/calf';
import type { Cattle } from '../types/cattle';
import { getCalfList } from './calfApi';
import { getCattleList } from './api';
import { calfAgeWeight, type FeedAllocationTargetType } from './feedCostAllocation';

export type FeedAllocationTargetAnimal = {
  animalType: 'calf' | 'cattle';
  animalId: string;
  earTag: string;
  animalName: string;
  weight: number;
  ageDays?: number;
};

const activeCalfStatuses = new Set<Calf['managementStatus']>([
  '育成中',
  '販売予定',
  '繁殖候補として留保',
]);

function startOfLocalDay(dateText: string) {
  if (!dateText) return null;
  const date = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function ageDaysOnDate(birthday: string, dateText: string) {
  const birth = startOfLocalDay(birthday);
  const target = startOfLocalDay(dateText);
  if (!birth || !target) return null;
  return Math.max(0, Math.floor((target.getTime() - birth.getTime()) / 86400000));
}

export function calfIsEligibleForFeedAllocation(calf: Calf) {
  return activeCalfStatuses.has(calf.managementStatus);
}

export function buildCalfGroupTargets(calves: Calf[], dateText: string): FeedAllocationTargetAnimal[] {
  return calves
    .filter(calfIsEligibleForFeedAllocation)
    .map((calf) => {
      const ageDays = ageDaysOnDate(calf.birthday, dateText) ?? 0;
      return {
        animalType: 'calf' as const,
        animalId: String(calf.id),
        earTag: calf.calfNumber || calf.temporaryCalfNumber || '',
        animalName: calf.name || '',
        ageDays,
        weight: calfAgeWeight(ageDays),
      };
    });
}

export function buildCattleGroupTargets(
  cattle: Cattle[],
  targetType: 'growingCattleGroup' | 'breedingCattleGroup',
): FeedAllocationTargetAnimal[] {
  const stage = targetType === 'growingCattleGroup' ? '育成牛' : '繁殖牛';

  return cattle
    .filter((animal) => animal.stage === stage)
    .map((animal) => ({
      animalType: 'cattle' as const,
      animalId: String(animal.id),
      earTag: animal.earTag || '',
      animalName: animal.name || '',
      weight: 1,
    }));
}

export async function getFeedAllocationTargets(
  targetType: FeedAllocationTargetType,
  dateText: string,
): Promise<FeedAllocationTargetAnimal[]> {
  if (targetType === 'farm') return [];

  if (targetType === 'calfGroup') {
    const calves = await getCalfList();
    return buildCalfGroupTargets(calves, dateText);
  }

  if (targetType === 'growingCattleGroup' || targetType === 'breedingCattleGroup') {
    const cattle = await getCattleList();
    return buildCattleGroupTargets(cattle, targetType);
  }

  return [];
}
