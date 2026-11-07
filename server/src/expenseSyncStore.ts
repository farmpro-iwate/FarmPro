import { readJson, writeJson } from './jsonStore';
import type { CloudSettlementBundle } from './settlementSyncStore';
import { currentFarmId } from './farmContext';
import { withFarmRequest } from './farmRequestGate';

export type SyncedExpenseRecord = {
  id: string;
  paymentDate?: string;
  category?: string;
  expenseCategoryMasterId?: number;
  description?: string;
  vendor?: string;
  vendorMasterId?: number;
  amount?: string;
  paymentMethod?: string;
  target?: string;
  animalType?: 'cattle' | 'calf';
  animalId?: string;
  animalEarTag?: string;
  animalName?: string;
  sourceType?: string;
  sourceId?: string;
  sourceDetail?: string;
  sourceSupplyMovementId?: string;
  sourceSupplyPurchaseReference?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
  settlementSaleId?: string;
  settlementNumber?: string;
  settlementExpenseKind?: 'created' | 'linked';
};

const fileName = 'expenses-sync.json';

function normalizeRecord(
  input: SyncedExpenseRecord,
  existing?: SyncedExpenseRecord,
): SyncedExpenseRecord {
  const now = new Date().toISOString();

  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    paymentDate: input.paymentDate ?? existing?.paymentDate ?? '',
    category: input.category ?? existing?.category ?? '',
    expenseCategoryMasterId:
      input.expenseCategoryMasterId ?? existing?.expenseCategoryMasterId,
    description: input.description ?? existing?.description ?? '',
    vendor: input.vendor ?? existing?.vendor ?? '',
    vendorMasterId: input.vendorMasterId ?? existing?.vendorMasterId,
    amount: input.amount ?? existing?.amount ?? '',
    paymentMethod: input.paymentMethod ?? existing?.paymentMethod ?? '',
    target: input.target ?? existing?.target ?? '',
    animalType: input.animalType ?? existing?.animalType,
    animalId: input.animalId ?? existing?.animalId,
    animalEarTag: input.animalEarTag ?? existing?.animalEarTag,
    animalName: input.animalName ?? existing?.animalName,
    memo: input.memo ?? existing?.memo ?? '',
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt ?? existing?.deletedAt,
    cloudUpdatedAt: now,
  };
}

// Settlement bundles are the single durable source for newly created settlement
// expenses. Project them into the existing expense read API without a second write.
async function settlementExpenseProjection(): Promise<SyncedExpenseRecord[]> {
  const bundles = await readJson<CloudSettlementBundle[]>('settlement-sync.json', []);
  return bundles.flatMap(({ settlement, expenses }) =>
    expenses.map((expense) => ({
      ...expense,
      settlementSaleId: settlement.saleId,
      settlementNumber: settlement.settlementNumber,
      // Old bundles do not prove whether past cost snapshots included this fee.
      settlementExpenseKind: settlement.schemaVersion === 1 ? 'created' as const : undefined,
      paymentMethod: 'JA精算',
      memo: `販売精算 ${settlement.settlementNumber}`,
      createdAt: settlement.createdAt,
      updatedAt: settlement.createdAt,
      cloudUpdatedAt: settlement.createdAt,
    })),
  );
}

export async function listSyncedExpenses() {
  const records = await readJson<SyncedExpenseRecord[]>(fileName, []);
  const bundles = await readJson<CloudSettlementBundle[]>('settlement-sync.json', []);
  const linked = new Map(bundles.flatMap(({ settlement }) =>
    (settlement.linkedExpenseIds ?? []).map(id => [id, settlement] as const)));
  const settlementExpenses = await settlementExpenseProjection();
  const regularIds = new Set(records.map(row => row.id));
  if (settlementExpenses.some(row => regularIds.has(row.id))) {
    throw new Error('SETTLEMENT_EXPENSE_ID_CONFLICT');
  }
  return [...records.map((record) => {
    const settlement = linked.get(record.id);
    const { settlementSaleId: _sale, settlementNumber: _number, settlementExpenseKind: _kind, ...regular } = record;
    return { ...normalizeRecord(regular, regular),
      ...(settlement ? { settlementSaleId: settlement.saleId, settlementNumber: settlement.settlementNumber,
        ...(settlement.schemaVersion === 1 ? { settlementExpenseKind: 'linked' as const } : {}) } : {}),
    };
  }), ...settlementExpenses]
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) =>
      String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
    );
}

