import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';

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

  const record: FeedingRecord = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  return saveRecord('feedings', record);
}

export async function updateFeeding(
  id: string,
  input: FeedingInput,
): Promise<FeedingRecord> {
  const existing = await getRecordById<FeedingRecord>('feedings', id);

  if (!existing) {
    throw new Error('飼料給与記録を更新できませんでした。');
  }

  return saveRecord('feedings', {
    ...existing,
    ...input,
    id,
  });
}

export async function deleteFeeding(id: string): Promise<void> {
  await deleteRecord('feedings', id);
}
