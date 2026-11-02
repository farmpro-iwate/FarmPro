import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { hasPendingSupplyLinkedRecord, queueSupplyLinkedRecord } from './supplyInventoryLinkedSync';
import { openFarmProDatabase } from '../storage/db';
import { syncSupplyInventorySafely } from './supplyInventorySync';

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
export type ExpenseSourceType = 'treatment' | 'breeding' | 'vaccine' | 'manual';

export type ExpenseRecord = {
  id: string;
  /** Stable cloud key; the local IndexedDB key may differ between devices. */
  syncRecordId?: string;
  cloudSyncPending?: boolean;
  /** Server-projected settlement ownership; never inferred from the memo. */
  settlementSaleId?: string;
  settlementNumber?: string;
  settlementExpenseKind?: 'created' | 'linked';
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
  sourceSupplyMovementId?: string;
  sourceSupplyPurchaseReference?: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

type SyncedExpenseRecord = ExpenseRecord & {
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
  /** Local-only proof that this browser owns an initial, unacknowledged save. */
  expenseRetryOrigin?: ExpenseRetryOrigin;
};

type ExpenseRetryOrigin = { version: 1; farmId: string; userId: string; ownerId: string };
type ExpenseSyncContext = {
  farmId: string | null; userId: string | null; token: string | null; cloudEnabled: boolean;
};
type ExpenseRetryContext = ExpenseSyncContext & ExpenseRetryOrigin;

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

export type AnimalExpenseTotals = {
  medical: number;
  breeding: number;
  other: number;
  nonFeedTotal: number;
  /** Exact cloud expense IDs included in this calculation, not historical inference. */
  includedExpenseIds?: string[];
  includedExpenseAmounts?: Record<string, number>;
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

export const EXPENSE_SYNC_STATUS_EVENT = 'farmpro:expense-sync-status';
const expenseSyncWork = new Map<string, Promise<void>>();
const expenseRetries = new Map<string, { promise: Promise<number>; requestedAgain: boolean }>();

export function canRetryUnsentExpensesOnPage(pathname: string): boolean {
  return !/\/(?:device-sync|backups?)(?:\/|$)/.test(pathname) &&
    !/^\/sales\/[^/]+\/settlement(?:\/|$)/.test(pathname);
}

export function expenseSyncContext(): ExpenseSyncContext {
  const user = getStoredAuthUser();
  return { farmId: user?.farmId ?? null, userId: user?.id ?? null,
    token: getAuthToken(), cloudEnabled: shouldUseCloudSync() };
}

export function assertExpenseSyncContext(expected: ExpenseSyncContext): void {
  const current = expenseSyncContext();
  if (current.farmId !== expected.farmId || current.userId !== expected.userId ||
      current.token !== expected.token || current.cloudEnabled !== expected.cloudEnabled) {
    throw new Error('ログインまたは農場の情報が変わったため、経費の同期を中止しました。');
  }
}

function expenseRetryOwner(farmId: string, create = false): string | null {
  try {
    const key = `farmpro.expenseRetryOwner.${encodeURIComponent(farmId)}`;
    let owner = window.localStorage.getItem(key);
    if (!owner && create) {
      owner = createExpenseId();
      window.localStorage.setItem(key, owner);
    }
    return owner || null;
  } catch { return null; }
}

function newExpenseRetryOrigin(context: ExpenseSyncContext): ExpenseRetryOrigin | undefined {
  if (!context.cloudEnabled || !context.token || !context.farmId || !context.userId) return;
  const ownerId = expenseRetryOwner(context.farmId, true);
  return ownerId ? { version: 1, farmId: context.farmId, userId: context.userId, ownerId } : undefined;
}

function assertExpenseRetryContext(context: ExpenseRetryContext): void {
  assertExpenseSyncContext(context);
  if (expenseRetryOwner(context.farmId) !== context.ownerId ||
      !canRetryUnsentExpensesOnPage(window.location?.pathname || '')) {
    throw new Error('経費の同期状態が変わったため、送信待ち記録を保持しました。');
  }
}

// Serialize reads, saves and retries so delayed replies cannot undo a later deletion.
async function withExpenseSync<T>(action: (context: ExpenseSyncContext) => Promise<T>): Promise<T> {
  const context = expenseSyncContext();
  const key = `farmpro:expense-record-sync:${encodeURIComponent(context.farmId || 'anonymous')}`;
  const run = () => { assertExpenseSyncContext(context); return action(context); };
  if (navigator.locks?.request) return navigator.locks.request(key, run);
  const previous = expenseSyncWork.get(key) ?? Promise.resolve();
  const work = previous.then(run);
  const settled = work.then(() => undefined, () => undefined);
  expenseSyncWork.set(key, settled);
  try { return await work; }
  finally { if (expenseSyncWork.get(key) === settled) expenseSyncWork.delete(key); }
}

function expenseCloudId(record: SyncedExpenseRecord): string {
  return record.syncRecordId || `expense:${record.id}`;
}

function supplyExpenseQueueId(record: SyncedExpenseRecord): string {
  return `supply-linked-sync:expenses:${encodeURIComponent(expenseCloudId(record))}`;
}

function stableExpenseValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableExpenseValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, stableExpenseValue(entry)]));
}

