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

export type FeedingGuideRecord = {
  id: string;
  ageDays: string;
  ageMonth: string;
  stageName: string;
  targetWeight: string;
  targetHeight: string;
  targetChest: string;
  starterAmount: string;
  growingFeedAmount: string;
  roughageAmount: string;
  otherAmount: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

type SyncedFeedingGuideRecord = FeedingGuideRecord & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
};

type CloudFeedingGuideRecord = Omit<Partial<SyncedFeedingGuideRecord>, 'id'> & {
  id: string;
  cloudUpdatedAt?: string;
};

export type FeedingGuideInput = Omit<
  FeedingGuideRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export const emptyFeedingGuideInput: FeedingGuideInput = {
  ageDays: '',
  ageMonth: '',
  stageName: '',
  targetWeight: '',
  targetHeight: '',
  targetChest: '',
  starterAmount: '',
  growingFeedAmount: '',
  roughageAmount: '',
  otherAmount: '',
  memo: '',
};

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

async function readSyncError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `飼料給与目安のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `飼料給与目安のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function syncFeedingGuideRecordToCloud(
  record: SyncedFeedingGuideRecord,
): Promise<CloudFeedingGuideRecord | null> {
  if (!shouldUseCloudSync()) return null;

  const token = getAuthToken();
  if (!token) return null;

  const syncRecordId = record.syncRecordId || `feeding-guide:${record.id}`;
  const response = await fetch(
    `/api/feeding-guide/record-sync/${encodeURIComponent(syncRecordId)}`,
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
  return response.json() as Promise<CloudFeedingGuideRecord>;
}

async function syncFeedingGuideDeletionToCloud(syncRecordId: string) {
  if (!shouldUseCloudSync()) return;

  const token = getAuthToken();
  if (!token) return;

  const response = await fetch(
    `/api/feeding-guide/record-sync/${encodeURIComponent(syncRecordId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) throw new Error(await readSyncError(response));
}

async function syncFeedingGuideAfterLocalSave(record: SyncedFeedingGuideRecord) {
  try {
    const synced = await syncFeedingGuideRecordToCloud(record);
    if (!synced?.cloudUpdatedAt) return;

    await saveRecordPreservingTimestamps<SyncedFeedingGuideRecord>(
      'feedingGuide',
      {
        ...record,
        syncRecordId:
          synced.id || record.syncRecordId || `feeding-guide:${record.id}`,
        cloudUpdatedAt: synced.cloudUpdatedAt,
        cloudSyncPending: false,
      },
    );
  } catch (error) {
    console.warn(
      '飼料給与目安は端末内に保存しましたが、クラウド同期に失敗しました。',
      error,
    );
  }
}

export function recordToInput(
  record: FeedingGuideRecord,
): FeedingGuideInput {
  return {
    ageDays: record.ageDays || '',
    ageMonth: record.ageMonth || '',
    stageName: record.stageName || '',
    targetWeight: record.targetWeight || '',
    targetHeight: record.targetHeight || '',
    targetChest: record.targetChest || '',
    starterAmount: record.starterAmount || '',
    growingFeedAmount: record.growingFeedAmount || '',
    roughageAmount: record.roughageAmount || '',
    otherAmount: record.otherAmount || '',
    memo: record.memo || '',
  };
}

function ageDaysValue(value: string): number | null {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export async function getFeedingGuideList(): Promise<
  FeedingGuideRecord[]
> {
  return getAllRecords<FeedingGuideRecord>('feedingGuide');
}

export async function getFeedingGuide(
  id: string,
): Promise<FeedingGuideRecord> {
  const record = await getRecordById<FeedingGuideRecord>(
    'feedingGuide',
    id,
  );

  if (!record) {
    throw new Error('飼料給与目安を取得できませんでした。');
  }

  return record;
}

export async function getNearestFeedingGuide(
  ageDays: string,
): Promise<FeedingGuideRecord> {
  const targetAgeDays = ageDaysValue(ageDays);

  if (targetAgeDays === null) {
    throw new Error('日齢に近い飼料給与目安を取得できませんでした。');
  }

  const records = await getAllRecords<FeedingGuideRecord>(
    'feedingGuide',
  );

  const candidates = records
    .map((record) => ({
      record,
      ageDays: ageDaysValue(record.ageDays),
    }))
    .filter(
      (
        candidate,
      ): candidate is {
        record: FeedingGuideRecord;
        ageDays: number;
      } => candidate.ageDays !== null,
    );

  if (candidates.length === 0) {
    throw new Error('日齢に近い飼料給与目安を取得できませんでした。');
  }

  candidates.sort((a, b) => {
    const distanceA = Math.abs(a.ageDays - targetAgeDays);
    const distanceB = Math.abs(b.ageDays - targetAgeDays);

    if (distanceA !== distanceB) {
      return distanceA - distanceB;
    }

    return a.ageDays - b.ageDays;
  });

  return candidates[0].record;
}

export async function createFeedingGuide(
  input: FeedingGuideInput,
): Promise<FeedingGuideRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const saved = await saveRecord<SyncedFeedingGuideRecord>('feedingGuide', {
    id,
    ...input,
    syncRecordId: `feeding-guide:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    createdAt: now,
    updatedAt: now,
  });

  await syncFeedingGuideAfterLocalSave(saved);
  return saved;
}

export async function updateFeedingGuide(
  id: string,
  input: FeedingGuideInput,
): Promise<FeedingGuideRecord> {
  const existing = await getRecordById<SyncedFeedingGuideRecord>(
    'feedingGuide',
    id,
  );

  if (!existing) {
    throw new Error('飼料給与目安を更新できませんでした。');
  }

  const saved = await saveRecord<SyncedFeedingGuideRecord>('feedingGuide', {
    ...existing,
    ...input,
    id,
    syncRecordId: existing.syncRecordId || `feeding-guide:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    updatedAt: new Date().toISOString(),
  });

  await syncFeedingGuideAfterLocalSave(saved);
  return saved;
}

export async function deleteFeedingGuide(id: string): Promise<void> {
  const current = await getRecordById<SyncedFeedingGuideRecord>(
    'feedingGuide',
    id,
  );
  const syncRecordId = current?.syncRecordId || `feeding-guide:${id}`;

  await deleteRecord('feedingGuide', id);

  try {
    await syncFeedingGuideDeletionToCloud(syncRecordId);
  } catch (error) {
    console.warn(
      '飼料給与目安は端末内から削除しましたが、クラウド削除同期に失敗しました。',
      error,
    );
  }
}
