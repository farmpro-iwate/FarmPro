const API_BASE = '/api/feeding-guide';

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

export type FeedingGuideInput = Omit<FeedingGuideRecord, 'id' | 'createdAt' | 'updatedAt'>;

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
  memo: ''
};

export function recordToInput(record: FeedingGuideRecord): FeedingGuideInput {
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
    memo: record.memo || ''
  };
}

export async function getFeedingGuideList(): Promise<FeedingGuideRecord[]> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error('飼料給与目安を取得できませんでした。');
  return res.json();
}

export async function getFeedingGuide(id: string): Promise<FeedingGuideRecord> {
  const res = await fetch(`${API_BASE}/${id}`);
  if (!res.ok) throw new Error('飼料給与目安を取得できませんでした。');
  return res.json();
}

export async function getNearestFeedingGuide(ageDays: string): Promise<FeedingGuideRecord> {
  const res = await fetch(`${API_BASE}/nearest/${ageDays}`);
  if (!res.ok) throw new Error('日齢に近い飼料給与目安を取得できませんでした。');
  return res.json();
}

export async function createFeedingGuide(input: FeedingGuideInput): Promise<FeedingGuideRecord> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!res.ok) throw new Error('飼料給与目安を登録できませんでした。');
  return res.json();
}

export async function updateFeedingGuide(id: string, input: FeedingGuideInput): Promise<FeedingGuideRecord> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!res.ok) throw new Error('飼料給与目安を更新できませんでした。');
  return res.json();
}

export async function deleteFeedingGuide(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE'
  });

  if (!res.ok) throw new Error('飼料給与目安を削除できませんでした。');
}

