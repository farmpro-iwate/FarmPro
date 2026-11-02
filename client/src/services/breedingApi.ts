import {
  getAllRecords,
  getRecordById,
} from '../storage/repository';
import { createMaster, getMasterList } from './masterApi';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { deleteExpenseBySource, upsertExpenseBySource } from './expensesApi';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import type { StoredRecord } from '../storage/types';
import type { Breeding, BreedingInput } from '../types/breeding';
import { saveBreedingWithEmbryoInventory, deleteBreedingWithEmbryoInventory } from './breedingInventoryLink';
import { markLocalChangePending } from './deviceSync';
import { getPendingBreedingDeleteState, hasPendingSupplyLinkedRecord } from './supplyInventoryLinkedSync';
import type { MasterCategory } from '../types/master';
import { openFarmProDatabase } from '../storage/db';
import {
  breedingConditionHeaders, sameBreedingContent, toCloudBreeding, validBreedingRevision,
  type BreedingSyncAttempt, type BreedingSyncBase, type CloudBreedingRecord,
} from './breedingSyncProtocol';

type StoredBreeding = Breeding & StoredRecord & {
  id: string | number;
  recordKind?: 'standard';
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  cloudRecordId?: string | number;
  breedingSyncDeletePending?: boolean;
  breedingSyncBase?: BreedingSyncBase;
  breedingSyncAttempt?: BreedingSyncAttempt;
};

export class DuplicateBreedingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateBreedingError';
  }
}

export class BreedingSyncConflictError extends Error {
  constructor(message = '繁殖記録が変更されたため、古い保存結果は反映していません。最新の内容を確認してください。') {
    super(message);
    this.name = 'BreedingSyncConflictError';
  }
}

type BreedingSyncContext = {
  farmId: string | null;
  userId: string | null;
  token: string | null;
  planId: string;
  cloudEnabled: boolean;
};
const pendingBreedingSync = new Map<string, Promise<void>>();

function breedingSyncContext(): BreedingSyncContext {
  const user = getStoredAuthUser();
  const planId = getCurrentFarmProPlanId();
  return {
    farmId: user?.farmId ?? null, userId: user?.id ?? null, token: getAuthToken(),
    planId, cloudEnabled: getFarmProPlan(planId).multiDeviceSync,
  };
}

