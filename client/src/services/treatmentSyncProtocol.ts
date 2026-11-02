import type { StoredRecord } from '../storage/types';

export type CloudTreatmentRecord = StoredRecord & { id: string; cloudUpdatedAt?: string; deletedAt?: string };
export type TreatmentSyncBase = { version: 1; record: CloudTreatmentRecord | null; cloudUpdatedAt?: string };
export type TreatmentSyncAttempt = { version: 1; record: CloudTreatmentRecord };

const textDefaults: Record<string, string> = {
  recordType: '治療', breedingTreatmentType: '', targetNumber: '', targetName: '',
  symptom: '', diagnosis: '', treatmentProcedure: '', hoofAbnormality: '', nextScheduledDate: '',
  treatmentDate: '', medicine: '', dosage: '', medicineSource: '', medicineCost: '', medicalFee: '',
  withdrawalEndDate: '', veterinarian: '', progress: '治療中', note: '',
  sourceScheduleId: '', synchronizationProgramId: '', synchronizationProgramName: '',
};
const optionalFields = [
  'diseaseMasterId', 'treatmentProcedureMasterId', 'treatmentCourseId',
  'medicineInventoryMovementId', 'medicineInventoryBatchKey', 'medicineInventoryQuantity',
] as const;

/** Preserve unknown business fields and exact costs/timestamps. Only local
 * synchronization metadata is removed; explicit null clears optional links. */
export function toCloudTreatment(record: StoredRecord): CloudTreatmentRecord {
  const business = Object.fromEntries(Object.entries(record).filter(([key]) =>
    !['id', 'syncRecordId', 'syncWarning', 'cloudUpdatedAt', 'deletedAt'].includes(key) &&
    !key.startsWith('cloudSync') && !key.startsWith('treatmentSync')));
  const result: CloudTreatmentRecord = {
    ...business,
    id: String(record.syncRecordId || (typeof record.id === 'number' ? `treatment:${record.id}` : record.id)),
  };
  for (const [key, fallback] of Object.entries(textDefaults)) result[key] = record[key] ?? fallback;
  for (const key of optionalFields) result[key] = record[key] ?? null;
  return result;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
}

export function sameTreatmentContent(left: StoredRecord, right: StoredRecord): boolean {
  return JSON.stringify(stableValue(toCloudTreatment(left))) === JSON.stringify(stableValue(toCloudTreatment(right)));
}

export function validTreatmentRevision(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value) && !Number.isNaN(Date.parse(value));
}

export function treatmentConditionHeaders(revision?: string): Record<string, string> {
  return revision ? { 'If-Match': JSON.stringify(revision) } : { 'If-None-Match': '*' };
}