function sameExpenseContent(left: SyncedExpenseRecord | CloudExpenseRecord,
  right: SyncedExpenseRecord | CloudExpenseRecord): boolean {
  const content = (record: SyncedExpenseRecord | CloudExpenseRecord) => {
    const { id: _id, syncRecordId: _syncId, cloudUpdatedAt: _cloudAt,
      cloudSyncPending: _pending, expenseRetryOrigin: _origin, ...fields } = record;
    // Match the server's empty defaults, without treating a blank payment method as cash.
    return stableExpenseValue({ paymentDate: '', category: '', description: '', vendor: '', amount: '',
      paymentMethod: '', target: '', memo: '', ...fields });
  };
  return JSON.stringify(content(left)) === JSON.stringify(content(right));
}

function isOwnedUnsentExpense(record: SyncedExpenseRecord, context: ExpenseRetryContext): boolean {
  const origin = record.expenseRetryOrigin;
  return record.cloudSyncPending === true && !record.cloudUpdatedAt && !record.deletedAt &&
    !record.settlementSaleId && record.syncRecordId === `expense:${record.id}` &&
    !record.sourceSupplyMovementId && !record.sourceSupplyPurchaseReference &&
    origin?.version === 1 && origin.farmId === context.farmId &&
    origin.userId === context.userId && origin.ownerId === context.ownerId;
}

/** Compare and acknowledge in one transaction; never recreate a removed or re-edited row. */
async function checkPendingExpense(
  record: SyncedExpenseRecord, context: ExpenseSyncContext,
  synced?: CloudExpenseRecord, retryContext?: ExpenseRetryContext,
): Promise<boolean> {
  const checkContext = () => retryContext ? assertExpenseRetryContext(retryContext) : assertExpenseSyncContext(context);
  checkContext();
  const db = await openFarmProDatabase();
  checkContext();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['expenses', 'metadata'], synced ? 'readwrite' : 'readonly');
    const current = tx.objectStore('expenses').get(record.id);
    const linked = tx.objectStore('metadata').get(supplyExpenseQueueId(record));
    let accepted = false;
    let failure: unknown;
    let remaining = 2;
    const ready = () => {
      if (--remaining !== 0) return;
      try {
        checkContext();
        const latest = current.result as SyncedExpenseRecord | undefined;
        if (!latest || linked.result || latest.cloudSyncPending !== true ||
            expenseCloudId(latest) !== expenseCloudId(record) || latest.cloudUpdatedAt !== record.cloudUpdatedAt ||
            JSON.stringify(latest.expenseRetryOrigin) !== JSON.stringify(record.expenseRetryOrigin) ||
            !sameExpenseContent(latest, record) || (retryContext && !isOwnedUnsentExpense(latest, retryContext))) return;
        if (synced) {
          if (synced.id !== expenseCloudId(record) || !synced.cloudUpdatedAt ||
              Number.isNaN(Date.parse(synced.cloudUpdatedAt))) return;
          const { expenseRetryOrigin: _origin, ...acknowledged } = latest;
          tx.objectStore('expenses').put({ ...acknowledged, syncRecordId: synced.id,
            cloudUpdatedAt: synced.cloudUpdatedAt, cloudSyncPending: false });
        }
        accepted = true;
      } catch (error) { failure = error; tx.abort(); }
    };
    current.onsuccess = ready;
    linked.onsuccess = ready;
    tx.oncomplete = () => resolve(accepted);
    tx.onabort = () => reject(failure || tx.error || new Error('経費の同期結果を保存できませんでした。'));
  });
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

