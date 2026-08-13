import { requirePaidFeature } from '../plans/feature-gate';
import { createFarmProBackup, type FarmProBackup } from '../storage/backup';
import { parseFarmProBackupJson } from '../storage/backup-import';
import { restoreFarmProBackup } from '../storage/backup-restore';
import { downloadLatestCloudSnapshot, uploadCloudSnapshot } from './cloudClient';

export type SyncDirection = 'cloud-newer' | 'local-newer' | 'same' | 'cloud-empty' | 'conflict';

export type DeviceSyncPreview = {
  direction: SyncDirection;
  localRecordCount: number;
  cloudRecordCount: number;
  localUpdatedAt: string | null;
  cloudUpdatedAt: string | null;
  cloudSavedAt: string | null;
  cloudBackup: FarmProBackup | null;
};

const SYNC_BASE_FINGERPRINT_KEY = 'farmpro.syncBaseFingerprint';

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

function stableSnapshotContent(backup: FarmProBackup): string {
  const stores = Object.entries(backup.stores)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([storeName, records]) => [
      storeName,
      [...records].sort((left, right) => String(left.id).localeCompare(String(right.id))),
    ]);

  return JSON.stringify({
    format: backup.format,
    schemaVersion: backup.schemaVersion,
    stores,
  });
}

async function fingerprintBackup(backup: FarmProBackup): Promise<string> {
  const bytes = new TextEncoder().encode(stableSnapshotContent(backup));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function getSyncBaseFingerprint(): string | null {
  return window.localStorage.getItem(SYNC_BASE_FINGERPRINT_KEY);
}

function setSyncBaseFingerprint(fingerprint: string): void {
  window.localStorage.setItem(SYNC_BASE_FINGERPRINT_KEY, fingerprint);
}

async function determineDirection(
  localBackup: FarmProBackup,
  cloudBackup: FarmProBackup,
): Promise<SyncDirection> {
  const [localFingerprint, cloudFingerprint] = await Promise.all([
    fingerprintBackup(localBackup),
    fingerprintBackup(cloudBackup),
  ]);

  if (localFingerprint === cloudFingerprint) {
    setSyncBaseFingerprint(localFingerprint);
    return 'same';
  }

  const baseFingerprint = getSyncBaseFingerprint();
  if (baseFingerprint) {
    if (baseFingerprint === cloudFingerprint) return 'local-newer';
    if (baseFingerprint === localFingerprint) return 'cloud-newer';
    return 'conflict';
  }

  const localUpdatedAt = latestRecordUpdatedAt(localBackup);
  const cloudUpdatedAt = latestRecordUpdatedAt(cloudBackup);
  if (!cloudUpdatedAt) return 'local-newer';
  if (!localUpdatedAt) return 'cloud-newer';
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
    direction: await determineDirection(localBackup, cloudBackup),
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
  setSyncBaseFingerprint(await fingerprintBackup(localBackup));
}

export async function pullCloudToLocal(backup: FarmProBackup): Promise<void> {
  requirePaidFeature('multiDeviceSync');
  const validated = parseFarmProBackupJson(JSON.stringify(backup));
  await restoreFarmProBackup(validated);
  setSyncBaseFingerprint(await fingerprintBackup(validated));
}