function expenseSourceIdentity(record: SyncedExpenseRecord): string | null {
  const sourceType = String(record.sourceType ?? '').trim();
  const sourceId = String(record.sourceId ?? '').trim();
  if (!sourceType || sourceType === 'manual' || !sourceId) return null;
  // A purchase remains claimed even after its expense category is edited.
  if (sourceType === 'feed-purchase') return JSON.stringify([sourceType, sourceId]);
  return JSON.stringify([
    sourceType, sourceId, String(record.category ?? '').trim(), String(record.sourceDetail ?? '').trim(),
  ]);
}

function isFeedPurchase(record: SyncedExpenseRecord | undefined): boolean {
  return String(record?.sourceType ?? '').trim() === 'feed-purchase';
}

function hasSourceConflict(
  id: string,
  input: SyncedExpenseRecord,
  records: SyncedExpenseRecord[],
): boolean {
  const identity = expenseSourceIdentity(input);
  return Boolean(identity && records.some(record =>
    String(record.id) !== id && expenseSourceIdentity(record) === identity));
}

export async function syncExpense(
  id: string,
  input: SyncedExpenseRecord,
  options: { createOnly?: boolean; allowSeparateFeedPayment?: boolean; confirmedSimilarExpenses?: unknown } = {},
) {
  if (!id.trim()) throw new Error('INVALID_EXPENSE_ID');
  const farmId = currentFarmId();
  if (!farmId) throw new Error('EXPENSE_FARM_REQUIRED');
  return withFarmRequest(farmId, async () => {
    const bundles = await readJson<CloudSettlementBundle[]>('settlement-sync.json', []);
    if (bundles.some(({ settlement }) => settlement.expenseIds.includes(id) || settlement.linkedExpenseIds?.includes(id))) {
      throw new Error('SETTLEMENT_EXPENSE_IMMUTABLE');
    }
    const records = await readJson<SyncedExpenseRecord[]>(fileName, []);
    const index = records.findIndex((record) => String(record.id) === id);
    const existing = index >= 0 ? records[index] : undefined;
    const settledRecords: SyncedExpenseRecord[] = bundles.flatMap(({ expenses, linkedExpenseSnapshots }) =>
      [...expenses, ...(linkedExpenseSnapshots ?? [])]);
    if (options.createOnly) {
      // A retry must never replace another edit, a tombstone or settlement evidence.
      if (existing || settledRecords.some((record) => String(record.id) === id)) {
        throw new Error('EXPENSE_SYNC_ALREADY_EXISTS');
      }
    }
    if (isFeedPurchase(existing)) {
      for (const key of ['sourceType', 'sourceId', 'sourceDetail'] as const) {
        if (input[key] !== undefined && input[key] !== existing![key]) {
          throw new Error('FEED_PURCHASE_REFERENCE_IMMUTABLE');
        }
      }
    } else if (existing && isFeedPurchase(input)) {
      // Linking an existing expense must compare the reviewed business fields.
      throw new Error('FEED_PURCHASE_LINK_REQUIRED');
    }
    // Settlement association is derived from the ledger, never client-supplied.
    const { settlementSaleId: _sale, settlementNumber: _number, settlementExpenseKind: _kind, ...regular } = input;
    const synced = normalizeRecord({ ...regular, id }, existing);
    if (isFeedPurchase(existing)) {
      synced.sourceType = existing!.sourceType;
      synced.sourceId = existing!.sourceId;
      synced.sourceDetail = existing!.sourceDetail;
    } else if (isFeedPurchase(synced)) {
      if (typeof synced.sourceId !== 'string' || !synced.sourceId.trim() ||
          synced.category !== '飼料費' || synced.sourceDetail !== 'purchase') {
        throw new Error('INVALID_FEED_PURCHASE_SOURCE');
      }
      synced.sourceType = 'feed-purchase';
      synced.sourceId = synced.sourceId.trim();
    }
    if ((options.createOnly || isFeedPurchase(synced)) &&
        hasSourceConflict(id, synced, [...records, ...settledRecords])) {
      throw new Error('EXPENSE_SYNC_SOURCE_EXISTS');
    }
    if (options.createOnly && isFeedPurchase(synced)) {
      const amount = Number(synced.amount);
      const vendor = String(synced.vendor ?? '').trim().toLocaleLowerCase();
      // Use the same projection as the review GET, including settlement-owned
      // expenses, rather than counting linked settlement snapshots twice.
      const currentExpenses = await listSyncedExpenses();
      const similar = currentExpenses.filter(record => {
        const sourceType = String(record.sourceType ?? '').trim();
        return !record.deletedAt && (sourceType === '' || sourceType === 'manual') &&
          record.category === '飼料費' && record.paymentDate === synced.paymentDate &&
          Number.isFinite(amount) && Number(record.amount) === amount &&
          String(record.vendor ?? '').trim().toLocaleLowerCase() === vendor;
      });
      if (!options.allowSeparateFeedPayment && similar.length) {
        throw new Error('FEED_PURCHASE_SIMILAR_EXPENSE');
      }
      if (options.allowSeparateFeedPayment && !sameConfirmedSimilarExpenses(similar, options.confirmedSimilarExpenses)) {
        throw new Error('FEED_PURCHASE_SIMILAR_EXPENSE_CHANGED');
      }
    }
    if (index >= 0) records[index] = synced;
    else records.push(synced);
    await writeJson(fileName, records);
    return synced;
  });
}

