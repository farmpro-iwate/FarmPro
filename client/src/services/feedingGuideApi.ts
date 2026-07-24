import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';

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

  const record: FeedingGuideRecord = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  return saveRecord('feedingGuide', record);
}

export async function updateFeedingGuide(
  id: string,
  input: FeedingGuideInput,
): Promise<FeedingGuideRecord> {
  const existing = await getRecordById<FeedingGuideRecord>(
    'feedingGuide',
    id,
  );

  if (!existing) {
    throw new Error('飼料給与目安を更新できませんでした。');
  }

  return saveRecord('feedingGuide', {
    ...existing,
    ...input,
    id,
  });
}

export async function deleteFeedingGuide(id: string): Promise<void> {
  await deleteRecord('feedingGuide', id);
}