function normalizeIdentity(value?: string) {
  return (value || '').trim().toLocaleLowerCase();
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

async function requestExpenseSync<T>(path: string, init: RequestInit, readBody = true): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(await readSyncError(response));
    return readBody ? await response.json() as T : undefined as T;
  } finally { clearTimeout(timeout); }
}

async function syncExpenseRecordToCloud(
  record: SyncedExpenseRecord,
  context: ExpenseSyncContext,
  createOnly = false,
): Promise<CloudExpenseRecord | null> {
  assertExpenseSyncContext(context);
  if (!context.cloudEnabled || !context.token) return null;

  const syncRecordId = expenseCloudId(record);
  const { expenseRetryOrigin: _origin, ...payload } = record;
  const synced = await requestExpenseSync<CloudExpenseRecord>(`/api/expenses/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${context.token}`,
      ...(createOnly ? { 'If-None-Match': '*' } : {}),
    },
    body: JSON.stringify({ ...payload, id: syncRecordId, syncRecordId }),
  });

  assertExpenseSyncContext(context);
  return synced;
}

async function syncExpenseDeletionToCloud(syncRecordId: string, context: ExpenseSyncContext) {
  assertExpenseSyncContext(context);
  if (!context.cloudEnabled) return;
  if (!context.token) throw new Error('経費の登録状況を確認するため、ログインして通信できる状態で削除してください。');

  await requestExpenseSync<void>(`/api/expenses/record-sync/${encodeURIComponent(syncRecordId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${context.token}` },
  }, false);

  assertExpenseSyncContext(context);
}

async function syncExpenseAfterLocalSave(record: SyncedExpenseRecord, context: ExpenseSyncContext) {
  try {
    if (!context.cloudEnabled || !context.token || !await checkPendingExpense(record, context)) return;
    const synced = await syncExpenseRecordToCloud(record, context);
    if (!synced?.cloudUpdatedAt) return;
    await checkPendingExpense(record, context, synced);
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
    paymentMethod: String(record.paymentMethod ?? ''),
    target: String(record.target || ''),
    animalType: record.animalType,
    animalId: record.animalId ? String(record.animalId) : undefined,
    animalEarTag: record.animalEarTag ? String(record.animalEarTag) : undefined,
    animalName: record.animalName ? String(record.animalName) : undefined,
    sourceType: record.sourceType,
    sourceId: record.sourceId ? String(record.sourceId) : undefined,
    sourceDetail: record.sourceDetail ? String(record.sourceDetail) : undefined,
    sourceSupplyMovementId: record.sourceSupplyMovementId,
    sourceSupplyPurchaseReference: record.sourceSupplyPurchaseReference,
    memo: String(record.memo || ''),
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || ''),
    syncRecordId: String(record.id),
    cloudUpdatedAt: record.cloudUpdatedAt,
    cloudSyncPending: false,
    settlementSaleId: record.settlementSaleId,
    settlementNumber: record.settlementNumber,
    settlementExpenseKind: record.settlementExpenseKind,
  };
}

