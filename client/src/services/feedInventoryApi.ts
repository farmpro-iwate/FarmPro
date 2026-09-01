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

export type FeedInventoryUnit =
  | 'kg'
  | '袋'
  | 'ロール'
  | '束'
  | '個'
  | 'その他';

export type FeedInventoryTransactionType =
  | '入庫'
  | '出庫'
  | '調整';

export type FeedInventoryRecord = {
  id: string;
  transactionDate: string;
  feedName: string;
  transactionType: string;
  quantity: string;
  unit: string;
  bagWeightKg: string;
  totalWeightKg: string;
  unitPrice: string;
  totalPrice: string;
  supplier: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

type SyncedFeedInventoryRecord = FeedInventoryRecord & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
};

type CloudFeedInventoryRecord = Omit<Partial<SyncedFeedInventoryRecord>, 'id'> & {
  id: string;
  cloudUpdatedAt?: string;
};

export type FeedInventoryInput = Omit<
  FeedInventoryRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export const feedInventoryUnitOptions: FeedInventoryUnit[] = [
  'kg',
  '袋',
  'ロール',
  '束',
  '個',
  'その他',
];

export const feedInventoryTransactionTypeOptions: FeedInventoryTransactionType[] = [
  '入庫',
  '出庫',
  '調整',
];

