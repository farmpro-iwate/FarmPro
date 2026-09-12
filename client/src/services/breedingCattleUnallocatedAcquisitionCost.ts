import type { Calf } from '../types/calf';
import type { Cattle } from '../types/cattle';
import { getAllRecords } from '../storage/repository';
import {
  calculateBreedingCattleAcquisitionCostPerCalf,
  getBreedingCattleAcquisitionAllocationParity,
} from './breedingCattleAcquisitionAllocation';

export type BreedingCattleUnallocatedAcquisitionCost = {
  acquisitionCost: number;
  allocationParity: number;
  allocatedParityCount: number;
  allocatedAmount: number;
  remainingAmount: number;
};

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function dateValue(value?: string) {
  const time = value ? new Date(`${value.slice(0, 10)}T00:00:00`).getTime() : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

function calfBelongsToCow(calf: Calf, cattle: Cattle) {
  const cattleId = normalize(cattle.id);
  const earTag = normalize(cattle.earTag);
  const name = normalize(cattle.name);

  const recipientId = normalize(calf.recipientCowId);
  const motherId = normalize(calf.motherCowId);
  if (recipientId && (recipientId === cattleId || recipientId === earTag)) return true;
  if (motherId && (motherId === cattleId || motherId === earTag)) return true;

  const recipientName = normalize(calf.recipientCowName);
  const motherCowName = normalize(calf.motherCowName);
  const motherName = normalize(calf.motherName);
  if (name && [recipientName, motherCowName, motherName].filter(Boolean).includes(name)) return true;

  return false;
}

function parityKey(calf: Calf) {
  const calvingId = normalize(calf.calvingId);
  if (calvingId) return `calving:${calvingId}`;
  const birthday = normalize(calf.birthday).slice(0, 10);
  if (birthday) return `date:${birthday}`;
  return `calf:${calf.id}`;
}

export async function getBreedingCattleUnallocatedAcquisitionCost(
  cattle: Cattle,
): Promise<BreedingCattleUnallocatedAcquisitionCost> {
  const [calves, allocationParity] = await Promise.all([
    getAllRecords<Calf>('calves'),
    getBreedingCattleAcquisitionAllocationParity(),
  ]);

  const acquisitionCostRaw = Number(cattle.acquisitionCost ?? cattle.acquisitionPrice ?? 0);
  const acquisitionCost = Number.isFinite(acquisitionCostRaw) && acquisitionCostRaw > 0
    ? Math.round(acquisitionCostRaw)
    : 0;
  const acquisitionDate = dateValue(cattle.acquisitionDate);

  const parityKeys = new Set<string>();
  calves.forEach((calf) => {
    if (!calfBelongsToCow(calf, cattle)) return;
    const birthday = dateValue(calf.birthday);
    if (acquisitionDate !== null && birthday !== null && birthday < acquisitionDate) return;
    parityKeys.add(parityKey(calf));
  });

  const allocatedParityCount = Math.min(parityKeys.size, allocationParity);
  const perParity = calculateBreedingCattleAcquisitionCostPerCalf(acquisitionCost, allocationParity);
  const allocatedAmount = Math.min(acquisitionCost, perParity * allocatedParityCount);
  const remainingAmount = Math.max(0, acquisitionCost - allocatedAmount);

  return {
    acquisitionCost,
    allocationParity,
    allocatedParityCount,
    allocatedAmount,
    remainingAmount,
  };
}
