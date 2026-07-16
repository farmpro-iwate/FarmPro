const API_BASE = '/api/feed-inventory';

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
  unitPrice: string;
  totalPrice: string;
  supplier: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

export type FeedInventoryInput = Omit<FeedInventoryRecord, 'id' | 'createdAt' | 'updatedAt'>;

export const feedInventoryUnitOptions: FeedInventoryUnit[] = [
  'kg',
  '袋',
  'ロール',
  '束',
  '個',
  'その他'
];

export const feedInventoryTransactionTypeOptions: FeedInventoryTransactionType[] = [
  '入庫',
  '出庫',
  '調整'
];

export const emptyFeedInventoryInput: FeedInventoryInput = {
  transactionDate: '',
  feedName: '',
  transactionType: '入庫',
  quantity: '',
  unit: 'kg',
  unitPrice: '',
  totalPrice: '',
  supplier: '',
  memo: ''
};

export function recordToInput(record: FeedInventoryRecord): FeedInventoryInput {
  return {
    transactionDate: record.transactionDate || '',
    feedName: record.feedName || '',
    transactionType: record.transactionType || '入庫',
    quantity: record.quantity || '',
    unit: record.unit || 'kg',
    unitPrice: record.unitPrice || '',
    totalPrice: record.totalPrice || '',
    supplier: record.supplier || '',
    memo: record.memo || ''
  };
}

export async function getFeedInventoryList(): Promise<FeedInventoryRecord[]> {
  const res = await fetch(API_BASE);
  if (!res.ok) throw new Error('飼料在庫記録を取得できませんでした。');
  return res.json();
}

export async function getFeedInventory(id: string): Promise<FeedInventoryRecord> {
  const res = await fetch(`${API_BASE}/${id}`);
  if (!res.ok) throw new Error('飼料在庫記録を取得できませんでした。');
  return res.json();
}

export async function createFeedInventory(input: FeedInventoryInput): Promise<FeedInventoryRecord> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!res.ok) throw new Error('飼料在庫記録を登録できませんでした。');
  return res.json();
}

export async function updateFeedInventory(id: string, input: FeedInventoryInput): Promise<FeedInventoryRecord> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });

  if (!res.ok) throw new Error('飼料在庫記録を更新できませんでした。');
  return res.json();
}

export async function deleteFeedInventory(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'DELETE'
  });

  if (!res.ok) throw new Error('飼料在庫記録を削除できませんでした。');
}

