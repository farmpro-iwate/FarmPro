import { isDeepStrictEqual } from 'node:util';
import { dataPath, readJson, writeJson } from './jsonStore';

export type SyncedTreatmentRecord = {
  id: string;
  recordType?: string;
  breedingTreatmentType?: string;
  targetNumber?: string;
  targetName?: string;
  symptom?: string;
  diagnosis?: string;
  diseaseMasterId?: number | null;
  treatmentProcedure?: string;
  treatmentProcedureMasterId?: number | null;
  hoofAbnormality?: string;
  nextScheduledDate?: string;
  treatmentCourseId?: string | null;
  treatmentDate?: string;
  medicine?: string;
  dosage?: string;
  medicineSource?: '' | 'farm_stock' | 'veterinarian';
  medicineInventoryMovementId?: string | null;
  medicineInventoryBatchKey?: string | null;
  medicineInventoryQuantity?: number | null;
  medicineCost?: string;
  medicalFee?: string;
  withdrawalEndDate?: string;
  veterinarian?: string;
  progress?: string;
  note?: string;
  sourceScheduleId?: string;
  synchronizationProgramId?: string;
  synchronizationProgramName?: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

const fileName = 'treatments-sync.json';
export type TreatmentSyncConditions = { ifMatch?: string; ifNoneMatch?: string };
const queues = new Map<string, Promise<void>>();

// Readers and writers share the entire read/check/write boundary, including
// first-file creation. The key also separates runtime directories and farms.
async function withFarmSyncLock<T>(action: () => Promise<T>): Promise<T> {
  const key = dataPath(fileName);
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  queues.set(key, tail);
  await previous;
  try { return await action(); }
  finally { release(); if (queues.get(key) === tail) queues.delete(key); }
}

function withoutLocalSyncState(record: SyncedTreatmentRecord): SyncedTreatmentRecord {
  return Object.fromEntries(Object.entries(record).filter(([key]) =>
    key !== 'syncRecordId' && key !== 'syncWarning' &&
    !key.startsWith('cloudSync') && !key.startsWith('treatmentSync'),
  )) as SyncedTreatmentRecord;
}

function assertId(id: string): void {
  if (typeof id !== 'string' || !id.trim()) throw new Error('INVALID_TREATMENT_ID');
}

function assertMutationInput(input: unknown): asserts input is SyncedTreatmentRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      (input as { deletedAt?: unknown }).deletedAt !== undefined) {
    throw new Error('INVALID_TREATMENT_SYNC_INPUT');
  }
}

function expectedRevision(conditions: TreatmentSyncConditions): string | undefined {
  const value = conditions.ifMatch;
  let expected: string | undefined;
  if (value !== undefined) {
    const text = value.trim();
    expected = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
    if (!expected || expected === '*' || expected.includes('"') || expected.includes(',')) {
      throw new Error('INVALID_TREATMENT_SYNC_CONDITION');
    }
  }
  if (conditions.ifNoneMatch !== undefined &&
      (conditions.ifNoneMatch.trim() !== '*' || expected !== undefined)) {
    throw new Error('INVALID_TREATMENT_SYNC_CONDITION');
  }
  return expected;
}

function validDate(value?: string): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function storedRevision(record?: SyncedTreatmentRecord): string | undefined {
  if (validDate(record?.cloudUpdatedAt)) return record!.cloudUpdatedAt;
  if (validDate(record?.updatedAt)) return record!.updatedAt;
  return undefined;
}

function nextCloudUpdatedAt(existing?: SyncedTreatmentRecord): string {
  const previous = Date.parse(storedRevision(existing) || '');
  return new Date(Number.isFinite(previous) ? Math.max(Date.now(), previous + 1) : Date.now()).toISOString();
}

function publicRecord(record: SyncedTreatmentRecord): SyncedTreatmentRecord {
  // Legacy rows can use their persisted updatedAt as a stable fallback. A read
  // never creates a new revision or rewrites historical business fields.
  return { ...withoutLocalSyncState(record), cloudUpdatedAt: storedRevision(record) };
}

