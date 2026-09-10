import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import type { FarmTaxRate } from '../types/settings';
import { getAuthToken } from './authClient';
import {
  allocateByWeight,
  calculateMovingAverageCost,
  feedCostQuantity,
  type FeedCostingSnapshot,
} from './feedCostAllocation';

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
  bagWeightKg: string;
  totalWeightKg: string;
  unitPrice: string;
  totalPrice: string;
  supplier: string;
  taxRate?: FarmTaxRate;
  taxExcludedPrice?: string;
  taxAmount?: string;
  memo: string;
  costing?: FeedCostingSnapshot;
  createdAt: string;
  updatedAt: string;
};

type SyncedFeedInventoryRecord = FeedInventoryRecord & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
};

type CloudFeedInventoryRecord = Omit<Partial<SyncedFeedInventoryRecord>, 'id'> & {
  id: string;
  cloudUpdatedAt?: string;
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
  bagWeightKg: '',
  totalWeightKg: '',
  unitPrice: '',
  totalPrice: '',
  supplier: '',
  taxExcludedPrice: '',
  taxAmount: '',
  memo: '',
};

function normalizeTaxRate(value: unknown): FarmTaxRate | undefined {
  return value === '10' || value === '8' || value === '0' ? value : undefined;
}

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

function createLocalRecordId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  return `feed-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function cloudRecordIsNewer(
  cloud: CloudFeedInventoryRecord,
  local: SyncedFeedInventoryRecord,
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
    return body.message || `飼料在庫記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `飼料在庫記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function syncFeedInventoryRecordToCloud(
  record: SyncedFeedInventoryRecord,
): Promise<CloudFeedInventoryRecord | null> {
  if (!shouldUseCloudSync()) return null;

  const token = getAuthToken();
  if (!token) return null;

  const syncRecordId = record.syncRecordId || `feed-inventory:${record.id}`;
  const response = await fetch(
    `/api/feed-inventory/record-sync/${encodeURIComponent(syncRecordId)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ ...record, id: syncRecordId, syncRecordId }),
    },
  );

  if (!response.ok) throw new Error(await readSyncError(response));
  return response.json() as Promise<CloudFeedInventoryRecord>;
}

