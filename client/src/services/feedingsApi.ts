import {
  getAllRecords,
  getRecordById,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import { openFarmProDatabase } from '../storage/db';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { getAuthToken } from './authClient';
import { calculateMovingAverageCost, feedCostQuantity, type FeedCostingSnapshot } from './feedCostAllocation';
import { syncLinkedFeedInventoryDeletion, syncLinkedFeedInventoryRecord } from './feedInventoryApi';

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

type SyncedFeedingRecord = FeedingRecord & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
};

type CloudFeedingRecord = Omit<Partial<SyncedFeedingRecord>, 'id'> & {
  id: string;
  cloudUpdatedAt?: string;
};

type LinkedFeedInventoryRecord = {
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
  memo: string;
  costing?: FeedCostingSnapshot;
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
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

function shouldUseCloudSync() {
  return getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync;
}

function waitForLinkedTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('飼料給与と在庫の保存に失敗しました。'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('飼料給与と在庫の保存が中断されました。'));
  });
}

function waitForLinkedRequest<T>(request: IDBRequest<T>): Promise<T> {
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

  if (record.purpose) parts.push(`目的:${record.purpose}`);
  if (record.memo) parts.push(`メモ:${record.memo}`);

  return parts.join(' ');
}

async function findLinkedInventoryRecords(
  store: IDBObjectStore,
  feedingId: string,
): Promise<LinkedFeedInventoryRecord[]> {
  const all = await waitForLinkedRequest(
    store.getAll() as IDBRequest<LinkedFeedInventoryRecord[]>,
  );
  const marker = inventoryLinkMarker(feedingId);
  return all.filter((record) => record.memo?.includes(marker));
}

async function saveLocalFeedingWithInventory(
  record: SyncedFeedingRecord,
  preserveTimestamps = false,
  syncLinkedInventory = true,
): Promise<SyncedFeedingRecord> {
  const database = await openFarmProDatabase();
  const transaction = database.transaction(
    ['feedings', 'feedInventory'],
    'readwrite',
  );
  const feedingStore = transaction.objectStore('feedings');
  const inventoryStore = transaction.objectStore('feedInventory');
  const now = new Date().toISOString();

  const existingFeeding = await waitForLinkedRequest(
    feedingStore.get(record.id) as IDBRequest<SyncedFeedingRecord | undefined>,
  );

  const savedFeeding: SyncedFeedingRecord = {
    ...record,
    createdAt: preserveTimestamps
      ? (record.createdAt || existingFeeding?.createdAt || now)
      : (existingFeeding?.createdAt || record.createdAt || now),
    updatedAt: preserveTimestamps ? (record.updatedAt || now) : now,
  };

  const allInventoryRecords = await waitForLinkedRequest(
    inventoryStore.getAll() as IDBRequest<LinkedFeedInventoryRecord[]>,
  );
  const linkedInventoryRecords = allInventoryRecords.filter((item) =>
    item.memo?.includes(inventoryLinkMarker(savedFeeding.id)),
  );
  const existingInventory = linkedInventoryRecords[0];
  const deterministicInventoryId = `feeding-inventory:${savedFeeding.id}`;

  const latestBagWeight = [...allInventoryRecords]
    .filter((item) =>
      item.feedName.trim() === savedFeeding.feedName.trim() &&
      item.unit === '袋' &&
      Number(item.bagWeightKg || 0) > 0
    )
    .sort((a, b) =>
      String(b.transactionDate || '').localeCompare(String(a.transactionDate || '')) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    )[0]?.bagWeightKg || '';

  const bagWeightKg = savedFeeding.unit === '袋'
    ? (existingInventory?.bagWeightKg || latestBagWeight)
    : '';
  const totalWeightKg = savedFeeding.unit === '袋' && Number(bagWeightKg) > 0
    ? String(Number(savedFeeding.amount || 0) * Number(bagWeightKg))
    : '';

  const quantityInfo = feedCostQuantity({
    quantity: savedFeeding.amount,
    unit: savedFeeding.unit,
    bagWeightKg,
    totalWeightKg,
  });

  const costRows = allInventoryRecords.filter(
    (item) => !linkedInventoryRecords.some((linked) => linked.id === item.id),
  );
  const movingAverage = calculateMovingAverageCost(
    costRows,
    savedFeeding.feedName,
    quantityInfo.costUnit,
    savedFeeding.feedingDate,
  );
  const usedQuantity = Math.min(
    Math.max(0, quantityInfo.quantity),
    Math.max(0, movingAverage.quantityOnHand),
  );
  const usedCost = usedQuantity * movingAverage.averageUnitCost;
  const costing: FeedCostingSnapshot = {
    targetType: 'farm',
    allocationMethod: 'none',
    costUnit: quantityInfo.costUnit,
    averageUnitCost: movingAverage.averageUnitCost,
    usedQuantity,
    usedCost,
    allocations: [],
    calculatedAt: now,
  };

  const inventoryId = existingInventory?.id ?? deterministicInventoryId;
  const inventoryRecord: LinkedFeedInventoryRecord = {
    id: inventoryId,
    transactionDate: savedFeeding.feedingDate,
    feedName: savedFeeding.feedName,
    transactionType: '出庫',
    quantity: savedFeeding.amount,
    unit: savedFeeding.unit,
    bagWeightKg,
    totalWeightKg,
    unitPrice: movingAverage.averageUnitCost > 0 ? String(movingAverage.averageUnitCost) : '',
    totalPrice: usedCost > 0 ? String(usedCost) : '',
    supplier: '',
    memo: inventoryMemo(savedFeeding),
    costing,
    syncRecordId: existingInventory?.syncRecordId || `feed-inventory:${inventoryId}`,
    cloudUpdatedAt: existingInventory?.cloudUpdatedAt,
    cloudSyncPending:
      shouldUseCloudSync() ||
      Boolean(existingInventory?.cloudUpdatedAt) ||
      existingInventory?.cloudSyncPending === true,
    createdAt: existingInventory?.createdAt ?? now,
    updatedAt: now,
  };

  feedingStore.put(savedFeeding);
  inventoryStore.put(inventoryRecord);

  for (const duplicate of linkedInventoryRecords.slice(1)) {
    inventoryStore.delete(duplicate.id);
  }

  await waitForLinkedTransaction(transaction);

  if (syncLinkedInventory) {
    try {
      await syncLinkedFeedInventoryRecord(inventoryRecord.id);
    } catch (error) {
      console.warn('飼料給与に連動した在庫出庫のクラウド同期をスキップしました。', error);
    }
  }

  return savedFeeding;
}

