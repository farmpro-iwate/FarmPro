const API_BASE = '/api/feedings';

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

export type FeedingInput = Omit<FeedingRecord, 'id' | 'createdAt' | 'updatedAt'>;

export const feedingUnitOptions: FeedingUnit[] = [
  'kg',
  '袋',
  'ロール',
  '束',
  '個',
  'その他'
];

export const feedingPurposeOptions: FeedingPurpose[] = [
  '維持',
  '増体',
  '繁殖',
  '分娩前',
  '子牛育成',
  'その他'
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
  memo: ''
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
    memo: record.memo || ''
  };
}

export async function getFeedingsList(): Promise<FeedingRecord[]> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error('飼料給与記録を取得できませんでした。');
  return res.json();
}

export async function getFeeding(id: string): Promise<FeedingRecord> {
  const res = await fetch(`${API_BASE}/${id}`);
  if (!res.ok) throw new Error('飼料給与記録を取得できませんでした。');
  return res.json();
}

export async function createFeeding(input: FeedingInput): Promise<FeedingRecord> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!res.ok) throw new Error('飼料給与記録を登録できませんでした。');
  return res.json();
}

export async function updateFeeding(id: string, input: FeedingInput): Promise<FeedingRecord> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!res.ok) throw new Error('飼料給与記録を更新できませんでした。');
  return res.json();
}

export async function deleteFeeding(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE'
  });

  if (!res.ok) throw new Error('飼料給与記録を削除できませんでした。');
}

