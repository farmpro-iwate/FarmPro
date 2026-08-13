import { requirePaidFeature } from '../plans/feature-gate';

export async function saveToCloud(): Promise<void> {
  requirePaidFeature('cloudStorage');
  throw new Error('クラウド保存は接続準備中です。');
}

export async function runAutomaticBackup(): Promise<void> {
  requirePaidFeature('automaticBackup');
  throw new Error('自動バックアップは接続準備中です。');
}

export async function syncAcrossDevices(): Promise<void> {
  requirePaidFeature('multiDeviceSync');
  throw new Error('複数端末同期は接続準備中です。');
}
