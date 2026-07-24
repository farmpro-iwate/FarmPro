import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';

export type FeedingAlertAction = {
  id: string;
  actionDate: string;
  calfId: string;
  calfName: string;
  ageDays: string;
  alertType: string;
  actionType: string;
  memo: string;
  nextCheckDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type FeedingAlertActionInput = Omit<
  FeedingAlertAction,
  'id' | 'createdAt' | 'updatedAt'
>;

export async function fetchFeedingAlertActions(): Promise<
  FeedingAlertAction[]
> {
  return getAllRecords<FeedingAlertAction>('feedingAlertActions');
}

export async function fetchFeedingAlertAction(
  id: string,
): Promise<FeedingAlertAction> {
  const record = await getRecordById<FeedingAlertAction>(
    'feedingAlertActions',
    id,
  );

  if (!record) {
    throw new Error('給与アラート対応記録を取得できませんでした。');
  }

  return record;
}

export async function createFeedingAlertAction(
  input: FeedingAlertActionInput,
): Promise<FeedingAlertAction> {
  const now = new Date().toISOString();

  const record: FeedingAlertAction = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  return saveRecord('feedingAlertActions', record);
}

export async function updateFeedingAlertAction(
  id: string,
  input: FeedingAlertActionInput,
): Promise<FeedingAlertAction> {
  const existing = await getRecordById<FeedingAlertAction>(
    'feedingAlertActions',
    id,
  );

  if (!existing) {
    throw new Error('給与アラート対応記録を更新できませんでした。');
  }

  return saveRecord('feedingAlertActions', {
    ...existing,
    ...input,
    id,
  });
}

export async function deleteFeedingAlertAction(
  id: string,
): Promise<void> {
  await deleteRecord('feedingAlertActions', id);
}