async function syncFeedInventoryDeletionToCloud(syncRecordId: string) {
  if (!shouldUseCloudSync()) return;

  const token = getAuthToken();
  if (!token) return;

  const response = await fetch(
    `/api/feed-inventory/record-sync/${encodeURIComponent(syncRecordId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!response.ok) throw new Error(await readSyncError(response));
}

async function syncFeedInventoryAfterLocalSave(record: SyncedFeedInventoryRecord) {
  try {
    const synced = await syncFeedInventoryRecordToCloud(record);
    if (!synced?.cloudUpdatedAt) return;

    await saveRecordPreservingTimestamps<SyncedFeedInventoryRecord>(
      'feedInventory',
      {
        ...record,
        syncRecordId:
          synced.id || record.syncRecordId || `feed-inventory:${record.id}`,
        cloudUpdatedAt: synced.cloudUpdatedAt,
        cloudSyncPending: false,
      },
    );
  } catch (error) {
    console.warn(
      '飼料在庫記録は端末内に保存しましたが、クラウド同期に失敗しました。',
      error,
    );
  }
}

function localIdFromSyncId(syncId: string) {
  return syncId.startsWith('feed-inventory:')
    ? syncId.slice('feed-inventory:'.length)
    : syncId;
}

function normalizeCloudFeedInventory(
  record: CloudFeedInventoryRecord,
  localId: string,
): SyncedFeedInventoryRecord {
  return {
    id: localId,
    transactionDate: String(record.transactionDate || ''),
    feedName: String(record.feedName || ''),
    transactionType: String(record.transactionType || '入庫'),
    quantity: String(record.quantity || ''),
    unit: String(record.unit || 'kg'),
    bagWeightKg: String(record.bagWeightKg || ''),
    totalWeightKg: String(record.totalWeightKg || ''),
    unitPrice: String(record.unitPrice || ''),
    totalPrice: String(record.totalPrice || ''),
    supplier: String(record.supplier || ''),
    taxRate: normalizeTaxRate(record.taxRate),
    taxExcludedPrice: String(record.taxExcludedPrice || ''),
    taxAmount: String(record.taxAmount || ''),
    memo: String(record.memo || ''),
    costing: record.costing,
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || ''),
    syncRecordId: String(record.id),
    cloudUpdatedAt: record.cloudUpdatedAt,
    cloudSyncPending: false,
  };
}

async function pullFeedInventoryChangesFromCloud() {
  if (!shouldUseCloudSync()) return 0;

  const token = getAuthToken();
  if (!token) return 0;

  const response = await fetch('/api/feed-inventory/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readSyncError(response));

  const cloudRecords = await response.json() as CloudFeedInventoryRecord[];
  const localRecords = await getAllRecords<SyncedFeedInventoryRecord>('feedInventory');
  const localBySyncId = new Map<string, SyncedFeedInventoryRecord>();

  for (const item of localRecords) {
    localBySyncId.set(
      item.syncRecordId || `feed-inventory:${item.id}`,
      item,
    );
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

      await deleteRecord('feedInventory', local.id);
      localBySyncId.delete(syncId);
      applied += 1;
      continue;
    }

    if (local) {
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      const saved = await saveRecordPreservingTimestamps<SyncedFeedInventoryRecord>(
        'feedInventory',
        normalizeCloudFeedInventory(cloud, local.id),
      );
      localBySyncId.set(syncId, saved);
      applied += 1;
      continue;
    }

    const localId = localIdFromSyncId(syncId);
    if (!localId) continue;

    const saved = await saveRecordPreservingTimestamps<SyncedFeedInventoryRecord>(
      'feedInventory',
      normalizeCloudFeedInventory(cloud, localId),
    );
    localBySyncId.set(syncId, saved);
    applied += 1;
  }

  return applied;
}

function normalizeLegacyManualCosting(costing?: FeedCostingSnapshot) {
  if (
    !costing ||
    costing.allocationMethod !== 'manual' ||
    costing.targetType !== 'calfGroup' ||
    costing.allocations.length === 0
  ) {
    return costing;
  }

  const totalWeight = costing.allocations.reduce(
    (sum, item) => sum + Math.max(0, Number(item.weight) || 0),
    0,
  );
  if (totalWeight <= 0) return costing;

  return {
    ...costing,
    allocationMethod: 'calfAgeWeighted' as const,
    allocations: allocateByWeight(
      costing.allocations.map((item) => ({ ...item, weight: Math.max(0, Number(item.weight) || 0) })),
      costing.usedQuantity,
      costing.usedCost,
    ),
    calculatedAt: new Date().toISOString(),
  };
}

async function normalizeLegacyManualCostingRecords() {
  const records = await getAllRecords<SyncedFeedInventoryRecord>('feedInventory');
  const normalized: SyncedFeedInventoryRecord[] = [];

  for (const record of records) {
    const costing = normalizeLegacyManualCosting(record.costing);
    if (costing === record.costing) {
      normalized.push(record);
      continue;
    }

    const saved = await saveRecord<SyncedFeedInventoryRecord>('feedInventory', {
      ...record,
      costing,
      syncRecordId: record.syncRecordId || `feed-inventory:${record.id}`,
      cloudSyncPending: shouldUseCloudSync(),
      updatedAt: new Date().toISOString(),
    });
    await syncFeedInventoryAfterLocalSave(saved);
    normalized.push(saved);
  }

  return normalized;
}

function compareFeedRows(a: FeedInventoryRecord, b: FeedInventoryRecord) {
  const dateCompare = String(a.transactionDate || '').localeCompare(String(b.transactionDate || ''));
  if (dateCompare !== 0) return dateCompare;
  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
}

function recalculateCostingToAverage(costing: FeedCostingSnapshot, averageUnitCost: number) {
  const usedCost = costing.usedQuantity * averageUnitCost;
  return {
    ...costing,
    averageUnitCost,
    usedCost,
    allocations: costing.allocations.map((item) => ({
      ...item,
      allocatedCost: item.allocatedQuantity * averageUnitCost,
    })),
    actualIntake: costing.actualIntake
      ? {
          ...costing.actualIntake,
          averageUnitCost,
          totalCost: costing.actualIntake.totalQuantity * averageUnitCost,
          items: costing.actualIntake.items.map((item) => ({
            ...item,
            actualCost: item.actualQuantity * averageUnitCost,
          })),
        }
      : undefined,
    calculatedAt: new Date().toISOString(),
  };
}

async function reconcileTaxAdjustedOutboundCosts(records: SyncedFeedInventoryRecord[]) {
  const hasTaxExcludedPurchase = new Set(
    records
      .filter((row) => row.transactionType === '入庫' && Number(row.taxExcludedPrice || 0) > 0)
      .map((row) => row.feedName.trim()),
  );
  if (hasTaxExcludedPurchase.size === 0) return records;

  const ordered = [...records].sort(compareFeedRows);
  const working: SyncedFeedInventoryRecord[] = [];
  const changed = new Map<string, SyncedFeedInventoryRecord>();

  for (const record of ordered) {
    if (
      record.transactionType !== '出庫' ||
      !record.costing ||
      !hasTaxExcludedPurchase.has(record.feedName.trim())
    ) {
      working.push(record);
      continue;
    }

    const normalizedUsage = feedCostQuantity(record);
    if (normalizedUsage.quantity <= 0) {
      working.push(record);
      continue;
    }

    const movingAverage = calculateMovingAverageCost(
      working,
      record.feedName,
      normalizedUsage.costUnit,
      record.transactionDate,
    );
    if (movingAverage.averageUnitCost <= 0) {
      working.push(record);
      continue;
    }

    const expectedUsedCost = record.costing.usedQuantity * movingAverage.averageUnitCost;
    const alreadyCorrect =
      Math.abs(Number(record.costing.averageUnitCost || 0) - movingAverage.averageUnitCost) < 0.005 &&
      Math.abs(Number(record.costing.usedCost || 0) - expectedUsedCost) < 0.5;

    if (alreadyCorrect) {
      working.push(record);
      continue;
    }

    const costing = recalculateCostingToAverage(record.costing, movingAverage.averageUnitCost);
    const saved = await saveRecord<SyncedFeedInventoryRecord>('feedInventory', {
      ...record,
      unitPrice: String(movingAverage.averageUnitCost),
      totalPrice: String(costing.usedCost),
      costing,
      syncRecordId: record.syncRecordId || `feed-inventory:${record.id}`,
      cloudSyncPending: shouldUseCloudSync(),
      updatedAt: new Date().toISOString(),
    });
    await syncFeedInventoryAfterLocalSave(saved);
    changed.set(saved.id, saved);
    working.push(saved);
  }

  return records.map((record) => changed.get(record.id) || record);
}

export function recordToInput(
  record: FeedInventoryRecord,
): FeedInventoryInput {
  return {
    transactionDate: record.transactionDate || '',
    feedName: record.feedName || '',
    transactionType: record.transactionType || '入庫',
    quantity: record.quantity || '',
    unit: record.unit || 'kg',
    bagWeightKg: record.bagWeightKg || '',
    totalWeightKg: record.totalWeightKg || '',
    unitPrice: record.unitPrice || '',
    totalPrice: record.totalPrice || '',
    supplier: record.supplier || '',
    taxRate: normalizeTaxRate(record.taxRate),
    taxExcludedPrice: record.taxExcludedPrice || '',
    taxAmount: record.taxAmount || '',
    memo: record.memo || '',
    costing: record.costing,
  };
}

export async function getFeedInventoryList(): Promise<
  FeedInventoryRecord[]
> {
  try {
    await pullFeedInventoryChangesFromCloud();
  } catch (error) {
    console.warn('飼料在庫記録のクラウド取り込みをスキップしました。', error);
  }

  const normalized = await normalizeLegacyManualCostingRecords();
  return reconcileTaxAdjustedOutboundCosts(normalized);
}

export async function getAnimalFeedCostTotal(
  animalType: 'calf' | 'cattle',
  animalId: string,
): Promise<number> {
  const targetId = String(animalId || '').trim();
  if (!targetId) return 0;

  const records = await getFeedInventoryList();
  return records.reduce((total, record) => {
    if (record.transactionType !== '出庫' || !record.costing) return total;

    const allocatedCost = record.costing.allocations.reduce((sum, item) => {
      if (
        item.animalType !== animalType ||
        String(item.animalId || '').trim() !== targetId
      ) {
        return sum;
      }

      const cost = Number(item.allocatedCost);
      return sum + (Number.isFinite(cost) ? cost : 0);
    }, 0);

    return total + allocatedCost;
  }, 0);
}

export async function getFeedInventory(
  id: string,
): Promise<FeedInventoryRecord> {
  const record = await getRecordById<SyncedFeedInventoryRecord>(
    'feedInventory',
    id,
  );

  if (!record) {
    throw new Error('飼料在庫記録を取得できませんでした。');
  }

  const costing = normalizeLegacyManualCosting(record.costing);
  if (costing === record.costing) return record;

  const saved = await saveRecord<SyncedFeedInventoryRecord>('feedInventory', {
    ...record,
    costing,
    syncRecordId: record.syncRecordId || `feed-inventory:${record.id}`,
    cloudSyncPending: shouldUseCloudSync(),
    updatedAt: new Date().toISOString(),
  });
  await syncFeedInventoryAfterLocalSave(saved);
  return saved;
}

export async function createFeedInventory(
  input: FeedInventoryInput,
): Promise<FeedInventoryRecord> {
  const now = new Date().toISOString();
  const id = createLocalRecordId();

  const saved = await saveRecord<SyncedFeedInventoryRecord>('feedInventory', {
    id,
    ...input,
    syncRecordId: `feed-inventory:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    createdAt: now,
    updatedAt: now,
  });

  await syncFeedInventoryAfterLocalSave(saved);
  return saved;
}