export const emptyFeedInventoryInput: FeedInventoryInput = {
  transactionDate: '',
  feedName: '',
  transactionType: '入庫',
  quantity: '',
  unit: 'kg',
  bagWeightKg: '',
  totalWeightKg: '',
  unitPrice: '',
  totalPrice: '',
  supplier: '',
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
  cloud: CloudFeedInventoryRecord,
  local: SyncedFeedInventoryRecord,
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
    return body.message || `飼料在庫記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `飼料在庫記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function syncFeedInventoryRecordToCloud(
  record: SyncedFeedInventoryRecord,
): Promise<CloudFeedInventoryRecord | null> {
  if (!shouldUseCloudSync()) return null;

  const token = getAuthToken();
  if (!token) return null;

  const syncRecordId = record.syncRecordId || `feed-inventory:${record.id}`;
  const response = await fetch(
    `/api/feed-inventory/record-sync/${encodeURIComponent(syncRecordId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...record, id: syncRecordId, syncRecordId }),
    },
  );

  if (!response.ok) throw new Error(await readSyncError(response));
  return response.json() as Promise<CloudFeedInventoryRecord>;
}

async function syncFeedInventoryDeletionToCloud(syncRecordId: string) {
  if (!shouldUseCloudSync()) return;

  const token = getAuthToken();
  if (!token) return;

  const response = await fetch(
    `/api/feed-inventory/record-sync/${encodeURIComponent(syncRecordId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) throw new Error(await readSyncError(response));
}

async function syncFeedInventoryAfterLocalSave(record: SyncedFeedInventoryRecord) {
  try {
    const synced = await syncFeedInventoryRecordToCloud(record);
    if (!synced?.cloudUpdatedAt) return;

    await saveRecordPreservingTimestamps<SyncedFeedInventoryRecord>(
      'feedInventory',
      {
        ...record,
        syncRecordId:
          synced.id || record.syncRecordId || `feed-inventory:${record.id}`,
        cloudUpdatedAt: synced.cloudUpdatedAt,
        cloudSyncPending: false,
      },
    );
  } catch (error) {
    console.warn(
      '飼料在庫記録は端末内に保存しましたが、クラウド同期に失敗しました。',
      error,
    );
  }
}

function localIdFromSyncId(syncId: string) {
  return syncId.startsWith('feed-inventory:')
    ? syncId.slice('feed-inventory:'.length)
    : syncId;
}

function normalizeCloudFeedInventory(
  record: CloudFeedInventoryRecord,
  localId: string,
): SyncedFeedInventoryRecord {
  return {
    id: localId,
    transactionDate: String(record.transactionDate || ''),
    feedName: String(record.feedName || ''),
    transactionType: String(record.transactionType || '入庫'),
    quantity: String(record.quantity || ''),
    unit: String(record.unit || 'kg'),
    bagWeightKg: String(record.bagWeightKg || ''),
    totalWeightKg: String(record.totalWeightKg || ''),
    unitPrice: String(record.unitPrice || ''),
    totalPrice: String(record.totalPrice || ''),
    supplier: String(record.supplier || ''),
    memo: String(record.memo || ''),
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || ''),
    syncRecordId: String(record.id),
    cloudUpdatedAt: record.cloudUpdatedAt,
    cloudSyncPending: false,
  };
}

async function pullFeedInventoryChangesFromCloud() {
  if (!shouldUseCloudSync()) return 0;

  const token = getAuthToken();
  if (!token) return 0;

  const response = await fetch('/api/feed-inventory/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readSyncError(response));

  const cloudRecords = await response.json() as CloudFeedInventoryRecord[];
  const localRecords = await getAllRecords<SyncedFeedInventoryRecord>('feedInventory');
  const localBySyncId = new Map<string, SyncedFeedInventoryRecord>();

  for (const item of localRecords) {
    localBySyncId.set(
      item.syncRecordId || `feed-inventory:${item.id}`,
      item,
    );
  }

  let applied = 0;

  for (const cloud of cloudRecords) {
    const syncId = String(cloud.id || '').trim();
    if (!syncId) continue;

    const local = localBySyncId.get(syncId);

    if (cloud.deletedAt) {
      if (!local) continue;
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      await deleteRecord('feedInventory', local.id);
      localBySyncId.delete(syncId);
      applied += 1;
      continue;
    }

    if (local) {
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      const saved = await saveRecordPreservingTimestamps<SyncedFeedInventoryRecord>(
        'feedInventory',
        normalizeCloudFeedInventory(cloud, local.id),
      );
      localBySyncId.set(syncId, saved);
      applied += 1;
      continue;
    }

    const localId = localIdFromSyncId(syncId);
    if (!localId) continue;

    const saved = await saveRecordPreservingTimestamps<SyncedFeedInventoryRecord>(
      'feedInventory',
      normalizeCloudFeedInventory(cloud, localId),
    );
    localBySyncId.set(syncId, saved);
    applied += 1;
  }

  return applied;
}

export function recordToInput(
  record: FeedInventoryRecord,
): FeedInventoryInput {
  return {
    transactionDate: record.transactionDate || '',
    feedName: record.feedName || '',
    transactionType: record.transactionType || '入庫',
    quantity: record.quantity || '',
    unit: record.unit || 'kg',
    bagWeightKg: record.bagWeightKg || '',
    totalWeightKg: record.totalWeightKg || '',
    unitPrice: record.unitPrice || '',
    totalPrice: record.totalPrice || '',
    supplier: record.supplier || '',
    memo: record.memo || '',
  };
}

export async function getFeedInventoryList(): Promise<
  FeedInventoryRecord[]
> {
  try {
    await pullFeedInventoryChangesFromCloud();
  } catch (error) {
    console.warn('飼料在庫記録のクラウド取り込みをスキップしました。', error);
  }

  return getAllRecords<FeedInventoryRecord>('feedInventory');
}

export async function getFeedInventory(
  id: string,
): Promise<FeedInventoryRecord> {
  const record = await getRecordById<FeedInventoryRecord>(
    'feedInventory',
    id,
  );

  if (!record) {
    throw new Error('飼料在庫記録を取得できませんでした。');
  }

  return record;
}

export async function createFeedInventory(
  input: FeedInventoryInput,
): Promise<FeedInventoryRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const saved = await saveRecord<SyncedFeedInventoryRecord>('feedInventory', {
    id,
    ...input,
    syncRecordId: `feed-inventory:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    createdAt: now,
    updatedAt: now,
  });

  await syncFeedInventoryAfterLocalSave(saved);
  return saved;
}

export async function updateFeedInventory(
  id: string,
  input: FeedInventoryInput,
): Promise<FeedInventoryRecord> {
  const existing = await getRecordById<SyncedFeedInventoryRecord>(
    'feedInventory',
    id,
  );

  if (!existing) {
    throw new Error('飼料在庫記録を更新できませんでした。');
  }

  const saved = await saveRecord<SyncedFeedInventoryRecord>('feedInventory', {
    ...existing,
    ...input,
    id,
    syncRecordId: existing.syncRecordId || `feed-inventory:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    updatedAt: new Date().toISOString(),
  });

  await syncFeedInventoryAfterLocalSave(saved);
  return saved;
}

export async function deleteFeedInventory(
  id: string,
): Promise<void> {
  const current = await getRecordById<SyncedFeedInventoryRecord>(
    'feedInventory',
    id,
  );
  const syncRecordId = current?.syncRecordId || `feed-inventory:${id}`;

  await deleteRecord('feedInventory', id);

  try {
    await syncFeedInventoryDeletionToCloud(syncRecordId);
  } catch (error) {
    console.warn(
      '飼料在庫記録は端末内から削除しましたが、クラウド削除同期に失敗しました。',
      error,
    );
  }
}
