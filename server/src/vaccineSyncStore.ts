import { readJson, writeJson } from './jsonStore';

export type SyncedVaccineRecord = {
  id: string;
  targetType?: string;
  targetNumber?: string;
  targetName?: string;
  vaccineName?: string;
  vaccinationDate?: string;
  nextDueDate?: string;
  status?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

const fileName = 'vaccines-sync.json';

function normalizeRecord(
  input: SyncedVaccineRecord,
  existing?: SyncedVaccineRecord,
): SyncedVaccineRecord {
  const now = new Date().toISOString();

  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    targetType: input.targetType ?? existing?.targetType ?? '成牛',
    targetNumber: input.targetNumber ?? existing?.targetNumber ?? '',
    targetName: input.targetName ?? existing?.targetName ?? '',
    vaccineName: input.vaccineName ?? existing?.vaccineName ?? '',
    vaccinationDate: input.vaccinationDate ?? existing?.vaccinationDate ?? '',
    nextDueDate: input.nextDueDate ?? existing?.nextDueDate ?? '',
    status: input.status ?? existing?.status ?? '未接種',
    note: input.note ?? existing?.note ?? '',
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt ?? existing?.deletedAt,
    cloudUpdatedAt: now,
  };
}

export async function listSyncedVaccines() {
  const records = await readJson<SyncedVaccineRecord[]>(fileName, []);
  return records
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) =>
      String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
    );
}

export async function syncVaccine(id: string, input: SyncedVaccineRecord) {
  if (!id.trim()) throw new Error('INVALID_VACCINE_ID');

  const records = await readJson<SyncedVaccineRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const synced = normalizeRecord({ ...input, id }, existing);

  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}