export class FeedPurchaseExpenseLinkError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

// Match the fields exposed by the expense client, without converting money to
// numbers or depending on device-local IDs and synchronization timestamps.
function comparableExpense(record: Partial<SyncedExpenseRecord>, omitFeedReference = false) {
  return {
    paymentDate: String(record.paymentDate || ''),
    category: String(record.category || ''),
    expenseCategoryMasterId: record.expenseCategoryMasterId ?? null,
    description: String(record.description || ''),
    vendor: String(record.vendor || ''),
    vendorMasterId: record.vendorMasterId ?? null,
    amount: String(record.amount || ''),
    paymentMethod: String(record.paymentMethod ?? ''),
    target: String(record.target || ''),
    animalType: record.animalType ?? null,
    animalId: record.animalId ? String(record.animalId) : null,
    animalEarTag: record.animalEarTag ? String(record.animalEarTag) : null,
    animalName: record.animalName ? String(record.animalName) : null,
    ...(!omitFeedReference ? {
      sourceType: record.sourceType ?? null,
      sourceId: record.sourceId ? String(record.sourceId) : null,
      sourceDetail: record.sourceDetail ? String(record.sourceDetail) : null,
    } : {}),
    sourceSupplyMovementId: record.sourceSupplyMovementId ?? null,
    sourceSupplyPurchaseReference: record.sourceSupplyPurchaseReference ?? null,
    memo: String(record.memo || ''),
    createdAt: String(record.createdAt || ''),
    updatedAt: String(record.updatedAt || ''),
    deletedAt: String(record.deletedAt || ''),
  };
}

function sameConfirmedSimilarExpenses(current: SyncedExpenseRecord[], confirmed: unknown): boolean {
  // A confirmation header alone cannot authorize candidates never shown to the user.
  if (confirmed === undefined) return current.length === 0;
  if (!Array.isArray(confirmed) || confirmed.length !== current.length ||
      confirmed.some(record => !record || typeof record !== 'object' || Array.isArray(record) ||
        typeof record.id !== 'string' || !record.id.trim())) return false;
  const byId = new Map<string, SyncedExpenseRecord>(confirmed.map(record => [record.id, record]));
  if (byId.size !== confirmed.length || new Set(current.map(record => record.id)).size !== current.length) return false;
  return current.every(record => {
    const reviewed = byId.get(record.id);
    return reviewed !== undefined && JSON.stringify(comparableExpense(record)) === JSON.stringify(comparableExpense(reviewed));
  });
}

