import type { Calf } from '../types/calf';
import type { Cattle } from '../types/cattle';
import { getAllRecords } from '../storage/repository';
import { getFarmSettings } from './settingsApi';

export const DEFAULT_BREEDING_CATTLE_ACQUISITION_ALLOCATION_PARITY = 7;

export type BreedingCattleAcquisitionAllocationResult = {
  amount: number;
  allocationParity: number;
  motherCattleId?: number;
  motherName?: string;
  acquisitionCost?: number;
};

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

function normalizeIdentity(value: unknown) {
  return String(value ?? '').trim();
}

function matchesMother(cattle: Cattle, calf: Calf) {
  const cattleId = normalizeIdentity(cattle.id);
  const cattleEarTag = normalizeIdentity(cattle.earTag);
  const cattleName = normalizeIdentity(cattle.name);

  const preferredIds = [calf.recipientCowId, calf.motherCowId]
    .map(normalizeIdentity)
    .filter(Boolean);
  if (preferredIds.some((value) => value === cattleId || value === cattleEarTag)) return true;

  const preferredNames = [calf.recipientCowName, calf.motherCowName, calf.motherName]
    .map(normalizeIdentity)
    .filter(Boolean);
  if (cattleName && preferredNames.includes(cattleName)) return true;

  const geneticId = normalizeIdentity(calf.geneticMotherCowId);
  if (geneticId && (geneticId === cattleId || geneticId === cattleEarTag)) return true;

  const geneticName = normalizeIdentity(calf.geneticMotherCowName);
  return Boolean(cattleName && geneticName && cattleName === geneticName);
}

function motherDisplayName(mother: Cattle, acquisitionCost: number) {
  const name = normalizeIdentity(mother.name) || normalizeIdentity(mother.earTag) || '母牛';
  if (acquisitionCost <= 0) return `母牛：${name}`;
  return `母牛：${name}（${acquisitionCost.toLocaleString('ja-JP')}円）`;
}

export async function getBreedingCattleAcquisitionAllocationForCalf(
  calf: Calf,
): Promise<BreedingCattleAcquisitionAllocationResult> {
  const [cattleList, allocationParity] = await Promise.all([
    getAllRecords<Cattle>('cattle'),
    getBreedingCattleAcquisitionAllocationParity(),
  ]);

  const mother = cattleList.find((cattle) => matchesMother(cattle, calf));
  if (!mother) return { amount: 0, allocationParity };

  const acquisitionCost = Number(mother.acquisitionCost ?? mother.acquisitionPrice ?? 0);
  const normalizedAcquisitionCost = Number.isFinite(acquisitionCost) && acquisitionCost > 0
    ? Math.round(acquisitionCost)
    : 0;

  return {
    amount: calculateBreedingCattleAcquisitionCostPerCalf(
      normalizedAcquisitionCost,
      allocationParity,
    ),
    allocationParity,
    motherCattleId: mother.id,
    motherName: motherDisplayName(mother, normalizedAcquisitionCost),
    acquisitionCost: normalizedAcquisitionCost,
  };
}
