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

export type ExpenseAnimalType = 'cattle' | 'calf';
export type ExpenseSourceType = 'treatment' | 'breeding' | 'manual';

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
  animalType?: ExpenseAnimalType;
  animalId?: string;
  animalEarTag?: string;
  animalName?: string;
  sourceType?: ExpenseSourceType;
  sourceId?: string;
  sourceDetail?: string;
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

export type SourceLinkedExpenseInput = ExpenseInput & {
  sourceType: ExpenseSourceType;
  sourceId: string;
};

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
  animalType: undefined,
  animalId: undefined,
  animalEarTag: undefined,
  animalName: undefined,
  sourceType: undefined,
  sourceId: undefined,
  sourceDetail: undefined,
  memo: '',
};

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

function createExpenseId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `expense-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function cloudRecordIsNewer(
  cloud: CloudExpenseRecord,
  local: SyncedExpenseRecord,
) {
  const cloudTime = parseTimestamp(cloud.cloudUpdatedAt);
  const localCloudTime = parseTimestamp(local.cloudUpdatedAt);
  if (Number.isNaN(cloudTime)) return false;
  if (Number.isNaN(localCloudTime)) return true;
  return cloudTime > localCloudTime;
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

async function syncExpenseDeletionToCloud(syncRecordId: string) {
  if (!shouldUseCloudSync()) return;

  const token = getAuthToken();
  if (!token) return;

  const response = await fetch(`/api/expenses/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error(await readSyncError(response));
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

function localIdFromSyncId(syncId: string) {
  return syncId.startsWith('expense:')
    ? syncId.slice('expense:'.length)
    : syncId;
}

function normalizeCloudExpense(
  record: CloudExpenseRecord,
  localId: string,
): SyncedExpenseRecord {
  return {
    id: localId,
    paymentDate: String(record.paymentDate || ''),
    category: String(record.category || ''),
    expenseCategoryMasterId: record.expenseCategoryMasterId,
    description: String(record.description || ''),
    vendor: String(record.vendor || ''),
    vendorMasterId: record.vendorMasterId,
    amount: String(record.amount || ''),
    paymentMethod: String(record.paymentMethod || '現金'),
    target: String(record.target || ''),
    animalType: record.animalType,
    animalId: record.animalId ? String(record.animalId) : undefined,
    animalEarTag: record.animalEarTag ? String(record.animalEarTag) : undefined,
    animalName: record.animalName ? String(record.animalName) : undefined,
    sourceType: record.sourceType,
    sourceId: record.sourceId ? String(record.sourceId) : undefined,
    sourceDetail: record.sourceDetail ? String(record.sourceDetail) : undefined,
    memo: String(record.memo || ''),
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || ''),
    syncRecordId: String(record.id),
    cloudUpdatedAt: record.cloudUpdatedAt,
    cloudSyncPending: false,
  };
}

async function pullExpenseChangesFromCloud() {
  if (!shouldUseCloudSync()) return 0;

  const token = getAuthToken();
  if (!token) return 0;

  const response = await fetch('/api/expenses/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readSyncError(response));

  const cloudRecords = await response.json() as CloudExpenseRecord[];
  const localRecords = await getAllRecords<SyncedExpenseRecord>('expenses');
  const localBySyncId = new Map<string, SyncedExpenseRecord>();

  for (const item of localRecords) {
    localBySyncId.set(item.syncRecordId || `expense:${item.id}`, item);
  }

  let applied = 0;

  for (const cloud of cloudRecords) {
    const syncId = String(cloud.id || '').trim();
    if (!syncId) continue;

    const local = localBySyncId.get(syncId);

    if (cloud.deletedAt) {
      if (!local) continue;
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      await deleteRecord('expenses', local.id);
      localBySyncId.delete(syncId);
      applied += 1;
      continue;
    }

    if (local) {
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      const saved = await saveRecordPreservingTimestamps<SyncedExpenseRecord>(
        'expenses',
        normalizeCloudExpense(cloud, local.id),
      );
      localBySyncId.set(syncId, saved);
      applied += 1;
      continue;
    }

    const localId = localIdFromSyncId(syncId);
    if (!localId) continue;

    const saved = await saveRecordPreservingTimestamps<SyncedExpenseRecord>(
      'expenses',
      normalizeCloudExpense(cloud, localId),
    );
    localBySyncId.set(syncId, saved);
    applied += 1;
  }

  return applied;
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
    animalType: record.animalType,
    animalId: record.animalId,
    animalEarTag: record.animalEarTag,
    animalName: record.animalName,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    sourceDetail: record.sourceDetail,
    memo: record.memo || '',
  };
}

export async function getExpensesList(): Promise<ExpenseRecord[]> {
  try {
    await pullExpenseChangesFromCloud();
  } catch (error) {
    console.warn('経費記録のクラウド取り込みをスキップしました。', error);
  }

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
  const id = createExpenseId();

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

export async function upsertExpenseBySource(
  input: SourceLinkedExpenseInput,
): Promise<ExpenseRecord> {
  const sourceId = input.sourceId.trim();
  if (!sourceId) {
    throw new Error('元記録IDがないため経費を登録できませんでした。');
  }

  const sourceDetail = input.sourceDetail?.trim() || '';
  const records = await getAllRecords<ExpenseRecord>('expenses');
  const existing = records.find((record) =>
    record.sourceType === input.sourceType
    && record.sourceId === sourceId
    && record.category === input.category
    && (record.sourceDetail?.trim() || '') === sourceDetail
  );

  const normalizedInput: SourceLinkedExpenseInput = {
    ...input,
    sourceId,
    sourceDetail: sourceDetail || undefined,
  };

  if (existing) {
    return updateExpense(existing.id, normalizedInput);
  }

  return createExpense(normalizedInput);
}

export async function deleteExpenseBySource(
  sourceType: ExpenseSourceType,
  sourceId: string,
  category: string,
  sourceDetail?: string,
): Promise<void> {
  const normalizedSourceId = sourceId.trim();
  if (!normalizedSourceId) return;
  const normalizedSourceDetail = sourceDetail?.trim() || '';

  const records = await getAllRecords<ExpenseRecord>('expenses');
  const matches = records.filter((record) =>
    record.sourceType === sourceType
    && record.sourceId === normalizedSourceId
    && record.category === category
    && (record.sourceDetail?.trim() || '') === normalizedSourceDetail
  );

  await Promise.all(matches.map((record) => deleteExpense(record.id)));
}

export async function deleteExpense(id: string): Promise<void> {
  const existing = await getRecordById<SyncedExpenseRecord>('expenses', id);
  const syncRecordId = existing?.syncRecordId || `expense:${id}`;

  await deleteRecord('expenses', id);

  try {
    await syncExpenseDeletionToCloud(syncRecordId);
  } catch (error) {
    console.warn('経費記録は端末内から削除しましたが、クラウド削除同期に失敗しました。', error);
  }
}
