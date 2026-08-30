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

export type SaleStatus = '出荷予定' | '出荷済み' | '販売済み' | '取消';
export type TargetType = '子牛' | '成牛' | 'その他';

export type SaleRecord = {
  id: string;
  targetType: TargetType;
  targetNumber: string;
  targetName: string;
  sex: string;
  birthday: string;
  motherName: string;
  shippingPlanDate: string;
  shippingDate: string;
  saleDate: string;
  buyer: string;
  marketName: string;
  saleWeight: string;
  salePrice: string;
  status: SaleStatus;
  reason: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

type SyncedSaleRecord = SaleRecord & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
};

type CloudSaleRecord = Omit<Partial<SyncedSaleRecord>, 'id'> & {
  id: string;
  cloudUpdatedAt?: string;
};

export type SaleInput = Omit<
  SaleRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export const emptySaleInput: SaleInput = {
  targetType: '子牛',
  targetNumber: '',
  targetName: '',
  sex: '',
  birthday: '',
  motherName: '',
  shippingPlanDate: '',
  shippingDate: '',
  saleDate: '',
  buyer: '',
  marketName: '',
  saleWeight: '',
  salePrice: '',
  status: '出荷予定',
  reason: '',
  memo: '',
};

function createSaleId() {
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

async function readSyncError(response: Response) {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `出荷・販売記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `出荷・販売記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function syncSaleRecordToCloud(record: SyncedSaleRecord): Promise<CloudSaleRecord | null> {
  if (!shouldUseCloudSync()) return null;

  const token = getAuthToken();
  if (!token) return null;

  const syncRecordId = record.syncRecordId || `sale:${record.id}`;
  const response = await fetch(`/api/sales/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...record, id: syncRecordId, syncRecordId }),
  });

  if (!response.ok) throw new Error(await readSyncError(response));
  return response.json() as Promise<CloudSaleRecord>;
}

async function syncSaleAfterLocalSave(record: SyncedSaleRecord) {
  try {
    const synced = await syncSaleRecordToCloud(record);
    if (!synced?.cloudUpdatedAt) return;

    await saveRecordPreservingTimestamps<SyncedSaleRecord>('sales', {
      ...record,
      syncRecordId: synced.id || record.syncRecordId || `sale:${record.id}`,
      cloudUpdatedAt: synced.cloudUpdatedAt,
      cloudSyncPending: false,
    });
  } catch (error) {
    console.warn('出荷・販売記録は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

export function recordToInput(record: SaleRecord): SaleInput {
  return {
    targetType: record.targetType || '子牛',
    targetNumber: record.targetNumber || '',
    targetName: record.targetName || '',
    sex: record.sex || '',
    birthday: record.birthday || '',
    motherName: record.motherName || '',
    shippingPlanDate: record.shippingPlanDate || '',
    shippingDate: record.shippingDate || '',
    saleDate: record.saleDate || '',
    buyer: record.buyer || '',
    marketName: record.marketName || '',
    saleWeight: record.saleWeight || '',
    salePrice: record.salePrice || '',
    status: record.status || '出荷予定',
    reason: record.reason || '',
    memo: record.memo || '',
  };
}

export async function getSalesList(): Promise<SaleRecord[]> {
  return getAllRecords<SaleRecord>('sales');
}

export async function getSale(id: string): Promise<SaleRecord> {
  const record = await getRecordById<SaleRecord>('sales', id);

  if (!record) {
    throw new Error('出荷・販売記録を取得できませんでした。');
  }

  return record;
}

export async function createSale(
  input: SaleInput,
): Promise<SaleRecord> {
  const now = new Date().toISOString();
  const id = createSaleId();

  const saved = await saveRecord<SyncedSaleRecord>('sales', {
    id,
    ...input,
    syncRecordId: `sale:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    createdAt: now,
    updatedAt: now,
  });

  await syncSaleAfterLocalSave(saved);
  return saved;
}

export async function updateSale(
  id: string,
  input: SaleInput,
): Promise<SaleRecord> {
  const existing = await getRecordById<SyncedSaleRecord>('sales', id);

  if (!existing) {
    throw new Error('出荷・販売記録を更新できませんでした。');
  }

  const saved = await saveRecord<SyncedSaleRecord>('sales', {
    ...existing,
    ...input,
    id,
    syncRecordId: existing.syncRecordId || `sale:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    updatedAt: new Date().toISOString(),
  });

  await syncSaleAfterLocalSave(saved);
  return saved;
}

export async function deleteSale(id: string): Promise<void> {
  await deleteRecord('sales', id);
}
