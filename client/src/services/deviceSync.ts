import { requirePaidFeature } from '../plans/feature-gate';
import { createFarmProBackup, type FarmProBackup } from '../storage/backup';
import { parseFarmProBackupJson } from '../storage/backup-import';
import { restoreFarmProBackup } from '../storage/backup-restore';
import { downloadLatestCloudSnapshot, uploadCloudSnapshot } from './cloudClient';

export type SyncDirection = 'cloud-newer' | 'local-newer' | 'same' | 'cloud-empty';

export type DeviceSyncPreview = {
  direction: SyncDirection;
  localRecordCount: number;
  cloudRecordCount: number;
  localUpdatedAt: string | null;
  cloudUpdatedAt: string | null;
  cloudSavedAt: string | null;
  cloudBackup: FarmProBackup | null;
};

function countRecords(backup: FarmProBackup): number {
  return Object.values(backup.stores)
    .reduce((total, records) => total + records.length, 0);
}

function latestRecordUpdatedAt(backup: FarmProBackup): string | null {
  let latest: string | null = null;

  for (const records of Object.values(backup.stores)) {
    for (const record of records) {
      const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : null;
      if (!updatedAt) continue;
      if (!latest || updatedAt > latest) latest = updatedAt;
    }
  }

  return latest;
}

function compareTimestamps(localUpdatedAt: string | null, cloudUpdatedAt: string | null): SyncDirection {
  if (!localUpdatedAt && !cloudUpdatedAt) return 'same';
  if (!cloudUpdatedAt) return 'local-newer';
  if (!localUpdatedAt) return 'cloud-newer';
  if (localUpdatedAt === cloudUpdatedAt) return 'same';
  return localUpdatedAt > cloudUpdatedAt ? 'local-newer' : 'cloud-newer';
}

export async function getDeviceSyncPreview(): Promise<DeviceSyncPreview> {
  requirePaidFeature('multiDeviceSync');
  const localBackup = await createFarmProBackup(__APP_VERSION__);
  const stored = await downloadLatestCloudSnapshot();
  const localUpdatedAt = latestRecordUpdatedAt(localBackup);

  if (!stored) {
    return {
      direction: 'cloud-empty',
      localRecordCount: countRecords(localBackup),
      cloudRecordCount: 0,
      localUpdatedAt,
      cloudUpdatedAt: null,
      cloudSavedAt: null,
      cloudBackup: null,
    };
  }

  const cloudBackup = parseFarmProBackupJson(JSON.stringify(stored.snapshot));
  const cloudUpdatedAt = latestRecordUpdatedAt(cloudBackup);

  return {
    direction: compareTimestamps(localUpdatedAt, cloudUpdatedAt),
    localRecordCount: countRecords(localBackup),
    cloudRecordCount: countRecords(cloudBackup),
    localUpdatedAt,
    cloudUpdatedAt,
    cloudSavedAt: stored.savedAt,
    cloudBackup,
  };
}

export async function pushLocalToCloud(): Promise<void> {
  requirePaidFeature('multiDeviceSync');
  const localBackup = await createFarmProBackup(__APP_VERSION__);
  await uploadCloudSnapshot(localBackup);
}

export async function pullCloudToLocal(backup: FarmProBackup): Promise<void> {
  requirePaidFeature('multiDeviceSync');
  const validated = parseFarmProBackupJson(JSON.stringify(backup));
  await restoreFarmProBackup(validated);
}
