import { requirePaidFeature } from '../plans/feature-gate';
import type { FarmProBackup } from '../storage/backup';
import { FARM_PRO_STORE_NAMES } from '../storage/db';
import { parseFarmProBackupJson } from '../storage/backup-import';
import { restoreFarmProBackup } from '../storage/backup-restore';
import {
  captureRecoveryBackup, getLatestRecoveryCheckpoint, getRecoveryCheckpoint,
  recoveryBackupContent, saveRecoveryCheckpoint, validateRecoveryBackup,
  type RecoveryCheckpoint,
} from '../storage/sync-recovery';
import type { StoreName } from '../storage/types';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { downloadLatestCloudSnapshot } from './cloudClient';
import { establishRecoveredSyncBase } from './deviceSync';
import { APPROVED_CLOUD_RECOVERY } from './approvedCloudRecovery';
import {
  beginCloudRecovery, isCloudRecoveryPaused, setRecoveryRecordBaseline,
} from './syncRecoveryGuard';

export type CloudRecoveryPreview = {
  id: string;
  farmName: string;
  farmId: string;
  cloudRevision: number;
  cloudSavedAt: string;
  sourceExportedAt: string;
  sourceDigest: string;
  localRecordCount: number;
  cloudRecordCount: number;
  localTotalCount: number;
  cloudTotalCount: number;
  counts: Array<{ storeName: StoreName; local: number; cloud: number }>;
  beforeSavedAt: string;
  status: RecoveryCheckpoint['status'];
  alreadyMatches: boolean;
};

export type CloudRecoveryResult = {
  id: string;
  revision: number;
  recordCount: number;
  totalCount: number;
  verified: boolean;
};

type RecoveryLease = Awaited<ReturnType<typeof beginCloudRecovery>>;
let leasePromise: Promise<RecoveryLease> | null = null;
let activeLease: RecoveryLease | null = null;
let operationRunning = false;

// These reads do not change a snapshot or any individual server record.
const RECORD_ENDPOINTS: Record<string, string> = {
  masters: '/api/masters/record-sync',
  cattle: '/api/cattle/record-sync',
  calves: '/api/calves/record-sync',
  breedings: '/api/breedings/record-sync',
  calvings: '/api/calvings/record-sync',
  treatments: '/api/treatments/record-sync',
  vaccines: '/api/vaccines/record-sync',
  schedules: '/api/schedules/record-sync',
  feedings: '/api/feedings/record-sync',
  feedingGuide: '/api/feeding-guide/record-sync',
  feedInventory: '/api/feed-inventory/record-sync',
  sales: '/api/sales/record-sync',
  expenses: '/api/expenses/record-sync',
  'farm-settings': '/api/farm-settings',
  'alert-settings': '/api/alert-settings',
  'market-shipping-plan-settings': '/api/market-shipping-plan',
};

export function canUseCloudRecovery(): boolean {
  const user = getStoredAuthUser();
  return Boolean(getAuthToken() && user?.active && user.role === 'owner' &&
    user.farmId === APPROVED_CLOUD_RECOVERY.farmId &&
    (user.plan === 'standard' || user.plan === 'pro'));
}

function requireRecoveryAccess(): void {
  requirePaidFeature('multiDeviceSync');
  if (!canUseCloudRecovery()) throw new Error('確認済みの農場の管理者でログインしてください。');
}

async function getLease(): Promise<RecoveryLease> {
  requireRecoveryAccess();
  if (activeLease) { activeLease.assertCurrent(); return activeLease; }
  if (!leasePromise) {
    leasePromise = beginCloudRecovery().then(lease => { activeLease = lease; return lease; });
  }
  try { return await leasePromise; } finally { leasePromise = null; }
}

function releaseLease(): void {
  activeLease?.release();
  activeLease = null;
  leasePromise = null;
}

async function singleOperation<T>(work: () => Promise<T>): Promise<T> {
  if (operationRunning) throw new Error('復旧処理が進行中です。処理が終わるまでお待ちください。');
  operationRunning = true;
  try { return await work(); } finally { operationRunning = false; }
}

