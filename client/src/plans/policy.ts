export type FarmProPlanId = 'free' | 'standard' | 'pro';

export type FarmProPlan = {
  id: FarmProPlanId;
  label: string;
  maxBreedingFemales: number | null;
  cloudStorage: boolean;
  automaticBackup: boolean;
  multiDeviceSync: boolean;
};

export const FARM_PRO_PLANS: Record<FarmProPlanId, FarmProPlan> = {
  free: {
    id: 'free',
    label: 'Free',
    maxBreedingFemales: 10,
    cloudStorage: false,
    automaticBackup: false,
    multiDeviceSync: false,
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    maxBreedingFemales: 99,
    cloudStorage: true,
    automaticBackup: true,
    multiDeviceSync: true,
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    maxBreedingFemales: null,
    cloudStorage: true,
    automaticBackup: true,
    multiDeviceSync: true,
  },
};

export function getFarmProPlan(planId: FarmProPlanId): FarmProPlan {
  return FARM_PRO_PLANS[planId];
}

export function canRegisterBreedingFemale(
  planId: FarmProPlanId,
  currentBreedingFemaleCount: number,
): boolean {
  const limit = FARM_PRO_PLANS[planId].maxBreedingFemales;
  return limit === null || currentBreedingFemaleCount < limit;
}

export function remainingBreedingFemaleSlots(
  planId: FarmProPlanId,
  currentBreedingFemaleCount: number,
): number | null {
  const limit = FARM_PRO_PLANS[planId].maxBreedingFemales;
  if (limit === null) return null;
  return Math.max(0, limit - currentBreedingFemaleCount);
}

export function hasCloudFeatures(planId: FarmProPlanId): boolean {
  return FARM_PRO_PLANS[planId].cloudStorage;
}
