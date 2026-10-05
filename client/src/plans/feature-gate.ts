import { getCurrentFarmProPlanId } from './current-plan';
import { FARM_PRO_PLANS, type FarmProPlanId } from './policy';

export type PaidFeature = 'cloudStorage' | 'automaticBackup' | 'multiDeviceSync';

export type FeatureAccess = {
  allowed: boolean;
  planId: FarmProPlanId;
  message: string;
};

const FEATURE_LABELS: Record<PaidFeature, string> = {
  cloudStorage: 'クラウド保存',
  automaticBackup: '自動バックアップ',
  multiDeviceSync: '複数端末同期',
};

export function getFeatureAccess(
  feature: PaidFeature,
  planId: FarmProPlanId = getCurrentFarmProPlanId(),
): FeatureAccess {
  const plan = FARM_PRO_PLANS[planId];
  const allowed = plan[feature];

  return {
    allowed,
    planId,
    message: allowed
      ? `${FEATURE_LABELS[feature]}を利用できます。`
      : `${FEATURE_LABELS[feature]}は有料プランで利用できます。`,
  };
}

export function requirePaidFeature(
  feature: PaidFeature,
  planId: FarmProPlanId = getCurrentFarmProPlanId(),
): void {
  const access = getFeatureAccess(feature, planId);
  if (!access.allowed) {
    throw new Error(access.message);
  }
}
