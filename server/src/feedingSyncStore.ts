import { readJson, writeJson } from './jsonStore';

export type SyncedFeedingRecord = {
  id: string;
  feedingDate?: string;
  target?: string;
  feedName?: string;
  amount?: string;
  unit?: string;
  unitPrice?: string;
  totalPrice?: string;
  purpose?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

const fileName = 'feedings-sync.json';

function normalizeRecord(
  input: SyncedFeedingRecord,
  existing?: SyncedFeedingRecord,
): SyncedFeedingRecord {
  const now = new Date().toISOString();

  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    feedingDate: input.feedingDate ?? existing?.feedingDate ?? '',
    target: input.target ?? existing?.target ?? '',
    feedName: input.feedName ?? existing?.feedName ?? '',
    amount: input.amount ?? existing?.amount ?? '',
    unit: input.unit ?? existing?.unit ?? 'kg',
    unitPrice: input.unitPrice ?? existing?.unitPrice ?? '',
    totalPrice: input.totalPrice ?? existing?.totalPrice ?? '',
    purpose: input.purpose ?? existing?.purpose ?? '維持',
    memo: input.memo ?? existing?.memo ?? '',
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt ?? existing?.deletedAt,
    cloudUpdatedAt: now,
  };
}

export async function listSyncedFeedings() {
  const records = await readJson<SyncedFeedingRecord[]>(fileName, []);
  return records
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) =>
      String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
    );
}

export async function syncFeeding(id: string, input: SyncedFeedingRecord) {
  if (!id.trim()) throw new Error('INVALID_FEEDING_ID');

  const records = await readJson<SyncedFeedingRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const synced = normalizeRecord({ ...input, id }, existing);

  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}
