import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';

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
  unitPrice: '',
  totalPrice: '',
  supplier: '',
  memo: '',
};

export function recordToInput(
  record: FeedInventoryRecord,
): FeedInventoryInput {
  return {
    transactionDate: record.transactionDate || '',
    feedName: record.feedName || '',
    transactionType: record.transactionType || '入庫',
    quantity: record.quantity || '',
    unit: record.unit || 'kg',
    unitPrice: record.unitPrice || '',
    totalPrice: record.totalPrice || '',
    supplier: record.supplier || '',
    memo: record.memo || '',
  };
}

export async function getFeedInventoryList(): Promise<
  FeedInventoryRecord[]
> {
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

  const record: FeedInventoryRecord = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  return saveRecord('feedInventory', record);
}

export async function updateFeedInventory(
  id: string,
  input: FeedInventoryInput,
): Promise<FeedInventoryRecord> {
  const existing = await getRecordById<FeedInventoryRecord>(
    'feedInventory',
    id,
  );

  if (!existing) {
    throw new Error('飼料在庫記録を更新できませんでした。');
  }

  return saveRecord('feedInventory', {
    ...existing,
    ...input,
    id,
  });
}

export async function deleteFeedInventory(
  id: string,
): Promise<void> {
  await deleteRecord('feedInventory', id);
}
