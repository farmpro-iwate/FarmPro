import { getStoredAuthUser } from '../services/authClient';
import type { FarmProPlanId } from './policy';

const PLAN_STORAGE_KEY = 'farmpro.plan';
const VALID_PLANS: FarmProPlanId[] = ['free', 'standard', 'pro'];

export function getCurrentFarmProPlanId(): FarmProPlanId {
  if (typeof window === 'undefined') return 'free';

  if (!import.meta.env.DEV) {
    return getStoredAuthUser()?.plan ?? 'free';
  }

  const queryPlan = new URLSearchParams(window.location.search).get('devPlan');
  if (VALID_PLANS.includes(queryPlan as FarmProPlanId)) {
    const plan = queryPlan as FarmProPlanId;
    window.localStorage.setItem(PLAN_STORAGE_KEY, plan);
    return plan;
  }

  const storedPlan = window.localStorage.getItem(PLAN_STORAGE_KEY);
  return VALID_PLANS.includes(storedPlan as FarmProPlanId)
    ? (storedPlan as FarmProPlanId)
    : (getStoredAuthUser()?.plan ?? 'free');
}

export function setCurrentFarmProPlanId(planId: FarmProPlanId): void {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return;
  window.localStorage.setItem(PLAN_STORAGE_KEY, planId);
}