async function deleteLocalFeedingWithInventory(
  id: string,
  syncLinkedInventory = true,
): Promise<void> {
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

  await waitForLinkedTransaction(transaction);

  if (syncLinkedInventory) {
    for (const inventoryRecord of linkedInventoryRecords) {
      const syncRecordId =
        inventoryRecord.syncRecordId || `feed-inventory:${inventoryRecord.id}`;
      await syncLinkedFeedInventoryDeletion(syncRecordId);
    }
  }
}

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function cloudRecordIsNewer(
  cloud: CloudFeedingRecord,
  local: SyncedFeedingRecord,
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
    return body.message || `飼料給与記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `飼料給与記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function syncFeedingRecordToCloud(
  record: SyncedFeedingRecord,
): Promise<CloudFeedingRecord | null> {
  if (!shouldUseCloudSync()) return null;

  const token = getAuthToken();
  if (!token) return null;

  const syncRecordId = record.syncRecordId || `feeding:${record.id}`;
  const response = await fetch(`/api/feedings/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ...record, id: syncRecordId, syncRecordId }),
  });

  if (!response.ok) throw new Error(await readSyncError(response));
  return response.json() as Promise<CloudFeedingRecord>;
}

async function syncFeedingDeletionToCloud(syncRecordId: string) {
  if (!shouldUseCloudSync()) return;

  const token = getAuthToken();
  if (!token) return;

  const response = await fetch(`/api/feedings/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) throw new Error(await readSyncError(response));
}

async function syncFeedingAfterLocalSave(record: SyncedFeedingRecord) {
  try {
    const synced = await syncFeedingRecordToCloud(record);
    if (!synced?.cloudUpdatedAt) return;

    await saveRecordPreservingTimestamps<SyncedFeedingRecord>('feedings', {
      ...record,
      syncRecordId: synced.id || record.syncRecordId || `feeding:${record.id}`,
      cloudUpdatedAt: synced.cloudUpdatedAt,
      cloudSyncPending: false,
    });
  } catch (error) {
    console.warn('飼料給与記録は端末内に保存しましたが、クラウド同期に失敗しました。', error);
  }
}

function localIdFromSyncId(syncId: string) {
  return syncId.startsWith('feeding:')
    ? syncId.slice('feeding:'.length)
    : syncId;
}

function normalizeCloudFeeding(
  record: CloudFeedingRecord,
  localId: string,
): SyncedFeedingRecord {
  return {
    id: localId,
    feedingDate: String(record.feedingDate || ''),
    target: String(record.target || ''),
    feedName: String(record.feedName || ''),
    amount: String(record.amount || ''),
    unit: String(record.unit || 'kg'),
    unitPrice: String(record.unitPrice || ''),
    totalPrice: String(record.totalPrice || ''),
    purpose: String(record.purpose || '維持'),
    memo: String(record.memo || ''),
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || ''),
    syncRecordId: String(record.id),
    cloudUpdatedAt: record.cloudUpdatedAt,
    cloudSyncPending: false,
  };
}

