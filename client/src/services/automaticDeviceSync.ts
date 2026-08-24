import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { FARM_PRO_PLANS } from '../plans/policy';
import { hasAuthToken } from './authClient';
import {
  getDeviceSyncPreview,
  isDeviceSyncInitialized,
  pullCloudToLocal,
  pushLocalToCloud,
  type SyncDirection,
} from './deviceSync';

export type StartupSyncResult = SyncDirection | 'skipped';

function canRunStartupSync(): boolean {
  const plan = FARM_PRO_PLANS[getCurrentFarmProPlanId()];
  return plan.multiDeviceSync && hasAuthToken() && isDeviceSyncInitialized();
}

export async function runStartupDeviceSync(): Promise<StartupSyncResult> {
  if (!canRunStartupSync()) return 'skipped';

  const preview = await getDeviceSyncPreview();

  if (preview.direction === 'cloud-newer' && preview.cloudBackup && preview.cloudRevision) {
    await pullCloudToLocal(preview.cloudBackup, preview.cloudRevision);
    return 'cloud-newer';
  }

  if (preview.direction === 'local-newer') {
    await pushLocalToCloud();
    return 'local-newer';
  }

  return preview.direction;
}