async function pullExpenseChangesFromCloud(context: ExpenseSyncContext) {
  assertExpenseSyncContext(context);
  if (!context.cloudEnabled || !context.token) return 0;

  const cloudRecords = await requestExpenseSync<CloudExpenseRecord[]>('/api/expenses/record-sync', {
    headers: { Authorization: `Bearer ${context.token}` },
    cache: 'no-store',
  });
  assertExpenseSyncContext(context);
  if (!Array.isArray(cloudRecords)) throw new Error('経費の取得結果を確認できませんでした。');
  const localRecords = await getAllRecords<SyncedExpenseRecord>('expenses');
  assertExpenseSyncContext(context);
  const localById = new Map(localRecords.map((record) => [record.id, record]));
  const localBySyncId = new Map<string, SyncedExpenseRecord>();

  for (const item of localRecords) {
    localBySyncId.set(item.syncRecordId || `expense:${item.id}`, item);
  }

  let applied = 0;

  for (const cloud of cloudRecords) {
    const syncId = String(cloud.id || '').trim();
    if (!syncId) continue;
    if (await hasPendingSupplyLinkedRecord('expenses', syncId)) continue;
    assertExpenseSyncContext(context);

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
      if (local.cloudSyncPending) {
        if (cloud.settlementSaleId) {
          throw new Error('精算済み経費に端末内の未同期変更があります。既存データを保持して利益の確認を保留しました。');
        }
        continue;
      }
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
    if (localById.has(localId)) {
      throw new Error('経費の同期IDが既存データと一致しません。既存経費は変更していません。');
    }

    const saved = await saveRecordPreservingTimestamps<SyncedExpenseRecord>(
      'expenses',
      normalizeCloudExpense(cloud, localId),
    );
    localBySyncId.set(syncId, saved);
    localById.set(localId, saved);
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

export async function getExpensesList(options: { requireCloudSync?: boolean } = {}): Promise<ExpenseRecord[]> {
  return withExpenseSync(async (context) => {
    if (options.requireCloudSync && shouldUseCloudSync() && !getAuthToken()) {
      throw new Error('販売精算の確認にはログインが必要です。');
    }
    try {
      await pullExpenseChangesFromCloud(context);
    } catch (error) {
      if (options.requireCloudSync) throw error;
      console.warn('経費記録のクラウド取り込みをスキップしました。', error);
    }

    assertExpenseSyncContext(context);
    const records = await getAllRecords<ExpenseRecord>('expenses');
    assertExpenseSyncContext(context);
    return records;
  });
}

export async function getAnimalExpenseTotals(
  animalType: ExpenseAnimalType,
  animalId: string,
  animalEarTag?: string,
): Promise<AnimalExpenseTotals> {
  const records = await getExpensesList();
  const normalizedId = String(animalId || '').trim();
  const normalizedEarTag = normalizeIdentity(animalEarTag);

  const linked = records.filter((record) => {
    if (record.animalType !== animalType) return false;

    const recordAnimalId = String(record.animalId || '').trim();
    if (normalizedId && recordAnimalId && recordAnimalId === normalizedId) return true;

    const recordEarTag = normalizeIdentity(record.animalEarTag);
    return Boolean(normalizedEarTag && recordEarTag && recordEarTag === normalizedEarTag);
  });

  return linked.reduce<AnimalExpenseTotals>((totals, record) => {
    const amount = Number(record.amount);
    if (!Number.isFinite(amount) || amount <= 0 || record.category === '飼料費' ||
        record.settlementExpenseKind === 'created' ||
        (!record.settlementSaleId && /^販売精算\s+/.test(record.memo || ''))) return totals;

    totals.nonFeedTotal += amount;
    totals.includedExpenseIds!.push(record.syncRecordId || `expense:${record.id}`);
    totals.includedExpenseAmounts![record.syncRecordId || `expense:${record.id}`] = amount;
    if (record.category === '診療費' || record.category === '医薬品費') {
      totals.medical += amount;
    } else if (record.category === '種付け・繁殖費') {
      totals.breeding += amount;
    } else {
      totals.other += amount;
    }
    return totals;
  }, { medical: 0, breeding: 0, other: 0, nonFeedTotal: 0, includedExpenseIds: [], includedExpenseAmounts: Object.create(null) });
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
  return withExpenseSync(async (context) => {
    const now = new Date().toISOString();
    const id = createExpenseId();

    const saved = await saveRecord<SyncedExpenseRecord>('expenses', {
      id,
      ...input,
      syncRecordId: `expense:${id}`,
      cloudSyncPending: context.cloudEnabled,
      expenseRetryOrigin: newExpenseRetryOrigin(context),
      createdAt: now,
      updatedAt: now,
    });

    assertExpenseSyncContext(context);
    await syncExpenseAfterLocalSave(saved, context);
    return saved;
  });
}

export async function retryPendingExpenseSync(ids: string[]): Promise<number> {
  return withExpenseSync(async (context) => {
    if (!context.cloudEnabled || !context.token) return 0;
    let completed = 0;
    for (const id of new Set(ids)) {
      const record = await getRecordById<SyncedExpenseRecord>('expenses', id);
      if (!record?.cloudSyncPending || record.syncRecordId !== `expense:${id}`) continue;
      if (await hasPendingSupplyLinkedRecord('expenses', record.syncRecordId)) continue;
      await syncExpenseAfterLocalSave(record, context);
      const updated = await getRecordById<SyncedExpenseRecord>('expenses', id);
      if (updated && !updated.cloudSyncPending) completed += 1;
    }
    return completed;
  });
}

/** Resume initial uploads only; reads used by cost/settlement calculations never write to the cloud. */
export async function retryUnsentExpenses(): Promise<number> {
  if (!canRetryUnsentExpensesOnPage(window.location?.pathname || '') || navigator.onLine === false) return 0;
  const auth = expenseSyncContext();
  if (!auth.cloudEnabled || !auth.token || !auth.farmId || !auth.userId) return 0;
  const ownerId = expenseRetryOwner(auth.farmId);
  if (!ownerId) return 0;
  const context: ExpenseRetryContext = { ...auth, version: 1, farmId: auth.farmId, userId: auth.userId, ownerId };
  const key = `${context.farmId}:${context.userId}:${ownerId}`;
  const active = expenseRetries.get(key);
  if (active) { active.requestedAgain = true; return active.promise; }
  const retry = { promise: Promise.resolve(0), requestedAgain: false };
  const run = () => withExpenseSync(async () => {
    let attempted = false;
    let completed = 0;
    try {
      assertExpenseRetryContext(context);
      const records = await getAllRecords<SyncedExpenseRecord>('expenses');
      assertExpenseRetryContext(context);
      const pending: SyncedExpenseRecord[] = [];
      for (const record of records) {
        if (isOwnedUnsentExpense(record, context) && await checkPendingExpense(record, context, undefined, context)) {
          pending.push(record);
        }
      }
      if (!pending.length) return 0;
      assertExpenseRetryContext(context);
      attempted = true;
      const cloudRecords = await requestExpenseSync<CloudExpenseRecord[]>('/api/expenses/record-sync', {
        headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store',
      });
      assertExpenseRetryContext(context);
      if (!Array.isArray(cloudRecords) || cloudRecords.some(row => !row || typeof row.id !== 'string' || !row.id)) {
        throw new Error('経費の取得結果を確認できませんでした。');
      }
      for (const record of pending) {
        assertExpenseRetryContext(context);
        if (!await checkPendingExpense(record, context, undefined, context)) continue;
        const matches = cloudRecords.filter(cloud => cloud.id === expenseCloudId(record));
        if (matches.length > 1) continue;
        let synced: CloudExpenseRecord | undefined = matches[0];
        if (synced && (synced.deletedAt || synced.settlementSaleId || !sameExpenseContent(record, synced))) continue;
        if (!synced) {
          try {
            // The server checks absence inside its farm write lock, including tombstones and source duplicates.
            assertExpenseRetryContext(context);
            synced = await syncExpenseRecordToCloud(record, context, true) ?? undefined;
          } catch {
            assertExpenseRetryContext(context);
            continue;
          }
        }
        assertExpenseRetryContext(context);
        if (synced && !synced.deletedAt && !synced.settlementSaleId && sameExpenseContent(record, synced) &&
            await checkPendingExpense(record, context, synced, context)) completed += 1;
      }
      return completed;
    } catch (error) {
      console.warn('未送信の経費を端末に保持し、同期確認を保留しました。', error);
      return completed;
    } finally {
      // One notification per attempted batch; the receiving list performs GET only.
      if (attempted) {
        try {
          assertExpenseRetryContext(context);
          window.dispatchEvent(new Event(EXPENSE_SYNC_STATUS_EVENT));
        } catch { /* A different account/page must not receive an old sync result. */ }
      }
    }
  }).catch(() => 0);
  retry.promise = (async () => {
    let completed = await run();
    // A reconnect while the old request is failing gets one fresh attempt, without polling.
    if (retry.requestedAgain) completed += await run();
    return completed;
  })();
  expenseRetries.set(key, retry);
  try { return await retry.promise; }
  finally { if (expenseRetries.get(key) === retry) expenseRetries.delete(key); }
}

/** Keep edits to an unsent inventory purchase expense and its retry together. */
async function savePendingSupplyExpense(record: SyncedExpenseRecord, context: ExpenseSyncContext, deleted = false): Promise<void> {
  assertExpenseSyncContext(context);
  const db = await openFarmProDatabase();
  assertExpenseSyncContext(context);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['expenses', 'metadata'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('在庫購入経費の変更を保存できませんでした。'));
    const expenses = tx.objectStore('expenses');
    if (deleted) expenses.delete(record.id);
    else expenses.put(record);
    queueSupplyLinkedRecord(tx, 'expenses', record,
      record.sourceSupplyMovementId ? [record.sourceSupplyMovementId] : [], deleted);
  });
  assertExpenseSyncContext(context);
  await syncSupplyInventorySafely();
  assertExpenseSyncContext(context);
}

