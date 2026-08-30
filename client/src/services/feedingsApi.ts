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
  await deleteRecord('feedings', id);
}