async function pullFeedingChangesFromCloud() {
  if (!shouldUseCloudSync()) return 0;

  const token = getAuthToken();
  if (!token) return 0;

  const response = await fetch('/api/feedings/record-sync', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(await readSyncError(response));

  const cloudRecords = await response.json() as CloudFeedingRecord[];
  const localRecords = await getAllRecords<SyncedFeedingRecord>('feedings');
  const localBySyncId = new Map<string, SyncedFeedingRecord>();

  for (const item of localRecords) {
    localBySyncId.set(item.syncRecordId || `feeding:${item.id}`, item);
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

      await deleteLocalFeedingWithInventory(local.id, false);
      localBySyncId.delete(syncId);
      applied += 1;
      continue;
    }

    if (local) {
      if (local.cloudSyncPending) continue;
      if (!cloudRecordIsNewer(cloud, local)) continue;

      const saved = await saveLocalFeedingWithInventory(
        normalizeCloudFeeding(cloud, local.id),
        true,
        false,
      );
      localBySyncId.set(syncId, saved);
      applied += 1;
      continue;
    }

    const localId = localIdFromSyncId(syncId);
    if (!localId) continue;

    const saved = await saveLocalFeedingWithInventory(
      normalizeCloudFeeding(cloud, localId),
      true,
      false,
    );
    localBySyncId.set(syncId, saved);
    applied += 1;
  }

  return applied;
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
  try {
    await pullFeedingChangesFromCloud();
  } catch (error) {
    console.warn('飼料給与記録のクラウド取り込みをスキップしました。', error);
  }

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
  const id = crypto.randomUUID();

  const saved = await saveLocalFeedingWithInventory({
    id,
    ...input,
    syncRecordId: `feeding:${id}`,
    cloudSyncPending: shouldUseCloudSync(),
    createdAt: now,
    updatedAt: now,
  });

  await syncFeedingAfterLocalSave(saved);
  return saved;
}

export async function updateFeeding(
  id: string,
  input: FeedingInput,
): Promise<FeedingRecord> {
  const existing = await getRecordById<SyncedFeedingRecord>('feedings', id);

  if (!existing) {
    throw new Error('飼料給与記録を更新できませんでした。');
  }

  const saved = await saveLocalFeedingWithInventory({
    ...existing,
    ...input,
    id,
    syncRecordId: existing.syncRecordId || `feeding:${id}`,
    // Keep Free edits protected from receive after returning to a paid plan.
    cloudSyncPending: shouldUseCloudSync() || Boolean(existing.cloudUpdatedAt) || existing.cloudSyncPending === true,
    updatedAt: new Date().toISOString(),
  });

  await syncFeedingAfterLocalSave(saved);
  return saved;
}

export async function deleteFeeding(id: string): Promise<void> {
  const existing = await getRecordById<SyncedFeedingRecord>('feedings', id);
  const syncRecordId = existing?.syncRecordId || `feeding:${id}`;

  await deleteLocalFeedingWithInventory(id);

  try {
    await syncFeedingDeletionToCloud(syncRecordId);
  } catch (error) {
    console.warn('飼料給与記録は端末内から削除しましたが、クラウド削除同期に失敗しました。', error);
  }
}
