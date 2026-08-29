import { readJson, writeJson } from './jsonStore';

export type SyncedTreatmentRecord = {
  id: string;
  recordType?: string;
  breedingTreatmentType?: string;
  targetNumber?: string;
  targetName?: string;
  symptom?: string;
  diagnosis?: string;
  diseaseMasterId?: number;
  treatmentProcedure?: string;
  treatmentProcedureMasterId?: number;
  hoofAbnormality?: string;
  nextScheduledDate?: string;
  treatmentDate?: string;
  medicine?: string;
  dosage?: string;
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
};

const fileName = 'treatments-sync.json';

function normalizeRecord(input: SyncedTreatmentRecord, existing?: SyncedTreatmentRecord): SyncedTreatmentRecord {
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
    diseaseMasterId: input.diseaseMasterId ?? existing?.diseaseMasterId,
    treatmentProcedure: input.treatmentProcedure ?? existing?.treatmentProcedure ?? '',
    treatmentProcedureMasterId: input.treatmentProcedureMasterId ?? existing?.treatmentProcedureMasterId,
    hoofAbnormality: input.hoofAbnormality ?? existing?.hoofAbnormality ?? '',
    nextScheduledDate: input.nextScheduledDate ?? existing?.nextScheduledDate ?? '',
    treatmentDate: input.treatmentDate ?? existing?.treatmentDate ?? '',
    medicine: input.medicine ?? existing?.medicine ?? '',
    dosage: input.dosage ?? existing?.dosage ?? '',
    withdrawalEndDate: input.withdrawalEndDate ?? existing?.withdrawalEndDate ?? '',
    veterinarian: input.veterinarian ?? existing?.veterinarian ?? '',
    progress: input.progress ?? existing?.progress ?? '治療中',
    note: input.note ?? existing?.note ?? '',
    sourceScheduleId: input.sourceScheduleId ?? existing?.sourceScheduleId ?? '',
    synchronizationProgramId: input.synchronizationProgramId ?? existing?.synchronizationProgramId ?? '',
    synchronizationProgramName: input.synchronizationProgramName ?? existing?.synchronizationProgramName ?? '',
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    cloudUpdatedAt: now,
  };
}

export async function listSyncedTreatments() {
  const records = await readJson<SyncedTreatmentRecord[]>(fileName, []);
  return records
    .map((record) => normalizeRecord(record, record))
    .sort((a, b) => String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')));
}

export async function syncTreatment(id: string, input: SyncedTreatmentRecord) {
  if (!id.trim()) throw new Error('INVALID_TREATMENT_ID');

  const records = await readJson<SyncedTreatmentRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const synced = normalizeRecord({ ...input, id }, existing);

  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
}
