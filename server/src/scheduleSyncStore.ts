import { readJson, writeJson } from './jsonStore';

export type SyncedScheduleRecord = {
  id: string;
  scheduleType?: string;
  title?: string;
  targetNumber?: string;
  targetName?: string;
  dueDate?: string;
  status?: string;
  note?: string;
  synchronizationProgramId?: string;
  synchronizationProgramName?: string;
  synchronizationPurpose?: string;
  synchronizationStartDate?: string;
  synchronizationStep?: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

const fileName = 'schedules-sync.json';

function normalizeRecord(
  input: SyncedScheduleRecord,
  existing?: SyncedScheduleRecord,
): SyncedScheduleRecord {
  const now = new Date().toISOString();

  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    scheduleType: input.scheduleType ?? existing?.scheduleType ?? 'その他',
    title: input.title ?? existing?.title ?? '',
    targetNumber: input.targetNumber ?? existing?.targetNumber ?? '',
    targetName: input.targetName ?? existing?.targetName ?? '',
    dueDate: input.dueDate ?? existing?.dueDate ?? '',
    status: input.status ?? existing?.status ?? '未完了',
    note: input.note ?? existing?.note ?? '',
    synchronizationProgramId: input.synchronizationProgramId ?? existing?.synchronizationProgramId,
    synchronizationProgramName: input.synchronizationProgramName ?? existing?.synchronizationProgramName,
    synchronizationPurpose: input.synchronizationPurpose ?? existing?.synchronizationPurpose,
    synchronizationStartDate: input.synchronizationStartDate ?? existing?.synchronizationStartDate,
    synchronizationStep: input.synchronizationStep ?? existing?.synchronizationStep,
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt ?? existing?.deletedAt,
    cloudUpdatedAt: now,
  };
}

export async function listSyncedSchedules() {
  const records = await readJson<SyncedScheduleRecord[]>(fileName, []);
  return records
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) =>
      String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
    );
}

export async function syncSchedule(id: string, input: SyncedScheduleRecord) {
  if (!id.trim()) throw new Error('INVALID_SCHEDULE_ID');

  const records = await readJson<SyncedScheduleRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const synced = normalizeRecord({ ...input, id }, existing);

  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}
