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

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function cloudRecordIsNewer(cloud: CloudSaleRecord, local: SyncedSaleRecord) {
  const cloudTime = parseTimestamp(cloud.cloudUpdatedAt);
  const localCloudTime = parseTimestamp(local.cloudUpdatedAt);
  if (Number.isNaN(cloudTime)) return false;
  if (Number.isNaN(localCloudTime)) return true;
  return cloudTime > localCloudTime;
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

async function syncSaleDeletionToCloud(syncRecordId: string) {
  if (!shouldUseCloudSync()) return;

  const token = getAuthToken();
  if (!token) return;

  const response = await fetch(`/api/sales/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error(await readSyncError(response));
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

function localIdFromSyncId(syncId: string) {
  return syncId.startsWith('sale:') ? syncId.slice('sale:'.length) : syncId;
}

function normalizeCloudSale(record: CloudSaleRecord, localId: string): SyncedSaleRecord {
  return {
    id: localId,
    targetType: (record.targetType || '子牛') as TargetType,
    targetNumber: String(record.targetNumber || ''),
    targetName: String(record.targetName || ''),
    sex: String(record.sex || ''),
    birthday: String(record.birthday || ''),
    motherName: String(record.motherName || ''),
    shippingPlanDate: String(record.shippingPlanDate || ''),
    shippingDate: String(record.shippingDate || ''),
    saleDate: String(record.saleDate || ''),
    buyer: String(record.buyer || ''),
    marketName: String(record.marketName || ''),
    saleWeight: String(record.saleWeight || ''),
    salePrice: String(record.salePrice || ''),
    status: (record.status || '出荷予定') as SaleStatus,
    reason: String(record.reason || ''),
    memo: String(record.memo || ''),
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || ''),
    syncRecordId: String(record.id),
    cloudUpdatedAt: record.cloudUpdatedAt,
    cloudSyncPending: false,
  };
}

async function pullSaleChangesFromCloud() {
  if (!shouldUseCloudSync()) return 0;

  const token = getAuthToken();
  if (!token) return 0;

  const response = await fetch('/api/sales/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readSyncError(response));

  const cloudRecords = await response.json() as CloudSaleRecord[];
  const localRecords = await getAllRecords<SyncedSaleRecord>('sales');
  const localBySyncId = new Map<string, SyncedSaleRecord>();

  for (const item of localRecords) {
    localBySyncId.set(item.syncRecordId || `sale:${item.id}`, item);
  }

  let applied = 0;

  for (const cloud of cloudRecords) {
    const syncId = String(cloud.id || '').trim();
    if (!syncId) continue;

    const local = localBySyncId.get(syncId);
    if (local) {
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      const saved = await saveRecordPreservingTimestamps<SyncedSaleRecord>(
        'sales',
        normalizeCloudSale(cloud, local.id),
      );
      localBySyncId.set(syncId, saved);
      applied += 1;
      continue;
    }

    const localId = localIdFromSyncId(syncId);
    if (!localId) continue;

    const saved = await saveRecordPreservingTimestamps<SyncedSaleRecord>(
      'sales',
      normalizeCloudSale(cloud, localId),
    );
    localBySyncId.set(syncId, saved);
    applied += 1;
  }

  return applied;
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
  try {
    await pullSaleChangesFromCloud();
  } catch (error) {
    console.warn('出荷・販売記録のクラウド取り込みをスキップしました。', error);
  }

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
  const existing = await getRecordById<SyncedSaleRecord>('sales', id);
  const syncRecordId = existing?.syncRecordId || `sale:${id}`;

  await deleteRecord('sales', id);

  try {
    await syncSaleDeletionToCloud(syncRecordId);
  } catch (error) {
    console.warn('出荷・販売記録は端末内から削除しましたが、クラウド削除同期に失敗しました。', error);
  }
}
