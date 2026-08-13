import type { FarmProPlanId } from './policy';

const PLAN_STORAGE_KEY = 'farmpro.plan';
const VALID_PLANS: FarmProPlanId[] = ['free', 'standard', 'pro'];

export function getCurrentFarmProPlanId(): FarmProPlanId {
  if (typeof window === 'undefined') return 'free';

  const storedPlan = window.localStorage.getItem(PLAN_STORAGE_KEY);
  return VALID_PLANS.includes(storedPlan as FarmProPlanId)
    ? (storedPlan as FarmProPlanId)
    : 'free';
}

export function setCurrentFarmProPlanId(planId: FarmProPlanId): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PLAN_STORAGE_KEY, planId);
}
