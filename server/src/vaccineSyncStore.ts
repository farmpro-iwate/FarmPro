import { isDeepStrictEqual } from 'node:util';
import { dataPath, readJson, writeJson } from './jsonStore';

export type SyncedVaccineRecord = {
  id: string;
  targetType?: string;
  targetNumber?: string;
  targetName?: string;
  vaccineName?: string;
  vaccineCost?: string;
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
export type VaccineSyncConditions = { ifMatch?: string; ifNoneMatch?: string };
const queues = new Map<string, Promise<void>>();

// Hold the farm's complete read/check/write sequence, including first-file reads.
async function withFarmSyncLock<T>(action: () => Promise<T>): Promise<T> {
  const key = dataPath(fileName);
  const previous = queues.get(key) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  queues.set(key, tail);
  await previous;
  try { return await action(); }
  finally { release(); if (queues.get(key) === tail) queues.delete(key); }
}

function withoutLocalSyncState(record: SyncedVaccineRecord): SyncedVaccineRecord {
  return Object.fromEntries(Object.entries(record).filter(([key]) =>
    key !== 'syncRecordId' && key !== 'syncWarning' &&
    !key.startsWith('cloudSync') && !key.startsWith('vaccineSync'),
  )) as SyncedVaccineRecord;
}

function expectedRevision(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const text = value.trim();
  const revision = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
  if (!revision || revision === '*' || revision.includes('"') || revision.includes(',')) {
    throw new Error('INVALID_VACCINE_SYNC_CONDITION');
  }
  return revision;
}

function nextCloudUpdatedAt(existing?: SyncedVaccineRecord): string {
  const previous = Date.parse(existing?.cloudUpdatedAt || '');
  return new Date(Number.isFinite(previous) ? Math.max(Date.now(), previous + 1) : Date.now()).toISOString();
}

function sameRecordContent(left: SyncedVaccineRecord, right: SyncedVaccineRecord): boolean {
  const content = (record: SyncedVaccineRecord) => {
    const { cloudUpdatedAt: _revision, ...fields } = withoutLocalSyncState(record);
    return JSON.parse(JSON.stringify(fields));
  };
  return isDeepStrictEqual(content(left), content(right));
}

function normalizeRecord(
  input: SyncedVaccineRecord,
  existing?: SyncedVaccineRecord,
): SyncedVaccineRecord {
  input = withoutLocalSyncState(input);
  existing = existing ? withoutLocalSyncState(existing) : undefined;
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
    cloudUpdatedAt: nextCloudUpdatedAt(existing),
  };
}

export async function listSyncedVaccines() {
  return withFarmSyncLock(async () => {
    const records = await readJson<SyncedVaccineRecord[]>(fileName, []);
    // A read must return the persisted revision, not manufacture a newer clock.
    return records.map(withoutLocalSyncState).sort((a, b) =>
      String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
    );
  });
}

export async function findSyncedVaccine(id: string): Promise<SyncedVaccineRecord | undefined> {
  if (!id.trim()) throw new Error('INVALID_VACCINE_ID');
  return withFarmSyncLock(async () => {
    const records = await readJson<SyncedVaccineRecord[]>(fileName, []);
    const existing = records.find(record => String(record.id) === id);
    return existing ? withoutLocalSyncState(existing) : undefined;
  });
}

export async function syncVaccine(
  id: string,
  input: SyncedVaccineRecord,
  conditions: VaccineSyncConditions = {},
) {
  if (!id.trim()) throw new Error('INVALID_VACCINE_ID');
  return withFarmSyncLock(async () => {
    const expected = expectedRevision(conditions.ifMatch);
    if (conditions.ifNoneMatch !== undefined &&
        (conditions.ifNoneMatch.trim() !== '*' || expected !== undefined)) {
      throw new Error('INVALID_VACCINE_SYNC_CONDITION');
    }
    const records = await readJson<SyncedVaccineRecord[]>(fileName, []);
    const index = records.findIndex(record => String(record.id) === id);
    const existing = index >= 0 ? records[index] : undefined;
    if (conditions.ifNoneMatch !== undefined && existing) {
      throw new Error('VACCINE_SYNC_PRECONDITION_FAILED');
    }
    if (existing?.deletedAt && !input.deletedAt) throw new Error('VACCINE_RECORD_DELETED');

    const synced = normalizeRecord({ ...input, id }, existing);
    // A lost acknowledgement can be replayed using its old If-Match value.
    // Exact business content and timestamps must already be committed.
    if (existing && sameRecordContent(synced, normalizeRecord(existing, existing))) {
      return withoutLocalSyncState(existing);
    }
    if (expected !== undefined && (!existing || existing.cloudUpdatedAt !== expected)) {
      throw new Error('VACCINE_SYNC_PRECONDITION_FAILED');
    }
    // Old vaccine clients sent a read-time cloudUpdatedAt in the body without
    // conditional headers. Preserve that path; only explicit HTTP conditions
    // establish a revision precondition. Deleted IDs still cannot be revived.
    if (index >= 0) records[index] = synced;
    else records.push(synced);

    await writeJson(fileName, records);
    return synced;
  });
}

export async function deleteSyncedVaccine(id: string, conditions: VaccineSyncConditions = {}) {
  if (!id.trim()) throw new Error('INVALID_VACCINE_ID');
  return withFarmSyncLock(async () => {
    const expected = expectedRevision(conditions.ifMatch);
    if (conditions.ifNoneMatch !== undefined &&
        (conditions.ifNoneMatch.trim() !== '*' || expected !== undefined)) {
      throw new Error('INVALID_VACCINE_SYNC_CONDITION');
    }
    const records = await readJson<SyncedVaccineRecord[]>(fileName, []);
    const index = records.findIndex(record => String(record.id) === id);
    const existing = index >= 0 ? records[index] : undefined;
    // A repeated DELETE confirms the same tombstone even after a lost response.
    if (existing?.deletedAt) return withoutLocalSyncState(existing);
    // An offline creation may not have reached the cloud yet. Stamp its
    // tombstone only while the ID is still absent, never over a competing PUT.
    if (conditions.ifNoneMatch !== undefined && existing) {
      throw new Error('VACCINE_SYNC_PRECONDITION_FAILED');
    }
    if (expected !== undefined && (!existing || existing.cloudUpdatedAt !== expected)) {
      throw new Error('VACCINE_SYNC_PRECONDITION_FAILED');
    }
    const now = new Date().toISOString();
    const deleted = normalizeRecord({
      ...(existing ?? { id }), id, deletedAt: now, updatedAt: now,
    }, existing);
    if (index >= 0) records[index] = deleted;
    else records.push(deleted);
    await writeJson(fileName, records);
    return deleted;
  });
}
