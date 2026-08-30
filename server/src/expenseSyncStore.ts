import { readJson, writeJson } from './jsonStore';

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
    memo: input.memo ?? existing?.memo ?? '',
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt ?? existing?.deletedAt,
    cloudUpdatedAt: now,
  };
}

export async function listSyncedExpenses() {
  const records = await readJson<SyncedExpenseRecord[]>(fileName, []);
  return records
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) =>
      String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
    );
}

export async function syncExpense(id: string, input: SyncedExpenseRecord) {
  if (!id.trim()) throw new Error('INVALID_EXPENSE_ID');

  const records = await readJson<SyncedExpenseRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const synced = normalizeRecord({ ...input, id }, existing);

  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}