function normalizeRecord(input: SyncedTreatmentRecord, existing?: SyncedTreatmentRecord): SyncedTreatmentRecord {
  input = withoutLocalSyncState(input);
  existing = existing ? withoutLocalSyncState(existing) : undefined;
  const now = new Date().toISOString();
  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    recordType: input.recordType ?? existing?.recordType ?? '治療',
    breedingTreatmentType: input.breedingTreatmentType ?? existing?.breedingTreatmentType ?? '',
    targetNumber: input.targetNumber ?? existing?.targetNumber ?? '',
    targetName: input.targetName ?? existing?.targetName ?? '',
    symptom: input.symptom ?? existing?.symptom ?? '',
    diagnosis: input.diagnosis ?? existing?.diagnosis ?? '',
    diseaseMasterId: input.diseaseMasterId === undefined ? existing?.diseaseMasterId ?? null : input.diseaseMasterId,
    treatmentProcedure: input.treatmentProcedure ?? existing?.treatmentProcedure ?? '',
    treatmentProcedureMasterId: input.treatmentProcedureMasterId === undefined
      ? existing?.treatmentProcedureMasterId ?? null : input.treatmentProcedureMasterId,
    hoofAbnormality: input.hoofAbnormality ?? existing?.hoofAbnormality ?? '',
    nextScheduledDate: input.nextScheduledDate ?? existing?.nextScheduledDate ?? '',
    treatmentCourseId: input.treatmentCourseId === undefined ? existing?.treatmentCourseId ?? null : input.treatmentCourseId,
    treatmentDate: input.treatmentDate ?? existing?.treatmentDate ?? '',
    medicine: input.medicine ?? existing?.medicine ?? '',
    dosage: input.dosage ?? existing?.dosage ?? '',
    medicineSource: input.medicineSource ?? existing?.medicineSource ?? '',
    // Missing fields preserve the preceding record; explicit null clears an
    // inventory link or optional selection without JSON dropping the change.
    medicineInventoryMovementId: input.medicineInventoryMovementId === undefined
      ? existing?.medicineInventoryMovementId ?? null : input.medicineInventoryMovementId,
    medicineInventoryBatchKey: input.medicineInventoryBatchKey === undefined
      ? existing?.medicineInventoryBatchKey ?? null : input.medicineInventoryBatchKey,
    medicineInventoryQuantity: input.medicineInventoryQuantity === undefined
      ? existing?.medicineInventoryQuantity ?? null : input.medicineInventoryQuantity,
    medicineCost: input.medicineCost ?? existing?.medicineCost ?? '',
    medicalFee: input.medicalFee ?? existing?.medicalFee ?? '',
    withdrawalEndDate: input.withdrawalEndDate ?? existing?.withdrawalEndDate ?? '',
    veterinarian: input.veterinarian ?? existing?.veterinarian ?? '',
    progress: input.progress ?? existing?.progress ?? '治療中',
    note: input.note ?? existing?.note ?? '',
    sourceScheduleId: input.sourceScheduleId ?? existing?.sourceScheduleId ?? '',
    synchronizationProgramId: input.synchronizationProgramId ?? existing?.synchronizationProgramId ?? '',
    synchronizationProgramName: input.synchronizationProgramName ?? existing?.synchronizationProgramName ?? '',
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt ?? existing?.deletedAt,
    cloudUpdatedAt: nextCloudUpdatedAt(existing),
  };
}

function sameRecordContent(left: SyncedTreatmentRecord, right: SyncedTreatmentRecord): boolean {
  const content = (record: SyncedTreatmentRecord) => {
    const { cloudUpdatedAt: _revision, ...fields } = withoutLocalSyncState(record);
    return JSON.parse(JSON.stringify(fields));
  };
  return isDeepStrictEqual(content(left), content(right));
}

function assertConditions(
  existing: SyncedTreatmentRecord | undefined, expected: string | undefined, conditions: TreatmentSyncConditions,
): void {
  if (conditions.ifNoneMatch !== undefined && existing) throw new Error('TREATMENT_SYNC_PRECONDITION_FAILED');
  if (expected !== undefined && (!existing || storedRevision(existing) !== expected)) {
    throw new Error('TREATMENT_SYNC_PRECONDITION_FAILED');
  }
}

export async function listSyncedTreatments() {
  return withFarmSyncLock(async () => {
    const records = await readJson<SyncedTreatmentRecord[]>(fileName, []);
    // This sync feed deliberately includes tombstones for deletion propagation.
    return records.map(publicRecord)
      .sort((a, b) => String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')));
  });
}

export async function findSyncedTreatment(id: string): Promise<SyncedTreatmentRecord | undefined> {
  assertId(id);
  return withFarmSyncLock(async () => {
    const records = await readJson<SyncedTreatmentRecord[]>(fileName, []);
    const existing = records.find(record => String(record.id) === id);
    return existing ? publicRecord(existing) : undefined;
  });
}

export async function syncTreatment(
  id: string, input: SyncedTreatmentRecord, conditions: TreatmentSyncConditions = {},
) {
  assertId(id);
  assertMutationInput(input);
  const expected = expectedRevision(conditions);
  return withFarmSyncLock(async () => {
    const records = await readJson<SyncedTreatmentRecord[]>(fileName, []);
    const index = records.findIndex(record => String(record.id) === id);
    const existing = index >= 0 ? records[index] : undefined;
    if (conditions.ifNoneMatch !== undefined && existing) throw new Error('TREATMENT_SYNC_PRECONDITION_FAILED');
    if (existing?.deletedAt) throw new Error('TREATMENT_RECORD_DELETED');
    const synced = normalizeRecord({ ...input, id }, existing);
    // A lost ACK may retry its old If-Match only when every business field,
    // unknown field and timestamp is already committed exactly as requested.
    if (existing && sameRecordContent(synced, normalizeRecord(existing, existing))) return publicRecord(existing);
    assertConditions(existing, expected, conditions);
    // Old clients sent read-time clocks in the body without HTTP conditions.
    // Preserve their live-update path; the body clock is never a precondition.
    if (index >= 0) records[index] = synced;
    else records.push(synced);
    await writeJson(fileName, records);
    return synced;
  });
}

export async function deleteSyncedTreatment(id: string, conditions: TreatmentSyncConditions = {}) {
  assertId(id);
  const expected = expectedRevision(conditions);
  return withFarmSyncLock(async () => {
    const records = await readJson<SyncedTreatmentRecord[]>(fileName, []);
    const index = records.findIndex(record => String(record.id) === id);
    const existing = index >= 0 ? records[index] : undefined;
    if (existing?.deletedAt) return publicRecord(existing);
    assertConditions(existing, expected, conditions);
    const now = new Date().toISOString();
    // Missing-ID deletion already created a tombstone for legacy clients. Keep
    // that behavior and protect new absence checks with If-None-Match: *.
    const deleted = normalizeRecord({ ...(existing ?? { id }), id, updatedAt: now, deletedAt: now }, existing);
    if (index >= 0) records[index] = deleted;
    else records.push(deleted);
    await writeJson(fileName, records);
    return deleted;
  });
}
