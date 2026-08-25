import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { FARM_PRO_PLANS } from '../plans/policy';
import { createFarmProBackup, type FarmProBackup } from '../storage/backup';
import type { StoreName } from '../storage/types';
import { hasAuthToken } from './authClient';
import { CloudSnapshotConflictError, uploadCloudSnapshot } from './cloudClient';
import {
  getDeviceSyncPreview,
  isDeviceSyncInitialized,
  pullCloudToLocal,
  pushLocalToCloud,
  type SyncDirection,
} from './deviceSync';

export type StartupSyncResult = SyncDirection | 'skipped' | 'pulled-empty-local' | 'pushed-empty-cloud' | 'needs-review';

const FARM_DATA_STORES: StoreName[] = [
  'cattle',
  'calves',
  'breedings',
  'calvings',
  'treatments',
  'vaccines',
  'blvTests',
  'schedules',
  'feedings',
  'feedingGuide',
  'feedingAlertActions',
  'feedInventory',
  'fatteningTransitions',
  'sales',
  'expenses',
  'photos',
];

function canRunStartupSync(): boolean {
  const plan = FARM_PRO_PLANS[getCurrentFarmProPlanId()];
  return plan.multiDeviceSync && hasAuthToken();
}

function countFarmDataRecords(backup: FarmProBackup): number {
  return FARM_DATA_STORES.reduce(
    (total, storeName) => total + backup.stores[storeName].length,
    0,
  );
}

async function pushLocalOverEmptyCloud(localBackup: FarmProBackup, cloudRevision: number): Promise<void> {
  const saved = await uploadCloudSnapshot(localBackup, cloudRevision);
  await pullCloudToLocal(localBackup, saved.revision);
}

export async function runStartupDeviceSync(): Promise<StartupSyncResult> {
  if (!canRunStartupSync()) return 'skipped';

  try {
    const initialized = isDeviceSyncInitialized();
    const preview = await getDeviceSyncPreview();

    if (preview.direction === 'same') return 'same';

    if (preview.direction === 'cloud-empty') {
      await pushLocalToCloud();
      return 'cloud-empty';
    }

    if (!preview.cloudBackup || preview.cloudRevision === null) return 'needs-review';

    const localBackup = await createFarmProBackup(__APP_VERSION__);
    const localFarmDataCount = countFarmDataRecords(localBackup);
    const cloudFarmDataCount = countFarmDataRecords(preview.cloudBackup);

    // 新しい端末など、端末側に実データが無い場合はクラウド側を安全に採用する。
    if (localFarmDataCount === 0 && cloudFarmDataCount > 0) {
      await pullCloudToLocal(preview.cloudBackup, preview.cloudRevision);
      return 'pulled-empty-local';
    }

    // クラウド側に実データが無く、この端末だけに実データがある場合はこの端末を採用する。
    if (localFarmDataCount > 0 && cloudFarmDataCount === 0) {
      await pushLocalOverEmptyCloud(localBackup, preview.cloudRevision);
      return 'pushed-empty-cloud';
    }

    // 初回で両側に実データがある場合は、日時だけで勝手に上書きしない。
    if (!initialized) return 'needs-review';

    if (preview.direction === 'cloud-newer') {
      await pullCloudToLocal(preview.cloudBackup, preview.cloudRevision);
      return 'cloud-newer';
    }

    if (preview.direction === 'local-newer') {
      await pushLocalToCloud();
      return 'local-newer';
    }

    return preview.direction === 'conflict' ? 'needs-review' : preview.direction;
  } catch (error) {
    if (error instanceof CloudSnapshotConflictError) return 'needs-review';
    throw error;
  }
}
