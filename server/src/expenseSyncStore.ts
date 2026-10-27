import { readJson, writeJson } from './jsonStore';
import type { CloudSettlementBundle } from './settlementSyncStore';

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
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
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
  const settlementExpenses = await settlementExpenseProjection();
  const regularIds = new Set(records.map(row => row.id));
  if (settlementExpenses.some(row => regularIds.has(row.id))) {
    throw new Error('SETTLEMENT_EXPENSE_ID_CONFLICT');
  }
  return [...records.map((record) => normalizeRecord(record, record)), ...settlementExpenses]
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) =>
      String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
    );
}

export async function syncExpense(id: string, input: SyncedExpenseRecord) {
  if (!id.trim()) throw new Error('INVALID_EXPENSE_ID');

  const reserved = await settlementExpenseProjection();
  if (reserved.some(row => row.id === id)) {
    throw new Error('SETTLEMENT_EXPENSE_IMMUTABLE');
  }
  const records = await readJson<SyncedExpenseRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const synced = normalizeRecord({ ...input, id }, existing);

  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}
