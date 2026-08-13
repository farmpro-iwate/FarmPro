import { requirePaidFeature } from '../plans/feature-gate';
import type { FarmProBackup } from '../storage/backup';
import { parseFarmProBackupJson } from '../storage/backup-import';
import { downloadLatestCloudSnapshot } from './cloudClient';
import { getDeviceSyncPreview, pullCloudToLocal, pushLocalToCloud, type DeviceSyncPreview } from './deviceSync';

export async function saveToCloud(): Promise<{
  savedAt: string;
  revision: number;
  exportedAt: string;
  appVersion: string;
}> {
  requirePaidFeature('cloudStorage');
  return pushLocalToCloud();
}

export type CloudRestorePreview = {
  savedAt: string;
  revision: number;
  exportedAt: string;
  appVersion: string;
  recordCount: number;
  backup: FarmProBackup;
};

export async function getCloudRestorePreview(): Promise<CloudRestorePreview | null> {
  requirePaidFeature('cloudStorage');
  const stored = await downloadLatestCloudSnapshot();
  if (!stored) return null;

  const backup = parseFarmProBackupJson(JSON.stringify(stored.snapshot));
  const recordCount = Object.values(backup.stores)
    .reduce((total, records) => total + records.length, 0);

  return {
    savedAt: stored.savedAt,
    revision: stored.revision,
    exportedAt: backup.exportedAt,
    appVersion: backup.appVersion,
    recordCount,
    backup,
  };
}

export async function restoreLatestFromCloud(backup: FarmProBackup, revision: number): Promise<void> {
  requirePaidFeature('cloudStorage');
  await pullCloudToLocal(backup, revision);
}

export async function runAutomaticBackup(): Promise<void> {
  requirePaidFeature('automaticBackup');
  await pushLocalToCloud();
}

export async function syncAcrossDevices(): Promise<DeviceSyncPreview> {
  requirePaidFeature('multiDeviceSync');
  return getDeviceSyncPreview();
}

export async function syncPushLocalToCloud(): Promise<void> {
  requirePaidFeature('multiDeviceSync');
  await pushLocalToCloud();
}

export async function syncPullCloudToLocal(backup: FarmProBackup, revision: number): Promise<void> {
  requirePaidFeature('multiDeviceSync');
  await pullCloudToLocal(backup, revision);
}
