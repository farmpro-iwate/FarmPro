import { requirePaidFeature } from '../plans/feature-gate';
import { createFarmProBackup } from '../storage/backup';
import { uploadCloudSnapshot } from './cloudClient';

export async function saveToCloud(): Promise<{
  savedAt: string;
  exportedAt: string;
  appVersion: string;
}> {
  requirePaidFeature('cloudStorage');
  const backup = await createFarmProBackup(__APP_VERSION__);
  return uploadCloudSnapshot(backup);
}

export async function runAutomaticBackup(): Promise<void> {
  requirePaidFeature('automaticBackup');
  await saveToCloud();
}

export async function syncAcrossDevices(): Promise<void> {
  requirePaidFeature('multiDeviceSync');
  throw new Error('複数端末同期は接続準備中です。');
}