export async function recoveryContentDigest(backup: FarmProBackup): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('安全な内容確認を利用できません。HTTPS接続で開いてください。');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(recoveryBackupContent(backup)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function countRecords(backup: FarmProBackup, includeMetadata = false): number {
  return FARM_PRO_STORE_NAMES.reduce((total, name) => total + (includeMetadata || name !== 'metadata' ? backup.stores[name].length : 0), 0);
}

async function assertApprovedSource(backup: FarmProBackup, lease: RecoveryLease): Promise<void> {
  lease.assertCurrent();
  validateRecoveryBackup(backup, lease);
  if (await recoveryContentDigest(backup) !== APPROVED_CLOUD_RECOVERY.contentSha256 ||
      countRecords(backup) !== APPROVED_CLOUD_RECOVERY.recordCount ||
      countRecords(backup, true) !== APPROVED_CLOUD_RECOVERY.totalCount) {
    throw new Error('現在のクラウドは確認済みのPC正本と全内容が一致しません。受信は行わず、現在の記録を保持しました。');
  }
  lease.assertCurrent();
}

async function readAuthorizedJson(url: string, lease: RecoveryLease): Promise<unknown> {
  lease.assertCurrent();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${lease.token}` }, cache: 'no-store' });
  lease.assertCurrent();
  if (!response.ok) throw new Error(`復旧前のクラウド確認に失敗しました（${response.status}）。この端末のデータは保持しています。`);
  const data: unknown = await response.json();
  lease.assertCurrent();
  return data;
}

async function verifyAuthenticatedFarm(lease: RecoveryLease): Promise<void> {
  const data = await readAuthorizedJson('/api/auth/me', lease) as { user?: { id?: string; farmId?: string; role?: string; active?: boolean; plan?: string } };
  const user = data?.user;
  if (user?.id !== lease.userId || user.farmId !== lease.farmId || user.role !== 'owner' || !user.active ||
      (user.plan !== 'standard' && user.plan !== 'pro')) {
    throw new Error('クラウドの農場とログイン中の農場が一致しません。復旧を中止しました。');
  }
}

async function readRecordBaseline(lease: RecoveryLease): Promise<Record<string, unknown>> {
  const entries = await Promise.all(Object.entries(RECORD_ENDPOINTS).map(async ([key, url]) => {
    const data = await readAuthorizedJson(url, lease);
    if (key.endsWith('-settings')) {
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('クラウド設定の形式を確認できません。');
    } else {
      if (!Array.isArray(data) || data.some(record => !record || typeof record !== 'object' ||
          !['string', 'number'].includes(typeof record.id))) throw new Error('個別同期の記録を確認できません。');
      if (new Set(data.map(record => String(record.id))).size !== data.length) throw new Error('個別同期のIDが重複しています。');
    }
    return [key, data] as const;
  }));
  lease.assertCurrent();
  return Object.fromEntries(entries);
}

// cloudUpdatedAt may be regenerated by legacy GET handlers; business fields,
// record timestamps and tombstones must still match exactly.
function comparableRemote(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparableRemote);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'cloudUpdatedAt')
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, comparableRemote(child)]));
  return value;
}

function recordBaselineContent(baseline: Record<string, unknown>): string {
  return JSON.stringify(comparableRemote(Object.fromEntries(Object.entries(baseline).map(([key, value]) => [key,
    Array.isArray(value) ? [...value].sort((a, b) => String(a.id).localeCompare(String(b.id))) : value,
  ]))));
}

async function readCurrentCloud(lease: RecoveryLease) {
  lease.assertCurrent();
  const remote = await downloadLatestCloudSnapshot();
  lease.assertCurrent();
  if (!remote || !Number.isSafeInteger(remote.revision) || remote.revision < 1 || !Number.isFinite(Date.parse(remote.savedAt))) {
    throw new Error('現在のクラウド保存と世代を確認できません。');
  }
  const target = parseFarmProBackupJson(JSON.stringify(remote.snapshot));
  await assertApprovedSource(target, lease);
  return { ...remote, snapshot: target };
}

async function verifyRemoteUnchanged(checkpoint: RecoveryCheckpoint, lease: RecoveryLease): Promise<void> {
  await verifyAuthenticatedFarm(lease);
  const remote = await readCurrentCloud(lease);
  if (remote.revision !== checkpoint.revision || recoveryBackupContent(remote.snapshot) !== recoveryBackupContent(checkpoint.target)) {
    throw new Error('確認後にクラウドの世代または内容が変わりました。もう一度受信内容を確認してください。');
  }
  const records = await readRecordBaseline(lease);
  if (recordBaselineContent(records) !== recordBaselineContent(checkpoint.recordSyncBaseline)) {
    throw new Error('確認後に個別同期の内容が変わりました。新しい変更を保護するため復旧を一時停止しています。');
  }
  // Recheck after the independent record reads, too.
  const latest = await readCurrentCloud(lease);
  if (latest.revision !== checkpoint.revision || recoveryBackupContent(latest.snapshot) !== recoveryBackupContent(checkpoint.target)) {
    throw new Error('受信中にクラウドが更新されました。もう一度受信内容を確認してください。');
  }
}

async function previewOf(checkpoint: RecoveryCheckpoint): Promise<CloudRecoveryPreview> {
  return {
    id: checkpoint.id, farmName: checkpoint.target.farm!.name, farmId: checkpoint.farmId,
    cloudRevision: checkpoint.revision, cloudSavedAt: checkpoint.savedAt,
    sourceExportedAt: checkpoint.target.exportedAt, sourceDigest: await recoveryContentDigest(checkpoint.target),
    localRecordCount: countRecords(checkpoint.before), cloudRecordCount: countRecords(checkpoint.target),
    localTotalCount: countRecords(checkpoint.before, true), cloudTotalCount: countRecords(checkpoint.target, true),
    counts: FARM_PRO_STORE_NAMES.map(storeName => ({ storeName, local: checkpoint.before.stores[storeName].length, cloud: checkpoint.target.stores[storeName].length })),
    beforeSavedAt: checkpoint.createdAt, status: checkpoint.status,
    alreadyMatches: recoveryBackupContent(checkpoint.before) === recoveryBackupContent(checkpoint.target),
  };
}

function resultOf(checkpoint: RecoveryCheckpoint, verified: boolean): CloudRecoveryResult {
  return { id: checkpoint.id, revision: checkpoint.revision, recordCount: countRecords(checkpoint.target), totalCount: countRecords(checkpoint.target, true), verified };
}

async function requireCheckpoint(id: string, lease: RecoveryLease): Promise<RecoveryCheckpoint> {
  const checkpoint = await getRecoveryCheckpoint(lease, id);
  if (!checkpoint) throw new Error('この農場の退避情報が見つかりません。受信内容をもう一度確認してください。');
  await assertApprovedSource(checkpoint.target, lease);
  return checkpoint;
}

export async function getPendingCloudRecovery(): Promise<CloudRecoveryPreview | null> {
  if (!canUseCloudRecovery()) return null;
  // Do not acquire a lock or pause a device merely because it opened this page.
  if (!isCloudRecoveryPaused()) return null;
  return singleOperation(async () => {
    const lease = await getLease();
    let checkpoint = await getLatestRecoveryCheckpoint(lease);
    if (!checkpoint) { releaseLease(); return null; }
    if (checkpoint.status === 'verified') {
      // The page can close after saving "verified" but before releasing its
      // durable pause. It can also close during a later preparation, leaving an
      // older verified checkpoint. Neither case proves that syncing resumed.
      await assertApprovedSource(checkpoint.target, lease);
      const current = await captureRecoveryBackup(lease);
      lease.assertCurrent();
      const stillMatches = recoveryBackupContent(current) === recoveryBackupContent(checkpoint.target);
      checkpoint = {
        ...checkpoint,
        status: stillMatches ? 'applied' : 'failed',
        error: stillMatches
          ? '通常同期の再開前に処理が中断されました。現在の内容を再検証してください。'
          : '前回の完了後に端末の内容が変わっています。現在の記録を退避して受信内容を再確認してください。',
      };
      await saveRecoveryCheckpoint(checkpoint);
      // Keep the lease and pause until explicit verification succeeds, or a
      // fresh preparation records the current before-data and is cancelled.
    }
    return previewOf(checkpoint);
  });
}

export async function prepareCloudRecovery(): Promise<CloudRecoveryPreview> {
  return singleOperation(async () => {
    const wasPaused = isCloudRecoveryPaused();
    const lease = await getLease();
    let checkpointSaved = false;
    try {
      await verifyAuthenticatedFarm(lease);
      const previous = await getLatestRecoveryCheckpoint(lease);
      const before = await captureRecoveryBackup(lease);
      // An interrupted applied recovery must be verified, not silently replaced.
      if (previous && previous.status !== 'verified' && previous.status !== 'failed' &&
          recoveryBackupContent(before) === recoveryBackupContent(previous.target) &&
          recoveryBackupContent(before) !== recoveryBackupContent(previous.before)) {
        checkpointSaved = true;
        return previewOf({ ...previous, status: 'applied' });
      }
      const remote = await readCurrentCloud(lease);
      const recordSyncBaseline = await readRecordBaseline(lease);
      const checkpoint: RecoveryCheckpoint = {
        id: crypto.randomUUID(), farmId: lease.farmId, userId: lease.userId,
        createdAt: new Date().toISOString(), status: 'prepared', before,
        target: remote.snapshot, revision: remote.revision, savedAt: remote.savedAt, recordSyncBaseline,
      };
      await verifyRemoteUnchanged(checkpoint, lease);
      await saveRecoveryCheckpoint(checkpoint);
      checkpointSaved = true;
      return await previewOf(checkpoint);
    } catch (error) {
      if (!checkpointSaved && !wasPaused) releaseLease();
      throw error;
    }
  });
}

export async function applyCloudRecovery(id: string): Promise<CloudRecoveryResult> {
  return singleOperation(async () => {
    const lease = await getLease();
    const checkpoint = await requireCheckpoint(id, lease);
    try {
      await verifyRemoteUnchanged(checkpoint, lease);
      const current = await captureRecoveryBackup(lease);
      if (recoveryBackupContent(current) !== recoveryBackupContent(checkpoint.before) &&
          recoveryBackupContent(current) !== recoveryBackupContent(checkpoint.target)) {
        throw new Error('確認後にこの端末の内容が変わりました。新しい変更を保護するため受信を中止しました。');
      }
      await saveRecoveryCheckpoint({ ...checkpoint, status: 'applying' });
      if (recoveryBackupContent(current) !== recoveryBackupContent(checkpoint.target)) {
        await restoreFarmProBackup(checkpoint.target, {
          expectedFarmId: lease.farmId, expectedUserId: lease.userId,
          expectedLocalBackup: checkpoint.before, recoveryPermit: lease,
        });
      }
      const received = await captureRecoveryBackup(lease);
      if (recoveryBackupContent(received) !== recoveryBackupContent(checkpoint.target)) {
        throw new Error('受信後の全内容一致を確認できません。通常同期を停止したまま保持しています。');
      }
      await saveRecoveryCheckpoint({ ...checkpoint, status: 'applied' });
      return resultOf(checkpoint, false);
    } catch (error) {
      await saveRecoveryCheckpoint({ ...checkpoint, status: 'failed', error: error instanceof Error ? error.message : '受信を完了できませんでした。' }).catch(() => undefined);
      throw error;
    }
  });
}

/** Exercise the same read/merge paths used by ordinary pages while still fenced. */
async function verifyOrdinaryPulls(lease: RecoveryLease): Promise<void> {
  const tasks = [
    async () => (await import('./api')).pullNewerCattleRecordsFromCloud(lease),
    async () => (await import('./masterApi')).pullMasterRecordsFromCloud(lease),
    async () => (await import('./calfApi')).pullCalfChangesFromCloud(lease),
    async () => (await import('./breedingApi')).pullNewerBreedingRecordsFromCloud(lease),
    async () => (await import('./calvingsApi')).pullNewerCalvingRecordsFromCloud(lease),
    async () => (await import('./calvingRecordSync')).pullNewerCalvingRecordsFromCloud(lease),
    async () => (await import('./treatmentApi')).pullTreatmentChangesFromCloud(lease),
    async () => (await import('./vaccineApi')).pullVaccineChangesFromCloud(lease),
    async () => (await import('./scheduleApi')).pullScheduleChangesFromCloud(lease),
    async () => (await import('./feedInventoryApi')).pullFeedInventoryChangesFromCloud(lease),
    async () => (await import('./feedingsApi')).pullFeedingChangesFromCloud(lease),
    async () => (await import('./feedingGuideApi')).pullFeedingGuideChangesFromCloud(lease),
    async () => (await import('./salesApi')).pullSaleChangesFromCloud(lease),
    async () => (await import('./expensesApi')).pullExpenseChangesFromCloud(lease),
    async () => (await import('./settingsApi')).getFarmSettingsForPageOpen(lease),
    async () => (await import('./alertSettings')).getAlertSettings(lease),
    async () => (await import('./marketShippingPlanApi')).pullMarketShippingPlanSettings(lease),
  ];
  for (const task of tasks) { lease.assertCurrent(); await task(); }
  lease.assertCurrent();
}

export async function verifyAndResumeCloudRecovery(id: string): Promise<CloudRecoveryResult> {
  return singleOperation(async () => {
    const lease = await getLease();
    const checkpoint = await requireCheckpoint(id, lease);
    let ordinaryPullsStarted = false;
    try {
      const current = await captureRecoveryBackup(lease);
      if (recoveryBackupContent(current) !== recoveryBackupContent(checkpoint.target)) {
        throw new Error('正本の受信が完了していません。内容を再確認してから受信してください。');
      }
      await verifyRemoteUnchanged(checkpoint, lease);
      setRecoveryRecordBaseline(lease, checkpoint.recordSyncBaseline);
      ordinaryPullsStarted = true;
      await verifyOrdinaryPulls(lease);
      const afterPulls = await captureRecoveryBackup(lease);
      if (recoveryBackupContent(afterPulls) !== recoveryBackupContent(checkpoint.target)) {
        await restoreFarmProBackup(checkpoint.target, {
          expectedFarmId: lease.farmId, expectedUserId: lease.userId,
          expectedLocalBackup: afterPulls, recoveryPermit: lease,
        });
        throw new Error('通常同期の検証で内容の変化を検出しました。正本に戻し、同期を停止しています。');
      }
      await verifyRemoteUnchanged(checkpoint, lease);
      await establishRecoveredSyncBase(checkpoint.target, checkpoint.revision, lease);
      await saveRecoveryCheckpoint({ ...checkpoint, status: 'verified' });
      releaseLease();
      return resultOf(checkpoint, true);
    } catch (error) {
      if (ordinaryPullsStarted) {
        // A pull may write and then throw before reaching the comparison above.
        // Revert only changes made inside this still-exclusive verification.
        lease.assertCurrent();
        const observed = await captureRecoveryBackup(lease);
        if (recoveryBackupContent(observed) !== recoveryBackupContent(checkpoint.target)) {
          await restoreFarmProBackup(checkpoint.target, {
            expectedFarmId: lease.farmId, expectedUserId: lease.userId,
            expectedLocalBackup: observed, recoveryPermit: lease,
          });
        }
      }
      await saveRecoveryCheckpoint({ ...checkpoint, status: 'failed', error: error instanceof Error ? error.message : '通常同期を検証できませんでした。' }).catch(() => undefined);
      throw error;
    }
  });
}

export async function cancelCloudRecovery(id: string): Promise<void> {
  return singleOperation(async () => {
    const lease = await getLease();
    const checkpoint = await requireCheckpoint(id, lease);
    const current = await captureRecoveryBackup(lease);
    if (recoveryBackupContent(current) !== recoveryBackupContent(checkpoint.before)) {
      throw new Error('受信済みのため取消できません。通常同期の検証を続けてください。');
    }
    // Keep the durable before-data for recovery; only release the temporary fence.
    releaseLease();
  });
}