export async function updateFeedInventory(
  id: string,
  input: FeedInventoryInput,
): Promise<FeedInventoryRecord> {
  const existing = await getRecordById<SyncedFeedInventoryRecord>(
    'feedInventory',
    id,
  );

  if (!existing) {
    throw new Error('飼料在庫記録を更新できませんでした。');
  }

  const saved = await saveRecord<SyncedFeedInventoryRecord>('feedInventory', {
    ...existing,
    ...input,
    id,
    syncRecordId: existing.syncRecordId || `feed-inventory:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    updatedAt: new Date().toISOString(),
  });

  await syncFeedInventoryAfterLocalSave(saved);
  return saved;
}

export async function updateFeedInventoryCosting(
  id: string,
  costing: FeedCostingSnapshot,
): Promise<FeedInventoryRecord> {
  const existing = await getRecordById<SyncedFeedInventoryRecord>(
    'feedInventory',
    id,
  );

  if (!existing || existing.transactionType !== '出庫') {
    throw new Error('原価按分を更新できませんでした。');
  }

  const saved = await saveRecord<SyncedFeedInventoryRecord>('feedInventory', {
    ...existing,
    costing,
    id,
    syncRecordId: existing.syncRecordId || `feed-inventory:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    updatedAt: new Date().toISOString(),
  });

  await syncFeedInventoryAfterLocalSave(saved);
  return saved;
}

export async function deleteFeedInventory(
  id: string,
): Promise<void> {
  const current = await getRecordById<SyncedFeedInventoryRecord>(
    'feedInventory',
    id,
  );
  const syncRecordId = current?.syncRecordId || `feed-inventory:${id}`;

  await deleteRecord('feedInventory', id);

  try {
    await syncFeedInventoryDeletionToCloud(syncRecordId);
  } catch (error) {
    console.warn(
      '飼料在庫記録は端末内から削除しましたが、クラウド削除同期に失敗しました。',
      error,
    );
  }
}