/** Attach a reviewed purchase reference; never create an expense or alter its amounts. */
export async function linkExpenseToFeedPurchase(id: string, sourceId: unknown, expected: unknown) {
  if (!id.trim() || typeof sourceId !== 'string' || !sourceId.trim() ||
      !expected || typeof expected !== 'object' || Array.isArray(expected)) {
    throw new FeedPurchaseExpenseLinkError(400, 'INVALID_FEED_PURCHASE_LINK', '購入記録と確認した経費の情報が必要です');
  }
  const farmId = currentFarmId();
  if (!farmId) throw new FeedPurchaseExpenseLinkError(401, 'EXPENSE_FARM_REQUIRED', 'ログインが必要です');
  const purchaseId = sourceId.trim();
  return withFarmRequest(farmId, async () => {
    const bundles = await readJson<CloudSettlementBundle[]>('settlement-sync.json', []);
    if (bundles.some(({ settlement }) => settlement.expenseIds.includes(id) || settlement.linkedExpenseIds?.includes(id))) {
      throw new FeedPurchaseExpenseLinkError(409, 'SETTLEMENT_EXPENSE_IMMUTABLE', '精算確定済みの経費には購入記録を紐付けできません');
    }
    const records = await readJson<SyncedExpenseRecord[]>(fileName, []);
    const matches = records.filter(record => String(record.id) === id);
    const existing = matches[0];
    if (!existing) throw new FeedPurchaseExpenseLinkError(404, 'EXPENSE_NOT_FOUND', '経費記録が見つかりません');
    if (matches.length !== 1 || existing.deletedAt || existing.settlementSaleId) {
      throw new FeedPurchaseExpenseLinkError(409, 'EXPENSE_FEED_PURCHASE_UNAVAILABLE', 'この経費には購入記録を紐付けできません');
    }

    const alreadyLinked = isFeedPurchase(existing) &&
      String(existing.sourceId ?? '').trim() === purchaseId && existing.sourceDetail === 'purchase';
    const sourceType = String(existing.sourceType ?? '').trim();
    const sourceFields = ['sourceId', 'sourceDetail', 'sourceSupplyMovementId', 'sourceSupplyPurchaseReference'] as const;
    if (existing.category !== '飼料費' || (!alreadyLinked && (
      (sourceType !== '' && sourceType !== 'manual') ||
      sourceFields.some(key => String(existing[key] ?? '').trim() !== '')
    ))) {
      throw new FeedPurchaseExpenseLinkError(409, 'EXPENSE_FEED_PURCHASE_UNAVAILABLE', '元記録のない手入力の飼料費だけを紐付けできます');
    }
    if (JSON.stringify(comparableExpense(existing, alreadyLinked)) !==
        JSON.stringify(comparableExpense(expected as Partial<SyncedExpenseRecord>, alreadyLinked))) {
      throw new FeedPurchaseExpenseLinkError(409, 'EXPENSE_FEED_PURCHASE_CHANGED', '確認後に経費が変更されています。内容を読み直して確認してください');
    }
    const linked = { ...existing, sourceType: 'feed-purchase', sourceId: purchaseId, sourceDetail: 'purchase' };
    const settledRecords: SyncedExpenseRecord[] = bundles.flatMap(({ expenses, linkedExpenseSnapshots }) =>
      [...expenses, ...(linkedExpenseSnapshots ?? [])]);
    if (hasSourceConflict(id, linked, [...records, ...settledRecords])) {
      throw new FeedPurchaseExpenseLinkError(409, 'EXPENSE_SYNC_SOURCE_EXISTS', 'この購入記録には既に経費が登録されています');
    }
    if (alreadyLinked) return existing;

    // Keep all stored fields, including unknown extensions and original timestamps.
    const saved = { ...linked, cloudUpdatedAt: new Date().toISOString() };
    records[records.indexOf(existing)] = saved;
    await writeJson(fileName, records);
    return saved;
  });
}
