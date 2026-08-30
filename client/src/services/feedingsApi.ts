import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { getAuthToken } from './authClient';

export type FeedingUnit =
  | 'kg'
  | '袋'
  | 'ロール'
  | '束'
  | '個'
  | 'その他';

export type FeedingPurpose =
  | '維持'
  | '増体'
  | '繁殖'
  | '分娩前'
  | '子牛育成'
  | 'その他';

export type FeedingRecord = {
  id: string;
  feedingDate: string;
  target: string;
  feedName: string;
  amount: string;
  unit: string;
  unitPrice: string;
  totalPrice: string;
  purpose: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

type SyncedFeedingRecord = FeedingRecord & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
};

type CloudFeedingRecord = Omit<Partial<SyncedFeedingRecord>, 'id'> & {
  id: string;
  cloudUpdatedAt?: string;
};

export type FeedingInput = Omit<
  FeedingRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export const feedingUnitOptions: FeedingUnit[] = [
  'kg',
  '袋',
  'ロール',
  '束',
  '個',
  'その他',
];

export const feedingPurposeOptions: FeedingPurpose[] = [
  '維持',
  '増体',
  '繁殖',
  '分娩前',
  '子牛育成',
  'その他',
];

export const emptyFeedingInput: FeedingInput = {
  feedingDate: '',
  target: '',
  feedName: '',
  amount: '',
  unit: 'kg',
  unitPrice: '',
  totalPrice: '',
  purpose: '維持',
  memo: '',
};

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function cloudRecordIsNewer(
  cloud: CloudFeedingRecord,
  local: SyncedFeedingRecord,
) {
  const cloudTime = parseTimestamp(cloud.cloudUpdatedAt);
  const localCloudTime = parseTimestamp(local.cloudUpdatedAt);
  if (Number.isNaN(cloudTime)) return false;
  if (Number.isNaN(localCloudTime)) return true;
  return cloudTime > localCloudTime;
}

