import {
  getAllRecords,
  getRecordById,
} from '../storage/repository';
import { openFarmProDatabase } from '../storage/db';

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

type LinkedFeedInventoryRecord = {
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

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('飼料給与と在庫の保存に失敗しました。'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('飼料給与と在庫の保存が中断されました。'));
  });
}

function waitForRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('飼料給与と在庫の処理に失敗しました。'));
  });
}

function inventoryLinkMarker(feedingId: string) {
  return `[feeding:${feedingId}]`;
}

function inventoryMemo(record: FeedingRecord) {
  const parts = [
    '飼料給与連動',
    inventoryLinkMarker(record.id),
    `対象:${record.target}`,
  ];

  if (record.purpose) {
    parts.push(`目的:${record.purpose}`);
  }

  if (record.memo) {
    parts.push(`メモ:${record.memo}`);
  }

  return parts.join(' ');
}

async function findLinkedInventoryRecords(
  store: IDBObjectStore,
  feedingId: string,
): Promise<LinkedFeedInventoryRecord[]> {
  const all = await waitForRequest(
    store.getAll() as IDBRequest<LinkedFeedInventoryRecord[]>,
  );
  const marker = inventoryLinkMarker(feedingId);

  return all.filter((record) => record.memo?.includes(marker));
}

async function saveFeedingWithInventory(
  record: FeedingRecord,
): Promise<FeedingRecord> {
  const database = await openFarmProDatabase();
  const transaction = database.transaction(
    ['feedings', 'feedInventory'],
    'readwrite',
  );
  const feedingStore = transaction.objectStore('feedings');
  const inventoryStore = transaction.objectStore('feedInventory');
  const now = new Date().toISOString();

  const existingFeeding = await waitForRequest(
    feedingStore.get(record.id) as IDBRequest<FeedingRecord | undefined>,
  );

  const savedFeeding: FeedingRecord = {
    ...record,
    createdAt: existingFeeding?.createdAt ?? record.createdAt ?? now,
    updatedAt: now,
  };

  const linkedInventoryRecords = await findLinkedInventoryRecords(
    inventoryStore,
    savedFeeding.id,
  );
  const existingInventory = linkedInventoryRecords[0];

  const inventoryRecord: LinkedFeedInventoryRecord = {
    id: existingInventory?.id ?? crypto.randomUUID(),
    transactionDate: savedFeeding.feedingDate,
    feedName: savedFeeding.feedName,
    transactionType: '出庫',
    quantity: savedFeeding.amount,
    unit: savedFeeding.unit,
    unitPrice: savedFeeding.unitPrice,
    totalPrice: savedFeeding.totalPrice,
    supplier: '',
    memo: inventoryMemo(savedFeeding),
    createdAt: existingInventory?.createdAt ?? now,
    updatedAt: now,
  };

  feedingStore.put(savedFeeding);
  inventoryStore.put(inventoryRecord);

  for (const duplicate of linkedInventoryRecords.slice(1)) {
    inventoryStore.delete(duplicate.id);
  }

  await waitForTransaction(transaction);
  return savedFeeding;
}

async function deleteFeedingWithInventory(id: string): Promise<void> {
  const database = await openFarmProDatabase();
  const transaction = database.transaction(
    ['feedings', 'feedInventory'],
    'readwrite',
  );
  const feedingStore = transaction.objectStore('feedings');
  const inventoryStore = transaction.objectStore('feedInventory');

  const linkedInventoryRecords = await findLinkedInventoryRecords(
    inventoryStore,
    id,
  );

  feedingStore.delete(id);

  for (const inventoryRecord of linkedInventoryRecords) {
    inventoryStore.delete(inventoryRecord.id);
  }

  await waitForTransaction(transaction);
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

  const record: FeedingRecord = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  return saveFeedingWithInventory(record);
}

export async function updateFeeding(
  id: string,
  input: FeedingInput,
): Promise<FeedingRecord> {
  const existing = await getRecordById<FeedingRecord>('feedings', id);

  if (!existing) {
    throw new Error('飼料給与記録を更新できませんでした。');
  }

  return saveFeedingWithInventory({
    ...existing,
    ...input,
    id,
  });
}

export async function deleteFeeding(id: string): Promise<void> {
  await deleteFeedingWithInventory(id);
}
