import { requirePaidFeature } from '../plans/feature-gate';
import { createFarmProBackup, type FarmProBackup } from '../storage/backup';
import { parseFarmProBackupJson } from '../storage/backup-import';
import { restoreFarmProBackup } from '../storage/backup-restore';
import type { StoreName, StoredRecord } from '../storage/types';
import { downloadLatestCloudSnapshot, uploadCloudSnapshot } from './cloudClient';
import { getStoredAuthUser } from './authClient';

export type SyncDirection = 'cloud-newer' | 'local-newer' | 'same' | 'cloud-empty' | 'conflict';

export type SyncStoreDiff = {
  storeName: StoreName;
  localOnly: number;
  cloudOnly: number;
  changed: number;
  localOnlyIds: string[];
  cloudOnlyIds: string[];
  changedIds: string[];
};

export type DeviceSyncPreview = {
  direction: SyncDirection;
  localRecordCount: number;
  cloudRecordCount: number;
  localUpdatedAt: string | null;
  cloudUpdatedAt: string | null;
  cloudSavedAt: string | null;
  cloudRevision: number | null;
  cloudBackup: FarmProBackup | null;
  differences: SyncStoreDiff[];
};

const SYNC_BASE_FINGERPRINT_KEY = 'farmpro.syncBaseFingerprint';
const CLOUD_REVISION_KEY = 'farmpro.cloudRevision';
const LOCAL_CHANGE_PENDING_KEY = 'farmpro.localChangePending';
const MAX_DIFF_IDS_PER_GROUP = 20;
const INTERNAL_SYNC_STORES = new Set<StoreName>(['metadata']);

function scopedKey(baseKey: string): string {
  const farmId = String(getStoredAuthUser()?.farmId || '').trim();
  return farmId ? `${baseKey}.${encodeURIComponent(farmId)}` : `${baseKey}.anonymous`;
}

export function markLocalChangePending(): void {
  window.localStorage.setItem(scopedKey(LOCAL_CHANGE_PENDING_KEY), new Date().toISOString());
}

export function clearLocalChangePending(): void {
  window.localStorage.removeItem(scopedKey(LOCAL_CHANGE_PENDING_KEY));
}

export function hasLocalChangePending(): boolean {
  return Boolean(window.localStorage.getItem(scopedKey(LOCAL_CHANGE_PENDING_KEY)));
}

function countRecords(backup: FarmProBackup): number {
  return Object.entries(backup.stores).reduce(
    (total, [storeName, records]) => total + (INTERNAL_SYNC_STORES.has(storeName as StoreName) ? 0 : records.length),
    0,
  );
}

function latestRecordUpdatedAt(backup: FarmProBackup): string | null {
  let latest: string | null = null;
  for (const [storeName, records] of Object.entries(backup.stores)) {
    if (INTERNAL_SYNC_STORES.has(storeName as StoreName)) continue;
    for (const record of records) {
      const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : null;
      if (!updatedAt) continue;
      if (!latest || updatedAt > latest) latest = updatedAt;
    }
  }
  return latest;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableValue(item)]));
}

function stableRecordContent(record: StoredRecord): string {
  return JSON.stringify(stableValue(record));
}

function stableSnapshotContent(backup: FarmProBackup): string {
  const stores = Object.entries(backup.stores)
    .filter(([storeName]) => !INTERNAL_SYNC_STORES.has(storeName as StoreName))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([storeName, records]) => [storeName, [...records].sort((left, right) => String(left.id).localeCompare(String(right.id))).map(stableValue)]);
  return JSON.stringify({ format: backup.format, schemaVersion: backup.schemaVersion, stores });
}

function compareBackupRecords(localBackup: FarmProBackup, cloudBackup: FarmProBackup): SyncStoreDiff[] {
  const differences: SyncStoreDiff[] = [];
  for (const storeName of Object.keys(localBackup.stores) as StoreName[]) {
    if (INTERNAL_SYNC_STORES.has(storeName)) continue;
    const localById = new Map(localBackup.stores[storeName].map((record) => [String(record.id), record]));
    const cloudById = new Map(cloudBackup.stores[storeName].map((record) => [String(record.id), record]));
    const localOnlyIds: string[] = [];
    const cloudOnlyIds: string[] = [];
    const changedIds: string[] = [];
    let localOnly = 0;
    let cloudOnly = 0;
    let changed = 0;
    for (const [id, localRecord] of localById) {
      const cloudRecord = cloudById.get(id);
      if (!cloudRecord) {
        localOnly += 1;
        if (localOnlyIds.length < MAX_DIFF_IDS_PER_GROUP) localOnlyIds.push(id);
        continue;
      }
      if (stableRecordContent(localRecord) !== stableRecordContent(cloudRecord)) {
        changed += 1;
        if (changedIds.length < MAX_DIFF_IDS_PER_GROUP) changedIds.push(id);
      }
    }
    for (const id of cloudById.keys()) {
      if (!localById.has(id)) {
        cloudOnly += 1;
        if (cloudOnlyIds.length < MAX_DIFF_IDS_PER_GROUP) cloudOnlyIds.push(id);
      }
    }
    if (localOnly > 0 || cloudOnly > 0 || changed > 0) {
      differences.push({ storeName, localOnly, cloudOnly, changed, localOnlyIds, cloudOnlyIds, changedIds });
    }
  }
  return differences;
}