async function readSyncError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `飼料給与記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `飼料給与記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function syncFeedingRecordToCloud(
  record: SyncedFeedingRecord,
): Promise<CloudFeedingRecord | null> {
  if (!shouldUseCloudSync()) return null;

  const token = getAuthToken();
  if (!token) return null;

  const syncRecordId = record.syncRecordId || `feeding:${record.id}`;
  const response = await fetch(`/api/feedings/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...record, id: syncRecordId, syncRecordId }),
  });

  if (!response.ok) throw new Error(await readSyncError(response));
  return response.json() as Promise<CloudFeedingRecord>;
}

async function syncFeedingDeletionToCloud(syncRecordId: string) {
  if (!shouldUseCloudSync()) return;

  const token = getAuthToken();
  if (!token) return;

  const response = await fetch(`/api/feedings/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error(await readSyncError(response));
}

async function syncFeedingAfterLocalSave(record: SyncedFeedingRecord) {
  try {
    const synced = await syncFeedingRecordToCloud(record);
    if (!synced?.cloudUpdatedAt) return;

    await saveRecordPreservingTimestamps<SyncedFeedingRecord>('feedings', {
      ...record,
      syncRecordId: synced.id || record.syncRecordId || `feeding:${record.id}`,
      cloudUpdatedAt: synced.cloudUpdatedAt,
      cloudSyncPending: false,
    });
  } catch (error) {
    console.warn('飼料給与記録は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

function localIdFromSyncId(syncId: string) {
  return syncId.startsWith('feeding:')
    ? syncId.slice('feeding:'.length)
    : syncId;
}

function normalizeCloudFeeding(
  record: CloudFeedingRecord,
  localId: string,
): SyncedFeedingRecord {
  return {
    id: localId,
    feedingDate: String(record.feedingDate || ''),
    target: String(record.target || ''),
    feedName: String(record.feedName || ''),
    amount: String(record.amount || ''),
    unit: String(record.unit || 'kg'),
    unitPrice: String(record.unitPrice || ''),
    totalPrice: String(record.totalPrice || ''),
    purpose: String(record.purpose || '維持'),
    memo: String(record.memo || ''),
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || ''),
    syncRecordId: String(record.id),
    cloudUpdatedAt: record.cloudUpdatedAt,
    cloudSyncPending: false,
  };
}

async function pullFeedingChangesFromCloud() {
  if (!shouldUseCloudSync()) return 0;

  const token = getAuthToken();
  if (!token) return 0;

  const response = await fetch('/api/feedings/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readSyncError(response));

  const cloudRecords = await response.json() as CloudFeedingRecord[];
  const localRecords = await getAllRecords<SyncedFeedingRecord>('feedings');
  const localBySyncId = new Map<string, SyncedFeedingRecord>();

  for (const item of localRecords) {
    localBySyncId.set(item.syncRecordId || `feeding:${item.id}`, item);
  }

  let applied = 0;

  for (const cloud of cloudRecords) {
    const syncId = String(cloud.id || '').trim();
    if (!syncId || cloud.deletedAt) continue;

    const local = localBySyncId.get(syncId);

    if (local) {
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      const saved = await saveRecordPreservingTimestamps<SyncedFeedingRecord>(
        'feedings',
        normalizeCloudFeeding(cloud, local.id),
      );
      localBySyncId.set(syncId, saved);
      applied += 1;
      continue;
    }

    const localId = localIdFromSyncId(syncId);
    if (!localId) continue;

    const saved = await saveRecordPreservingTimestamps<SyncedFeedingRecord>(
      'feedings',
      normalizeCloudFeeding(cloud, localId),
    );
    localBySyncId.set(syncId, saved);
    applied += 1;
  }

  return applied;
}

export function recordToInput(record: FeedingRecord): FeedingInput {
  return {
    feedingDate: record.feedingDate || '',
    target: record.target || '',
    feedName: record.feedName || '',
    amount: record.amount || '',
    unit: record.unit || 'kg',
    unitPrice: record.unitPrice || '',
    totalPrice: record.totalPrice || '',
    purpose: record.purpose || '維持',
    memo: record.memo || '',
  };
}

export async function getFeedingsList(): Promise<FeedingRecord[]> {
  try {
    await pullFeedingChangesFromCloud();
  } catch (error) {
    console.warn('飼料給与記録のクラウド取り込みをスキップしました。', error);
  }

  return getAllRecords<FeedingRecord>('feedings');
}

export async function getFeeding(id: string): Promise<FeedingRecord> {
  const record = await getRecordById<FeedingRecord>('feedings', id);

  if (!record) {
    throw new Error('飼料給与記録を取得できませんでした。');
  }

  return record;
}

export async function createFeeding(
  input: FeedingInput,
): Promise<FeedingRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const saved = await saveRecord<SyncedFeedingRecord>('feedings', {
    id,
    ...input,
    syncRecordId: `feeding:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    createdAt: now,
    updatedAt: now,
  });

  await syncFeedingAfterLocalSave(saved);
  return saved;
}

export async function updateFeeding(
  id: string,
  input: FeedingInput,
): Promise<FeedingRecord> {
  const existing = await getRecordById<SyncedFeedingRecord>('feedings', id);

  if (!existing) {
    throw new Error('飼料給与記録を更新できませんでした。');
  }

  const saved = await saveRecord<SyncedFeedingRecord>('feedings', {
    ...existing,
    ...input,
    id,
    syncRecordId: existing.syncRecordId || `feeding:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    updatedAt: new Date().toISOString(),
  });

  await syncFeedingAfterLocalSave(saved);
  return saved;
}

export async function deleteFeeding(id: string): Promise<void> {
  const existing = await getRecordById<SyncedFeedingRecord>('feedings', id);
  const syncRecordId = existing?.syncRecordId || `feeding:${id}`;

  await deleteRecord('feedings', id);

  try {
    await syncFeedingDeletionToCloud(syncRecordId);
  } catch (error) {
    console.warn('飼料給与記録は端末内から削除しましたが、クラウド削除同期に失敗しました。', error);
  }
}
