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

export type ExpenseCategory =
  | '飼料費'
  | '敷料費'
  | '医薬品費'
  | '診療費'
  | '種付け・繁殖費'
  | '購入牛費'
  | '水道光熱費'
  | '燃料費'
  | '修繕費'
  | '機械・資材費'
  | '車両費'
  | '保険料'
  | '手数料'
  | '消耗品費'
  | 'その他';

export type PaymentMethod =
  | '現金'
  | '口座振替'
  | '銀行振込'
  | 'クレジットカード'
  | 'JA精算'
  | 'その他';

export type ExpenseRecord = {
  id: string;
  paymentDate: string;
  category: string;
  expenseCategoryMasterId?: number;
  description: string;
  vendor: string;
  vendorMasterId?: number;
  amount: string;
  paymentMethod: string;
  target: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

type SyncedExpenseRecord = ExpenseRecord & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
};

type CloudExpenseRecord = Omit<Partial<SyncedExpenseRecord>, 'id'> & {
  id: string;
  cloudUpdatedAt?: string;
};

export type ExpenseInput = Omit<
  ExpenseRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export const expenseCategoryOptions: ExpenseCategory[] = [
  '飼料費',
  '敷料費',
  '医薬品費',
  '診療費',
  '種付け・繁殖費',
  '購入牛費',
  '水道光熱費',
  '燃料費',
  '修繕費',
  '機械・資材費',
  '車両費',
  '保険料',
  '手数料',
  '消耗品費',
  'その他',
];

export const paymentMethodOptions: PaymentMethod[] = [
  '現金',
  '口座振替',
  '銀行振込',
  'クレジットカード',
  'JA精算',
  'その他',
];

export const emptyExpenseInput: ExpenseInput = {
  paymentDate: '',
  category: '',
  expenseCategoryMasterId: undefined,
  description: '',
  vendor: '',
  vendorMasterId: undefined,
  amount: '',
  paymentMethod: '現金',
  target: '',
  memo: '',
};

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

async function readSyncError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `経費記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `経費記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function syncExpenseRecordToCloud(
  record: SyncedExpenseRecord,
): Promise<CloudExpenseRecord | null> {
  if (!shouldUseCloudSync()) return null;

  const token = getAuthToken();
  if (!token) return null;

  const syncRecordId = record.syncRecordId || `expense:${record.id}`;
  const response = await fetch(`/api/expenses/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...record, id: syncRecordId, syncRecordId }),
  });

  if (!response.ok) throw new Error(await readSyncError(response));
  return response.json() as Promise<CloudExpenseRecord>;
}

async function syncExpenseAfterLocalSave(record: SyncedExpenseRecord) {
  try {
    const synced = await syncExpenseRecordToCloud(record);
    if (!synced?.cloudUpdatedAt) return;

    await saveRecordPreservingTimestamps<SyncedExpenseRecord>('expenses', {
      ...record,
      syncRecordId: synced.id || record.syncRecordId || `expense:${record.id}`,
      cloudUpdatedAt: synced.cloudUpdatedAt,
      cloudSyncPending: false,
    });
  } catch (error) {
    console.warn('経費記録は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

export function recordToInput(record: ExpenseRecord): ExpenseInput {
  return {
    paymentDate: record.paymentDate || '',
    category: record.category || '',
    expenseCategoryMasterId: record.expenseCategoryMasterId,
    description: record.description || '',
    vendor: record.vendor || '',
    vendorMasterId: record.vendorMasterId,
    amount: record.amount || '',
    paymentMethod: record.paymentMethod || '現金',
    target: record.target || '',
    memo: record.memo || '',
  };
}

export async function getExpensesList(): Promise<ExpenseRecord[]> {
  return getAllRecords<ExpenseRecord>('expenses');
}

export async function getExpense(id: string): Promise<ExpenseRecord> {
  const record = await getRecordById<ExpenseRecord>('expenses', id);

  if (!record) {
    throw new Error('経費記録を取得できませんでした。');
  }

  return record;
}

export async function createExpense(
  input: ExpenseInput,
): Promise<ExpenseRecord> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const saved = await saveRecord<SyncedExpenseRecord>('expenses', {
    id,
    ...input,
    syncRecordId: `expense:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    createdAt: now,
    updatedAt: now,
  });

  await syncExpenseAfterLocalSave(saved);
  return saved;
}

export async function updateExpense(
  id: string,
  input: ExpenseInput,
): Promise<ExpenseRecord> {
  const existing = await getRecordById<SyncedExpenseRecord>('expenses', id);

  if (!existing) {
    throw new Error('経費記録を更新できませんでした。');
  }

  const saved = await saveRecord<SyncedExpenseRecord>('expenses', {
    ...existing,
    ...input,
    id,
    syncRecordId: existing.syncRecordId || `expense:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    updatedAt: new Date().toISOString(),
  });

  await syncExpenseAfterLocalSave(saved);
  return saved;
}

export async function deleteExpense(id: string): Promise<void> {
  await deleteRecord('expenses', id);
}