async function fingerprintBackup(backup: FarmProBackup): Promise<string> {
  const bytes = new TextEncoder().encode(stableSnapshotContent(backup));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

function getSyncBaseFingerprint(): string | null {
  return window.localStorage.getItem(scopedKey(SYNC_BASE_FINGERPRINT_KEY));
}

function setSyncBaseFingerprint(fingerprint: string): void {
  window.localStorage.setItem(scopedKey(SYNC_BASE_FINGERPRINT_KEY), fingerprint);
}

export function isDeviceSyncInitialized(): boolean {
  return Boolean(getSyncBaseFingerprint());
}

export function getKnownCloudRevision(): number | null {
  const raw = window.localStorage.getItem(scopedKey(CLOUD_REVISION_KEY));
  if (!raw) return null;
  const revision = Number(raw);
  return Number.isInteger(revision) && revision > 0 ? revision : null;
}

function setKnownCloudRevision(revision: number): void {
  window.localStorage.setItem(scopedKey(CLOUD_REVISION_KEY), String(revision));
}

async function determineDirection(localBackup: FarmProBackup, cloudBackup: FarmProBackup): Promise<SyncDirection> {
  const [localFingerprint, cloudFingerprint] = await Promise.all([fingerprintBackup(localBackup), fingerprintBackup(cloudBackup)]);
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
    return { direction: 'cloud-empty', localRecordCount: countRecords(localBackup), cloudRecordCount: 0, localUpdatedAt, cloudUpdatedAt: null, cloudSavedAt: null, cloudRevision: null, cloudBackup: null, differences: [] };
  }
  const cloudBackup = parseFarmProBackupJson(JSON.stringify(stored.snapshot));
  const cloudUpdatedAt = latestRecordUpdatedAt(cloudBackup);
  const direction = await determineDirection(localBackup, cloudBackup);
  if (direction === 'same') setKnownCloudRevision(stored.revision);
  return { direction, localRecordCount: countRecords(localBackup), cloudRecordCount: countRecords(cloudBackup), localUpdatedAt, cloudUpdatedAt, cloudSavedAt: stored.savedAt, cloudRevision: stored.revision, cloudBackup, differences: compareBackupRecords(localBackup, cloudBackup) };
}

export async function pushLocalToCloud() {
  requirePaidFeature('multiDeviceSync');
  const localBackup = await createFarmProBackup(__APP_VERSION__);
  const result = await uploadCloudSnapshot(localBackup, getKnownCloudRevision());
  setKnownCloudRevision(result.revision);
  setSyncBaseFingerprint(await fingerprintBackup(localBackup));
  clearLocalChangePending();
  return result;
}

export async function pushLocalChangesToCloudSafely() {
  requirePaidFeature('multiDeviceSync');

  if (!isDeviceSyncInitialized()) {
    throw new Error('複数端末同期の初期確認が済んでいません。同期画面で状態を確認してください。');
  }

  const preview = await getDeviceSyncPreview();
  if (preview.direction === 'same') {
    clearLocalChangePending();
    return null;
  }

  if (preview.direction === 'cloud-empty') {
    return pushLocalToCloud();
  }

  if (preview.direction !== 'local-newer' || preview.cloudRevision === null) {
    throw new Error('別の端末にも新しい変更があります。クラウドへ自動上書きせず、複数端末同期画面で確認してください。');
  }

  const localBackup = await createFarmProBackup(__APP_VERSION__);
  const result = await uploadCloudSnapshot(localBackup, preview.cloudRevision);
  setKnownCloudRevision(result.revision);
  setSyncBaseFingerprint(await fingerprintBackup(localBackup));
  clearLocalChangePending();
  return result;
}

export async function pullCloudToLocal(backup: FarmProBackup, revision: number): Promise<void> {
  requirePaidFeature('multiDeviceSync');
  const validated = parseFarmProBackupJson(JSON.stringify(backup));
  await restoreFarmProBackup(validated);
  setKnownCloudRevision(revision);
  setSyncBaseFingerprint(await fingerprintBackup(validated));
  clearLocalChangePending();
}