export async function updateExpense(
  id: string,
  input: ExpenseInput,
): Promise<ExpenseRecord> {
  return withExpenseSync(async (context) => {
    const existing = await getRecordById<SyncedExpenseRecord>('expenses', id);
    assertExpenseSyncContext(context);

    if (!existing) {
      throw new Error('経費記録を更新できませんでした。');
    }
    if (existing.settlementSaleId) {
      throw new Error('精算確定済みの経費は変更できません。販売精算の内容を確認してください。');
    }

    const next: SyncedExpenseRecord = {
      ...existing,
      ...input,
      id,
      syncRecordId: existing.syncRecordId || `expense:${id}`,
      cloudSyncPending: shouldUseCloudSync(),
      updatedAt: new Date().toISOString(),
    };
    const linkedPending = await hasPendingSupplyLinkedRecord('expenses', next.syncRecordId!);
    assertExpenseSyncContext(context);
    if (linkedPending || (existing.sourceSupplyMovementId && existing.cloudSyncPending)) {
      await savePendingSupplyExpense(next, context);
      const saved = await getRecordById<SyncedExpenseRecord>('expenses', id);
      assertExpenseSyncContext(context);
      return saved ?? next;
    }
    // A different device may have finalized this expense since the last pull.
    // Obtain server acceptance before changing a previously synced local record.
    if (shouldUseCloudSync() && (existing.cloudUpdatedAt ||
        (existing.syncRecordId && existing.cloudSyncPending !== true))) {
      const synced = await syncExpenseRecordToCloud(next, context);
      assertExpenseSyncContext(context);
      if (!synced) throw new Error('経費の登録状況を確認するため、ログインして通信できる状態で保存してください。');
      const { expenseRetryOrigin: _origin, ...acknowledged } = next;
      return saveRecordPreservingTimestamps<SyncedExpenseRecord>('expenses', {
        ...acknowledged,
        syncRecordId: synced.id,
        cloudUpdatedAt: synced.cloudUpdatedAt,
        cloudSyncPending: false,
      });
    }
    next.expenseRetryOrigin = newExpenseRetryOrigin(context);
    const saved = await saveRecord<SyncedExpenseRecord>('expenses', next);

    assertExpenseSyncContext(context);
    await syncExpenseAfterLocalSave(saved, context);
    return saved;
  });
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
  return withExpenseSync(async (context) => {
    const existing = await getRecordById<SyncedExpenseRecord>('expenses', id);
    assertExpenseSyncContext(context);
    if (!existing) return;
    if (existing?.settlementSaleId) {
      throw new Error('精算確定済みの経費は削除できません。販売精算の内容を確認してください。');
    }
    const syncRecordId = existing?.syncRecordId || `expense:${id}`;
    if (existing && (await hasPendingSupplyLinkedRecord('expenses', syncRecordId) ||
        (existing.sourceSupplyMovementId && existing.cloudSyncPending))) {
      await savePendingSupplyExpense(existing, context, true);
      return;
    }
    // A timed-out initial PUT may already exist remotely. Confirm its tombstone before local removal.
    await syncExpenseDeletionToCloud(syncRecordId, context);
    assertExpenseSyncContext(context);
    await deleteRecord('expenses', id);
  });
}
