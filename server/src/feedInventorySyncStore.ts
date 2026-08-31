import { readJson, writeJson } from './jsonStore';

export type SyncedFeedInventoryRecord = {
  id: string;
  transactionDate?: string;
  feedName?: string;
  transactionType?: string;
  quantity?: string;
  unit?: string;
  unitPrice?: string;
  totalPrice?: string;
  supplier?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

const fileName = 'feed-inventory-sync.json';

function normalizeRecord(
  input: SyncedFeedInventoryRecord,
  existing?: SyncedFeedInventoryRecord,
): SyncedFeedInventoryRecord {
  const now = new Date().toISOString();

  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    transactionDate: input.transactionDate ?? existing?.transactionDate ?? '',
    feedName: input.feedName ?? existing?.feedName ?? '',
    transactionType: input.transactionType ?? existing?.transactionType ?? '入庫',
    quantity: input.quantity ?? existing?.quantity ?? '',
    unit: input.unit ?? existing?.unit ?? 'kg',
    unitPrice: input.unitPrice ?? existing?.unitPrice ?? '',
    totalPrice: input.totalPrice ?? existing?.totalPrice ?? '',
    supplier: input.supplier ?? existing?.supplier ?? '',
    memo: input.memo ?? existing?.memo ?? '',
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt ?? existing?.deletedAt,
    cloudUpdatedAt: now,
  };
}

export async function listSyncedFeedInventory() {
  const records = await readJson<SyncedFeedInventoryRecord[]>(fileName, []);
  return records
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) =>
      String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
    );
}

export async function syncFeedInventory(
  id: string,
  input: SyncedFeedInventoryRecord,
) {
  if (!id.trim()) throw new Error('INVALID_FEED_INVENTORY_ID');

  const records = await readJson<SyncedFeedInventoryRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const synced = normalizeRecord({ ...input, id }, existing);

  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}