function assertBreedingSyncContext(expected: BreedingSyncContext): void {
  const current = breedingSyncContext();
  if (current.farmId !== expected.farmId || current.userId !== expected.userId ||
      current.token !== expected.token || current.planId !== expected.planId ||
      current.cloudEnabled !== expected.cloudEnabled) {
    throw new Error('ログインまたは農場の情報が変わったため、繁殖記録の処理を中止しました。');
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
}

function sameBreedingRecord(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

// Stock synchronization may acknowledge this exact save while its caller is
// waiting, including clearing an inherited ordinary-save base/attempt. Only
// those acknowledgement metadata changes are allowed before its expenses.
function sameLinkedBreedingContent(left: StoredBreeding, right: StoredBreeding): boolean {
  const content = (record: StoredBreeding) => {
    const { cloudUpdatedAt: _cloudUpdatedAt, cloudSyncPending: _cloudSyncPending,
      breedingSyncBase: _base, breedingSyncAttempt: _attempt, ...rest } = record;
    return rest;
  };
  return sameBreedingRecord(content(left), content(right));
}

async function assertCurrentBreeding(
  context: BreedingSyncContext, expected: StoredBreeding, allowLinkedAcknowledgement = false,
): Promise<void> {
  assertBreedingSyncContext(context);
  const current = await getRecordById<StoredRecord>('breedings', expected.id);
  assertBreedingSyncContext(context);
  if (!sameBreedingRecord(current, expected) && !(allowLinkedAcknowledgement && current &&
      isStandardBreeding(current) && sameLinkedBreedingContent(current, expected))) {
    throw new BreedingSyncConflictError();
  }
}

async function changeMatchingBreeding(
  context: BreedingSyncContext, id: string | number,
  expected: StoredRecord | undefined, next: StoredBreeding | undefined,
  protectDeletionConflict = false, guardNewCloudIdentity = false,
): Promise<boolean> {
  assertBreedingSyncContext(context);
  const database = await openFarmProDatabase();
  assertBreedingSyncContext(context);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('breedings', 'readwrite');
    const store = transaction.objectStore('breedings');
    let changed = false;
    let failure: unknown;
    transaction.oncomplete = () => {
      try { assertBreedingSyncContext(context); resolve(changed); }
      catch (error) { reject(error); }
    };
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('繁殖記録の処理を中止しました。'));
    transaction.onerror = () => { failure ??= transaction.error; };
    const read = guardNewCloudIdentity ? store.getAll() : store.get(id);
    read.onsuccess = () => {
      try {
        assertBreedingSyncContext(context);
        const rows = guardNewCloudIdentity ? read.result as StoredRecord[] : [];
        const current = guardNewCloudIdentity ? rows.find(row => row.id === id) : read.result as StoredRecord | undefined;
        if (guardNewCloudIdentity && !expected && next && rows.some(row => isStandardBreeding(row) &&
            (String(row.cloudRecordId ?? row.id) === String(next.cloudRecordId ?? next.id) ||
              ((row.cloudRecordId === undefined || row.cloudRecordId === '') &&
                syncIdentity(row) === syncIdentity(next))))) return;
        if (!sameBreedingRecord(current, expected)) {
          // A DELETE may already have reached the server. Keep a legacy writer's
          // newer row protected from a subsequent missing-row GET.
          if (protectDeletionConflict && current && isStandardBreeding(current)) {
            store.put({ ...current, cloudSyncPending: true, breedingSyncDeletePending: true });
          }
          return;
        }
        if (next) {
          if (next.id !== id) throw new Error('更新対象の繁殖記録が一致しません。');
          store.put(next);
        } else store.delete(id);
        changed = true;
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
  });
}

// Hold the same lock from before a local save through its related expenses.
// A save queued behind deletion must re-read the now-missing row before any PUT.
async function withBreedingSync<T>(action: (context: BreedingSyncContext) => Promise<T>): Promise<T> {
  const context = breedingSyncContext();
  const key = `farmpro:breeding-record-sync:${encodeURIComponent(context.farmId || 'anonymous')}`;
  const run = () => { assertBreedingSyncContext(context); return action(context); };
  if (navigator.locks?.request) return navigator.locks.request(key, run);
  const previous = pendingBreedingSync.get(key) ?? Promise.resolve();
  const work = previous.then(run);
  const settled = work.then(() => undefined, () => undefined);
  pendingBreedingSync.set(key, settled);
  try { return await work; }
  finally { if (pendingBreedingSync.get(key) === settled) pendingBreedingSync.delete(key); }
}

function normalizeText(value?: string) {
  return (value || '').trim().toLocaleLowerCase();
}

function sameCow(a?: string, b?: string) {
  return normalizeText(a) !== '' && normalizeText(a) === normalizeText(b);
}

function isDuplicateHeat(input: BreedingInput, existing: StoredBreeding) {
  if (!input.heatDate) return false;
  return sameCow(input.cowEarTag, existing.cowEarTag) && input.heatDate === existing.heatDate;
}

function isDuplicateInsemination(input: BreedingInput, existing: StoredBreeding) {
  if (input.breedingMethod !== '種付' || !input.inseminationDate) return false;
  if (!sameCow(input.cowEarTag, existing.cowEarTag)) return false;
  if (input.inseminationDate !== existing.inseminationDate) return false;
  return normalizeText(input.bullName) === normalizeText(existing.bullName);
}

async function ensureNoDuplicateBreeding(input: BreedingInput, excludeId?: string | number) {
  const records = (await getAllRecords<StoredRecord>('breedings')).filter(isStandardBreeding);
  const candidates = excludeId === undefined
    ? records
    : records.filter((record) => String(record.id) !== String(excludeId));

  if (input.breedingMethod === '未選択' && candidates.some((record) => isDuplicateHeat(input, record))) {
    throw new DuplicateBreedingError('同じ牛・同じ発情日の記録がすでにあります。重複登録はできません。');
  }

  if (input.breedingMethod === '種付' && candidates.some((record) => isDuplicateInsemination(input, record))) {
    throw new DuplicateBreedingError('同じ牛・同じ種付日・同じ種雄牛の記録がすでにあります。重複登録はできません。');
  }
}

function createRecordId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `breeding-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isStandardBreeding(record: StoredRecord): record is StoredBreeding {
  if (record.recordKind === 'standard') return true;
  if (record.recordKind !== undefined || 'breedingType' in record || 'serviceDate' in record) return false;

  return 'cowEarTag' in record || 'breedingMethod' in record;
}

function parseTimestamp(value?: string) {
  if (!value) return Number.NaN;
  return Date.parse(value);
}

function syncIdentity(record: Pick<StoredBreeding, 'cowEarTag' | 'breedingMethod' | 'inseminationDate' | 'transferDate' | 'heatDate'>) {
  const performedDate = record.breedingMethod === '受精卵移植'
    ? record.transferDate
    : record.inseminationDate;
  return [
    record.cowEarTag?.trim() || '',
    record.breedingMethod?.trim() || '',
    performedDate?.trim() || '',
    record.heatDate?.trim() || '',
  ].join('|');
}

function isCloudRecordNewer(cloud: StoredBreeding, local?: StoredBreeding): boolean {
  if (!local) return true;
  if (local.cloudSyncPending || local.breedingSyncDeletePending) return false;

  const cloudServerTime = parseTimestamp(cloud.cloudUpdatedAt);
  const localCloudTime = parseTimestamp(local.cloudUpdatedAt);

  if (!Number.isNaN(cloudServerTime)) {
    if (!Number.isNaN(localCloudTime)) return cloudServerTime > localCloudTime;
    return true;
  }

  const cloudUpdatedAt = parseTimestamp(cloud.updatedAt);
  const localUpdatedAt = parseTimestamp(local.updatedAt);
  if (Number.isNaN(cloudUpdatedAt)) return false;
  if (Number.isNaN(localUpdatedAt)) return true;
  return cloudUpdatedAt > localUpdatedAt;
}

async function readSyncApiError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: string };
    return body.message || `繁殖記録のクラウド同期に失敗しました（${response.status}）`;
  } catch {
    return `繁殖記録のクラウド同期に失敗しました（${response.status}）`;
  }
}

async function requestBreedingSync<T>(
  path: string, init: RequestInit, context: BreedingSyncContext,
  read: (response: Response) => Promise<T>, allowMissing = false,
): Promise<T> {
  assertBreedingSyncContext(context);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('繁殖記録の通信が時間切れになりました。端末の記録は保持しています。'));
    }, 12000);
  });
  const work = async () => {
    const response = await fetch(path, { ...init, signal: controller.signal });
    assertBreedingSyncContext(context);
    if (!response.ok && !(allowMissing && response.status === 404)) {
      const message = await readSyncApiError(response);
      if (response.status === 409 || response.status === 412) throw new BreedingSyncConflictError(message);
      throw new Error(message);
    }
    const result = await read(response);
    assertBreedingSyncContext(context);
    return result;
  };
  try { return await Promise.race([work(), timeout]); }
  finally { clearTimeout(timer!); }
}

async function resolveMasterId(
  category: MasterCategory,
  name: string,
  context: BreedingSyncContext,
  currentId?: number,
): Promise<number | undefined> {
  assertBreedingSyncContext(context);
  const normalizedName = name.trim();
  if (!normalizedName) return undefined;
  if (currentId) return currentId;

  const masters = await getMasterList(category);
  assertBreedingSyncContext(context);
  const existing = masters.find(
    (master) => master.name.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase(),
  );
  if (existing) return existing.id;

  const created = await createMaster({ category, name: normalizedName });
  assertBreedingSyncContext(context);
  return created.id;
}

async function withResolvedBreedingMasters(input: BreedingInput, context: BreedingSyncContext): Promise<BreedingInput> {
  if (input.breedingMethod !== '種付') return input;

  const bullName = input.bullName.trim();
  const inseminatorName = input.inseminatorName.trim();
  const bullMasterId = await resolveMasterId('sire', bullName, context, input.bullMasterId);
  const inseminatorMasterId = await resolveMasterId('inseminator', inseminatorName, context, input.inseminatorMasterId);

  return {
    ...input,
    bullName,
    bullMasterId,
    inseminatorName,
    inseminatorMasterId,
  };
}

async function fetchCloudBreeding(cloudId: string, context: BreedingSyncContext): Promise<CloudBreedingRecord | null> {
  if (!context.token) throw new Error('ログインが必要です');
  const record = await requestBreedingSync(`/api/breedings/record-sync/${encodeURIComponent(cloudId)}`, {
    headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store',
  }, context, response => response.status === 404 ? Promise.resolve(null) : response.json() as Promise<CloudBreedingRecord>, true);
  if (record !== null && (!record || String(record.id ?? '') !== cloudId)) {
    throw new BreedingSyncConflictError('クラウドの確認結果が対象の繁殖記録と一致しません。端末の記録は保持しています。');
  }
  return record;
}

function prepareBreedingSyncState(existing: StoredBreeding | undefined, context: BreedingSyncContext) {
  if (!context.cloudEnabled) return { breedingSyncBase: undefined, breedingSyncAttempt: undefined };
  const continuing = existing?.cloudSyncPending && existing.breedingSyncBase?.version === 1;
  const breedingSyncBase: BreedingSyncBase = continuing ? existing.breedingSyncBase! : {
    version: 1, record: existing ? toCloudBreeding(existing) : null,
    ...(validBreedingRevision(existing?.cloudUpdatedAt) ? { cloudUpdatedAt: existing.cloudUpdatedAt } : {}),
  };
  return {
    breedingSyncBase,
    breedingSyncAttempt: continuing && existing.breedingSyncAttempt?.version === 1 ? existing.breedingSyncAttempt : undefined,
  };
}

async function pushSavedBreedingRecord(initial: StoredBreeding, context: BreedingSyncContext): Promise<StoredBreeding> {
  let record = initial;
  await assertCurrentBreeding(context, record);
  assertBreedingNotBeingDeleted(record);
  if (!context.cloudEnabled) return record;

  const wire = toCloudBreeding(record);
  const remote = await fetchCloudBreeding(String(wire.id), context);
  await assertCurrentBreeding(context, record);
  if (remote?.deletedAt) {
    throw new BreedingSyncConflictError('この繁殖記録はクラウドで削除済みです。端末の変更を保持して同期を保留しました。');
  }
  const base = record.breedingSyncBase;
  const attempt = record.breedingSyncAttempt;
  if (!base || base.version !== 1 || (base.record && String(base.record.id) !== String(wire.id))) {
    throw new BreedingSyncConflictError('変更前の繁殖記録を確認できないため、端末の変更を保持して同期を保留しました。');
  }
  let synced = remote;
  if (!remote || !sameBreedingContent(wire, remote)) {
    let revision: string | undefined;
    if (remote) {
      const reachedAttempt = attempt?.version === 1 && sameBreedingContent(attempt.record, remote);
      const knownBase = validBreedingRevision(base.cloudUpdatedAt) && base.cloudUpdatedAt === remote.cloudUpdatedAt;
      const sameBase = base.record && sameBreedingContent(base.record, remote);
      if ((!reachedAttempt && !knownBase && !sameBase) || !validBreedingRevision(remote.cloudUpdatedAt)) {
        throw new BreedingSyncConflictError('別の端末で繁殖記録が変更されています。この端末の変更と関連経費を保持して同期を保留しました。最新の内容を確認してください。');
      }
      revision = remote.cloudUpdatedAt;
    } else if (base.record !== null || base.cloudUpdatedAt) {
      throw new BreedingSyncConflictError('変更前の繁殖記録をクラウドで確認できないため、端末の変更を保持して同期を保留しました。');
    }
    // Confirm a lost earlier attempt before replacing it. If this next request
    // fails, its known base remains available to the next formal save.
    const staged: StoredBreeding = {
      ...record,
      breedingSyncBase: { version: 1, record: remote, ...(revision ? { cloudUpdatedAt: revision } : {}) },
      breedingSyncAttempt: { version: 1, record: wire },
    };
    if (!await changeMatchingBreeding(context, record.id, record, staged)) throw new BreedingSyncConflictError();
    record = staged;
    await assertCurrentBreeding(context, record);
    synced = await sendBreedingRecordToCloud(wire, context, revision);
  }
  await assertCurrentBreeding(context, record);
  if (!synced || String(synced.id ?? '') !== String(wire.id) || !validBreedingRevision(synced.cloudUpdatedAt) ||
      synced.deletedAt || !sameBreedingContent(wire, synced)) {
    throw new BreedingSyncConflictError('クラウドの保存結果が対象の繁殖記録と一致しません。端末の編集内容を保持しています。');
  }
  const { breedingSyncBase: _base, breedingSyncAttempt: _attempt, ...content } = record;
  const acknowledged: StoredBreeding = {
    ...content,
    recordKind: 'standard',
    cloudRecordId: synced.id,
    cloudUpdatedAt: synced.cloudUpdatedAt,
    cloudSyncPending: false,
  };
  if (!await changeMatchingBreeding(context, record.id, record, acknowledged)) throw new BreedingSyncConflictError();
  return acknowledged;
}

function ensureEtExpenseBreakdownIsSafe(record: BreedingInput): void {
  const legacy = Number(record.transferCost || 0);
  const split = Number(record.embryoCost || 0) + Number(record.transferProcedureCost || 0) + Number(record.transferOtherCost || 0);
  if (record.breedingMethod === '受精卵移植' && legacy > 0 && split > 0) {
    throw new Error('旧ET費がある記録には、新しい費用内訳を同時登録できません。経費の二重計上を避けるため保存を中止しました。');
  }
}

async function syncBreedingExpenses(
  record: StoredBreeding, context: BreedingSyncContext, allowLinkedAcknowledgement = false,
): Promise<void> {
  const upsert = async (input: Parameters<typeof upsertExpenseBySource>[0]) => {
    await assertCurrentBreeding(context, record, allowLinkedAcknowledgement);
    await upsertExpenseBySource(input);
    await assertCurrentBreeding(context, record, allowLinkedAcknowledgement);
  };
  const remove = async (...args: Parameters<typeof deleteExpenseBySource>) => {
    await assertCurrentBreeding(context, record, allowLinkedAcknowledgement);
    await deleteExpenseBySource(...args);
    await assertCurrentBreeding(context, record, allowLinkedAcknowledgement);
  };
  const sourceId = String(record.id);
  const common = {
    expenseCategoryMasterId: undefined,
    vendorMasterId: undefined,
    paymentMethod: '',
    target: `${record.cowEarTag} ${record.cowName}`.trim(),
    animalType: 'cattle' as const,
    animalEarTag: record.cowEarTag,
    animalName: record.cowName,
    sourceType: 'breeding' as const,
    sourceId,
    memo: `繁殖記録から自動作成（繁殖記録ID: ${sourceId}）`,
  };

  const inseminationCost = Number(record.inseminationCost || 0);
  if (record.breedingMethod === '種付' && inseminationCost > 0) {
    await upsert({
      ...common,
      category: '種付け・繁殖費',
      sourceDetail: 'insemination',
      paymentDate: record.inseminationDate || record.heatDate || '',
      description: '人工授精・種付費',
      vendor: record.inseminatorName || '',
      amount: String(inseminationCost),
    });
  } else {
    await remove('breeding', sourceId, '種付け・繁殖費', 'insemination');
  }

  const embryoCost = Number(record.embryoCost || 0);
  const transferProcedureCost = Number(record.transferProcedureCost || 0);
  const transferOtherCost = Number(record.transferOtherCost || 0);
  const splitTransferTotal = embryoCost + transferProcedureCost + transferOtherCost;
  const legacyTransferCost = Number(record.transferCost || 0);
  const transferDate = record.transferDate || record.transferPlannedDate || '';

  if (record.breedingMethod === '受精卵移植' && legacyTransferCost > 0 && splitTransferTotal > 0) {
    // Protect existing expense rows if a legacy/mixed record already exists.
    console.warn('旧ET費と内訳が混在するため、ET経費の自動同期をスキップしました');
  } else if (record.breedingMethod === '受精卵移植' && splitTransferTotal > 0) {
    await remove('breeding', sourceId, '種付け・繁殖費', 'transfer');

    for (const item of [
      { detail: 'embryo', description: '受精卵代', vendor: record.supplierName || '', amount: embryoCost },
      { detail: 'transfer-procedure', description: '移植料', vendor: record.transferTechnician || '', amount: transferProcedureCost },
      { detail: 'transfer-other', description: 'その他ET費', vendor: record.transferTechnician || record.supplierName || '', amount: transferOtherCost },
    ]) {
      if (item.amount > 0) {
        await upsert({
          ...common,
          category: '種付け・繁殖費',
          sourceDetail: item.detail,
          paymentDate: transferDate,
          description: item.description,
          vendor: item.vendor,
          amount: String(item.amount),
        });
      } else {
        await remove('breeding', sourceId, '種付け・繁殖費', item.detail);
      }
    }
  } else if (record.breedingMethod === '受精卵移植' && legacyTransferCost > 0) {
    await upsert({
      ...common,
      category: '種付け・繁殖費',
      sourceDetail: 'transfer',
      paymentDate: transferDate,
      description: '受精卵移植（ET）費',
      vendor: record.transferTechnician || record.supplierName || '',
      amount: String(legacyTransferCost),
    });
    for (const detail of ['embryo', 'transfer-procedure', 'transfer-other']) {
      await remove('breeding', sourceId, '種付け・繁殖費', detail);
    }
  } else {
    for (const detail of ['transfer', 'embryo', 'transfer-procedure', 'transfer-other']) {
      await remove('breeding', sourceId, '種付け・繁殖費', detail);
    }
  }

  const pregnancyCheckCost = Number(record.pregnancyCheckCost || 0);
  if (pregnancyCheckCost > 0) {
    await upsert({
      ...common,
      category: '診療費',
      sourceDetail: 'pregnancy-check',
      paymentDate: record.pregnancyCheckDate || record.pregnancyCheckExpectedDate || '',
      description: '妊娠鑑定（診療費）',
      vendor: '',
      amount: String(pregnancyCheckCost),
    });
  } else {
    await remove('breeding', sourceId, '診療費', 'pregnancy-check');
  }
}

async function readCloudBreedings(context: BreedingSyncContext): Promise<StoredBreeding[]> {
  if (!context.token) throw new Error('ログインが必要です');
  return requestBreedingSync('/api/breedings/record-sync', {
    headers: { Authorization: `Bearer ${context.token}` }, cache: 'no-store',
  }, context, async response => {
    const records: unknown = await response.json();
    if (!Array.isArray(records) || records.some(record => !record || typeof record !== 'object' ||
        !['string', 'number'].includes(typeof record.id) || String(record.id).trim() === '')) {
      throw new Error('繁殖記録の取得結果を確認できません。端末の記録は変更していません。');
    }
    return records as StoredBreeding[];
  });
}

export async function getBreedingList(): Promise<Breeding[]> {
  return withBreedingSync(async context => {
    if (context.cloudEnabled) {
      try {
        await pullBreedingChanges(context);
      } catch (error) {
        assertBreedingSyncContext(context);
        console.warn('繁殖記録のクラウド取り込みをスキップしました', error);
      }
    }
    const records = await getAllRecords<StoredRecord>('breedings');
    assertBreedingSyncContext(context);
    return records.filter(isStandardBreeding);
  });
}

// Home aggregation stays read-only. A delayed response must not hide an edit
// made while that response was pending, or return another farm's records.
export async function getBreedingListForHomeSummary(): Promise<Breeding[]> {
  return withBreedingSync(async context => {
    const snapshot = (await getAllRecords<StoredRecord>('breedings')).filter(isStandardBreeding);
    assertBreedingSyncContext(context);
    if (!context.cloudEnabled || !context.token) return snapshot;

    try {
      const cloudRecords = await readCloudBreedings(context);
      const current = (await getAllRecords<StoredRecord>('breedings')).filter(isStandardBreeding);
      assertBreedingSyncContext(context);
      const snapshotByCloudId = new Map(snapshot.map(record => [String(record.cloudRecordId ?? record.id), record]));
      const currentByCloudId = new Map(current.map(record => [String(record.cloudRecordId ?? record.id), record]));
      const result: Breeding[] = [];
      const included = new Set<string>();
      for (const record of cloudRecords) {
        if (!isStandardBreeding(record)) continue;
        const cloudId = String(record.id);
        const previous = snapshotByCloudId.get(cloudId);
        const local = currentByCloudId.get(cloudId);
        const linkedPending = await hasPendingSupplyLinkedRecord('breedings', cloudId);
        assertBreedingSyncContext(context);
        included.add(cloudId);
        if (linkedPending || local?.cloudSyncPending || local?.breedingSyncDeletePending || !sameBreedingRecord(previous, local)) {
          if (local) result.push(local);
        } else {
          result.push({ ...record, recordKind: 'standard' } as StoredBreeding);
        }
      }
      for (const record of current) {
        const cloudId = String(record.cloudRecordId ?? record.id);
        if (included.has(cloudId)) continue;
        const linkedPending = await hasPendingSupplyLinkedRecord('breedings', cloudId);
        assertBreedingSyncContext(context);
        if (linkedPending || record.cloudSyncPending || record.breedingSyncDeletePending ||
            !sameBreedingRecord(snapshotByCloudId.get(cloudId), record)) {
          result.push(record);
          included.add(cloudId);
        }
      }
      assertBreedingSyncContext(context);
      return result;
    } catch (error) {
      assertBreedingSyncContext(context);
      console.warn('ホームの繁殖集計は端末内データへフォールバックしました', error);
      const records = await getAllRecords<StoredRecord>('breedings');
      assertBreedingSyncContext(context);
      return records.filter(isStandardBreeding);
    }
  });
}

export async function getBreeding(id: string | number): Promise<Breeding> {
  const context = breedingSyncContext();
  const record = await getRecordById<StoredRecord>('breedings', id);
  assertBreedingSyncContext(context);
  if (!record || !isStandardBreeding(record)) throw new Error('指定された繁殖記録が見つかりません。');
  return record;
}

async function finishLinkedBreedingSave(saved: Breeding, context: BreedingSyncContext): Promise<StoredBreeding> {
  assertBreedingSyncContext(context);
  const current = await getRecordById<StoredBreeding>('breedings', saved.id);
  assertBreedingSyncContext(context);
  if (!current || !sameLinkedBreedingContent(current, saved as StoredBreeding)) throw new BreedingSyncConflictError();
  markLocalChangePending();
  if (context.cloudEnabled) {
    const queued = await hasPendingSupplyLinkedRecord('breedings', String(current.cloudRecordId ?? current.id));
    await assertCurrentBreeding(context, current, true);
    if (queued || current.cloudSyncPending) {
      throw new BreedingSyncConflictError('移植記録と在庫はこの端末に保持しています。クラウドへの保存を確認できないため、関連経費は更新していません。通信状態と最新の内容を確認してください。');
    }
  }
  await syncBreedingExpenses(current, context, true);
  await assertCurrentBreeding(context, current, true);
  return current;
}

function validateBreedingOriginal(context: BreedingSyncContext, expected: StoredRecord | undefined) {
  return (current: Breeding | undefined) => {
    assertBreedingSyncContext(context);
    if (!sameBreedingRecord(current, expected)) throw new BreedingSyncConflictError();
  };
}

function assertBreedingNotBeingDeleted(record: StoredBreeding): void {
  if (record.breedingSyncDeletePending) {
    throw new BreedingSyncConflictError('この繁殖記録は削除処理の確認が完了していません。同じ記録の削除をもう一度実行し、関連経費の処理を完了してください。');
  }
}

export async function createBreeding(input: BreedingInput): Promise<Breeding> {
  return withBreedingSync(async context => {
    ensureEtExpenseBreakdownIsSafe(input);
    await ensureNoDuplicateBreeding(input);
    assertBreedingSyncContext(context);
    const resolvedInput = await withResolvedBreedingMasters(input, context);
    assertBreedingSyncContext(context);
    const now = new Date().toISOString();
    const record: StoredBreeding = {
      ...resolvedInput, id: createRecordId(), recordKind: 'standard',
      cloudSyncPending: context.cloudEnabled, createdAt: now, updatedAt: now,
      ...prepareBreedingSyncState(undefined, context),
    };

    if (resolvedInput.breedingMethod === '受精卵移植' && resolvedInput.breedingStatus === '移植実施' &&
        resolvedInput.embryoSource === 'farm_stock') {
      if (Number(resolvedInput.embryoCost || 0) > 0) {
        throw new Error('農場在庫の受精卵代は購入時に計上します。移植記録の受精卵代は0円にしてください。');
      }
      const saved = await saveBreedingWithEmbryoInventory(
        record.id, resolvedInput, resolvedInput.embryoInventoryBatchKey || '',
        { create: true, validateCurrent: validateBreedingOriginal(context, undefined) },
      );
      return finishLinkedBreedingSave(saved, context);
    }
    // Only an explicit farm_stock transfer deducts stock. Legacy ET behavior is preserved.
    if (!await changeMatchingBreeding(context, record.id, undefined, record)) throw new BreedingSyncConflictError();
    const synced = await pushSavedBreedingRecord(record, context);
    await syncBreedingExpenses(synced, context);
    return synced;
  });
}

export async function updateBreeding(id: string | number, input: BreedingInput): Promise<Breeding> {
  return withBreedingSync(async context => {
    const existing = await getRecordById<StoredRecord>('breedings', id);
    assertBreedingSyncContext(context);
    if (!existing || !isStandardBreeding(existing)) throw new Error('更新する繁殖記録が見つかりません。');
    assertBreedingNotBeingDeleted(existing);

    ensureEtExpenseBreakdownIsSafe(input);
    await ensureNoDuplicateBreeding(input, id);
    assertBreedingSyncContext(context);
    const resolvedInput = await withResolvedBreedingMasters(input, context);
    assertBreedingSyncContext(context);
    if (resolvedInput.embryoSource === 'farm_stock' && Number(resolvedInput.embryoCost || 0) > 0) {
      throw new Error('農場在庫の受精卵代は購入時に計上します。移植記録の受精卵代は0円にしてください。');
    }
    const linkedInventory = (resolvedInput.embryoSource === 'farm_stock' && resolvedInput.breedingStatus === '移植実施') ||
      existing.embryoInventoryMovementId ||
      await hasPendingSupplyLinkedRecord('breedings', String(existing.cloudRecordId ?? existing.id));
    assertBreedingSyncContext(context);
    if (linkedInventory) {
      const saved = await saveBreedingWithEmbryoInventory(id, resolvedInput, resolvedInput.embryoInventoryBatchKey || '',
        { validateCurrent: validateBreedingOriginal(context, existing) });
      return finishLinkedBreedingSave(saved, context);
    }

    const now = new Date().toISOString();
    const saved: StoredBreeding = {
      ...existing, ...resolvedInput, id, recordKind: 'standard',
      createdAt: existing.createdAt ?? now, updatedAt: now, cloudSyncPending: context.cloudEnabled,
      ...prepareBreedingSyncState(existing, context),
    };
    if (!await changeMatchingBreeding(context, id, existing, saved)) throw new BreedingSyncConflictError();
    const synced = await pushSavedBreedingRecord(saved, context);
    await syncBreedingExpenses(synced, context);
    return synced;
  });
}

async function sendBreedingRecordToCloud(
  record: CloudBreedingRecord, context: BreedingSyncContext, revision?: string,
): Promise<CloudBreedingRecord> {
  if (!context.token) throw new Error('ログインが必要です');
  return requestBreedingSync(`/api/breedings/record-sync/${encodeURIComponent(String(record.id))}`, {
    method: 'PUT', headers: {
      'Content-Type': 'application/json', Authorization: `Bearer ${context.token}`, ...breedingConditionHeaders(revision),
    },
    body: JSON.stringify(record),
  }, context, response => response.json() as Promise<CloudBreedingRecord>);
}

export async function syncBreedingRecordToCloud(record: Breeding): Promise<Breeding> {
  return withBreedingSync(async context => {
    await assertCurrentBreeding(context, record as StoredBreeding);
    if (!context.cloudEnabled) return record;
    const current = record as StoredBreeding;
    const staged = current.breedingSyncBase?.version === 1 ? current : {
      ...current, ...prepareBreedingSyncState(current, context), cloudSyncPending: true,
    };
    if (staged !== current && !await changeMatchingBreeding(context, current.id, current, staged)) throw new BreedingSyncConflictError();
    return pushSavedBreedingRecord(staged, context);
  });
}

async function pullBreedingChanges(context: BreedingSyncContext): Promise<number> {
  // Capture all originals before the network wait. A later local write must not
  // become the apparent base for an old server response.
  const localRecords = (await getAllRecords<StoredRecord>('breedings')).filter(isStandardBreeding);
  assertBreedingSyncContext(context);
  const cloudRecords = await readCloudBreedings(context);
  const localById = new Map(localRecords.map(item => [String(item.id), item]));
  const localByCloudId = new Map(localRecords
    .filter(item => item.cloudRecordId !== undefined && item.cloudRecordId !== '')
    .map(item => [String(item.cloudRecordId), item]));
  const legacyByIdentity = new Map<string, StoredBreeding[]>();
  for (const record of localRecords) {
    if (record.cloudRecordId !== undefined && record.cloudRecordId !== '') continue;
    const identity = syncIdentity(record);
    legacyByIdentity.set(identity, [...(legacyByIdentity.get(identity) ?? []), record]);
  }
  let applied = 0;
  for (const cloudRecord of cloudRecords) {
    if (!isStandardBreeding(cloudRecord)) continue;
    const cloudId = String(cloudRecord.id);
    if (await hasPendingSupplyLinkedRecord('breedings', cloudId)) continue;
    assertBreedingSyncContext(context);
    const direct = localById.get(cloudId);
    const identityMatches = legacyByIdentity.get(syncIdentity(cloudRecord)) ?? [];
    const localRecord = localByCloudId.get(cloudId)
      ?? (direct && (direct.cloudRecordId === undefined || direct.cloudRecordId === '' ||
        String(direct.cloudRecordId) === cloudId) ? direct : undefined)
      ?? (identityMatches.length === 1 ? identityMatches[0] : undefined);
    if (!isCloudRecordNewer(cloudRecord, localRecord)) continue;
    const localId = localRecord?.id ?? cloudRecord.id;
    const now = new Date().toISOString();
    const saved: StoredBreeding = {
      ...cloudRecord, id: localId, recordKind: 'standard', cloudRecordId: cloudRecord.id, cloudSyncPending: false,
      createdAt: cloudRecord.createdAt ?? now, updatedAt: cloudRecord.updatedAt ?? now,
    };
    if (!await changeMatchingBreeding(context, localId, localRecord, saved, false, !localRecord)) continue;
    localById.set(String(saved.id), saved);
    localByCloudId.set(cloudId, saved);
    // Once a legacy row is attached, another cloud ID must not reassign it.
    if (localRecord) legacyByIdentity.delete(syncIdentity(localRecord));
    applied += 1;
  }

  const cloudIds = new Set(cloudRecords.map(record => String(record.id)));
  for (const localRecord of localRecords) {
    const cloudId = localRecord.cloudRecordId;
    if (!localRecord.cloudSyncPending && !localRecord.breedingSyncDeletePending &&
        cloudId !== undefined && cloudId !== '' && !cloudIds.has(String(cloudId)) &&
        !await hasPendingSupplyLinkedRecord('breedings', String(cloudId))) {
      if (await changeMatchingBreeding(context, localRecord.id, localRecord, undefined)) applied += 1;
    }
  }
  assertBreedingSyncContext(context);
  return applied;
}

export async function pullNewerBreedingRecordsFromCloud(): Promise<number> {
  return withBreedingSync(context => context.cloudEnabled ? pullBreedingChanges(context) : Promise.resolve(0));
}

export async function deleteBreeding(id: string | number): Promise<void> {
  return withBreedingSync(async context => {
    const existing = await getRecordById<StoredRecord>('breedings', id);
    assertBreedingSyncContext(context);
    if (!existing || !isStandardBreeding(existing)) throw new Error('削除する繁殖記録が見つかりません。');
    const linkedInventory = Boolean(existing.embryoInventoryMovementId) ||
      await hasPendingSupplyLinkedRecord('breedings', String(existing.cloudRecordId ?? existing.id));
    assertBreedingSyncContext(context);
    let original = existing;
    let assertLinkedDeleteContext: (() => void) | undefined;
    if (context.cloudEnabled) {
      if (!context.token) throw new Error('ログインが必要です');
      // Stock retries can hold a newer confirmed base/attempt outside the source
      // row. Trust it only when the owned queue still matches this exact source.
      const linkedState = linkedInventory ? await getPendingBreedingDeleteState(existing) : undefined;
      assertLinkedDeleteContext = linkedState?.assertCurrentContext;
      assertBreedingSyncContext(context);
      assertLinkedDeleteContext?.();
      // Keep the source until related expenses have finished. A lost DELETE ACK
      // or failed expense cleanup must not let a later GET silently remove it.
      original = { ...existing, cloudSyncPending: true, breedingSyncDeletePending: true };
      if (!await changeMatchingBreeding(context, id, existing, original)) throw new BreedingSyncConflictError();
      const cloudId = existing.cloudRecordId ?? existing.id;
      try {
        assertLinkedDeleteContext?.();
        const remote = await fetchCloudBreeding(String(cloudId), context);
        await assertCurrentBreeding(context, original);
        assertLinkedDeleteContext?.();
        if (remote && !remote.deletedAt) {
          const base = linkedState?.breedingSyncBase ?? original.breedingSyncBase;
          const attempt = linkedState?.breedingSyncAttempt ?? original.breedingSyncAttempt;
          const knownRevision = validBreedingRevision(original.cloudUpdatedAt) && original.cloudUpdatedAt === remote.cloudUpdatedAt;
          const knownBase = base?.version === 1 && validBreedingRevision(base.cloudUpdatedAt) && base.cloudUpdatedAt === remote.cloudUpdatedAt;
          const sameBase = base?.version === 1 && base.record && sameBreedingContent(base.record, remote);
          const ownAttempt = attempt?.version === 1 && sameBreedingContent(attempt.record, remote);
          if ((!knownRevision && !knownBase && !sameBase && !ownAttempt && !sameBreedingContent(original, remote)) ||
              !validBreedingRevision(remote.cloudUpdatedAt)) {
            throw new BreedingSyncConflictError('クラウドの繁殖記録に変更があります。記録と関連経費を保持して削除を中止しました。最新の内容を確認してください。');
          }
        }
        if (remote && !validBreedingRevision(remote.cloudUpdatedAt)) {
          throw new BreedingSyncConflictError('繁殖記録の削除条件を確認できません。端末の記録と関連経費を保持しています。');
        }
        await requestBreedingSync(`/api/breedings/${encodeURIComponent(String(cloudId))}`, {
          method: 'DELETE', headers: {
            Authorization: `Bearer ${context.token}`, ...breedingConditionHeaders(remote?.cloudUpdatedAt),
          },
        }, context, async () => undefined);
        assertLinkedDeleteContext?.();
        if (!await changeMatchingBreeding(context, id, original, original, true)) throw new BreedingSyncConflictError();
      } catch (error) {
        assertBreedingSyncContext(context);
        assertLinkedDeleteContext?.();
        await changeMatchingBreeding(context, id, original, original, true);
        throw error;
      }
    }

    try {
      for (const [category, detail] of [
        ['種付け・繁殖費', 'insemination'], ['種付け・繁殖費', 'transfer'],
        ['種付け・繁殖費', 'embryo'], ['種付け・繁殖費', 'transfer-procedure'],
        ['種付け・繁殖費', 'transfer-other'], ['診療費', 'pregnancy-check'],
      ]) {
        await assertCurrentBreeding(context, original);
        assertLinkedDeleteContext?.();
        await deleteExpenseBySource('breeding', String(original.id), category, detail);
        await assertCurrentBreeding(context, original);
        assertLinkedDeleteContext?.();
      }
      if (linkedInventory) {
        const validateOriginal = validateBreedingOriginal(context, original);
        await deleteBreedingWithEmbryoInventory(id, current => {
          assertLinkedDeleteContext?.();
          validateOriginal(current);
        });
        assertBreedingSyncContext(context);
        assertLinkedDeleteContext?.();
        markLocalChangePending();
      } else if (!await changeMatchingBreeding(context, id, original, undefined, context.cloudEnabled)) {
        throw new BreedingSyncConflictError();
      }
    } catch (error) {
      assertBreedingSyncContext(context);
      assertLinkedDeleteContext?.();
      if (context.cloudEnabled) {
        await changeMatchingBreeding(context, id, original, original, true);
      }
      throw error;
    }
  });
}
