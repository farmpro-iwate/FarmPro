import { describe, expect, it } from 'vitest';
import {
  FARM_PRO_PLANS,
  canRegisterBreedingFemale,
  hasCloudFeatures,
  remainingBreedingFemaleSlots,
} from './policy';

describe('FarmPro plan policy', () => {
  it('keeps the decided breeding female limits', () => {
    expect(FARM_PRO_PLANS.free.maxBreedingFemales).toBe(10);
    expect(FARM_PRO_PLANS.standard.maxBreedingFemales).toBe(99);
    expect(FARM_PRO_PLANS.pro.maxBreedingFemales).toBeNull();
  });

  it('blocks Free registration after 10 breeding females', () => {
    expect(canRegisterBreedingFemale('free', 9)).toBe(true);
    expect(canRegisterBreedingFemale('free', 10)).toBe(false);
    expect(remainingBreedingFemaleSlots('free', 10)).toBe(0);
  });

  it('blocks Standard registration after 99 breeding females', () => {
    expect(canRegisterBreedingFemale('standard', 98)).toBe(true);
    expect(canRegisterBreedingFemale('standard', 99)).toBe(false);
  });

  it('keeps Pro unlimited and paid plans cloud-enabled', () => {
    expect(canRegisterBreedingFemale('pro', 10000)).toBe(true);
    expect(remainingBreedingFemaleSlots('pro', 10000)).toBeNull();
    expect(hasCloudFeatures('free')).toBe(false);
    expect(hasCloudFeatures('standard')).toBe(true);
    expect(hasCloudFeatures('pro')).toBe(true);
  });
});
