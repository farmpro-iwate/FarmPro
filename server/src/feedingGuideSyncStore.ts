import { readJson, writeJson } from './jsonStore';

export type SyncedFeedingGuideRecord = {
  id: string;
  ageDays?: string;
  ageMonth?: string;
  stageName?: string;
  targetWeight?: string;
  targetHeight?: string;
  targetChest?: string;
  starterAmount?: string;
  growingFeedAmount?: string;
  roughageAmount?: string;
  otherAmount?: string;
  memo?: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

const fileName = 'feeding-guide-sync.json';

function normalizeRecord(
  input: SyncedFeedingGuideRecord,
  existing?: SyncedFeedingGuideRecord,
): SyncedFeedingGuideRecord {
  const now = new Date().toISOString();

  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    ageDays: input.ageDays ?? existing?.ageDays ?? '',
    ageMonth: input.ageMonth ?? existing?.ageMonth ?? '',
    stageName: input.stageName ?? existing?.stageName ?? '',
    targetWeight: input.targetWeight ?? existing?.targetWeight ?? '',
    targetHeight: input.targetHeight ?? existing?.targetHeight ?? '',
    targetChest: input.targetChest ?? existing?.targetChest ?? '',
    starterAmount: input.starterAmount ?? existing?.starterAmount ?? '',
    growingFeedAmount: input.growingFeedAmount ?? existing?.growingFeedAmount ?? '',
    roughageAmount: input.roughageAmount ?? existing?.roughageAmount ?? '',
    otherAmount: input.otherAmount ?? existing?.otherAmount ?? '',
    memo: input.memo ?? existing?.memo ?? '',
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt ?? existing?.deletedAt,
    cloudUpdatedAt: now,
  };
}

export async function listSyncedFeedingGuide() {
  const records = await readJson<SyncedFeedingGuideRecord[]>(fileName, []);
  return records
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) =>
      String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
    );
}

export async function syncFeedingGuide(
  id: string,
  input: SyncedFeedingGuideRecord,
) {
  if (!id.trim()) throw new Error('INVALID_FEEDING_GUIDE_ID');

  const records = await readJson<SyncedFeedingGuideRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const synced = normalizeRecord({ ...input, id }, existing);

  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}
