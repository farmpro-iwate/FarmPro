import { getFarmSettings } from './settingsApi';

export const DEFAULT_BREEDING_CATTLE_ACQUISITION_ALLOCATION_PARITY = 7;

export function normalizeBreedingCattleAcquisitionAllocationParity(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BREEDING_CATTLE_ACQUISITION_ALLOCATION_PARITY;
  }
  return Math.max(1, Math.round(parsed));
}

export async function getBreedingCattleAcquisitionAllocationParity() {
  const settings = await getFarmSettings();
  return normalizeBreedingCattleAcquisitionAllocationParity(
    settings.breedingCattleAcquisitionAllocationParity,
  );
}

export function calculateBreedingCattleAcquisitionCostPerCalf(
  acquisitionCost: number,
  allocationParity: number,
) {
  const cost = Number(acquisitionCost);
  const parity = normalizeBreedingCattleAcquisitionAllocationParity(allocationParity);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  return Math.round(cost / parity);
}
