import type { StoredRecord } from '../storage/types';

export type CloudBreedingRecord = StoredRecord & {
  cloudUpdatedAt?: string;
  deletedAt?: string;
};
export type BreedingSyncBase = {
  version: 1;
  record: CloudBreedingRecord | null;
  cloudUpdatedAt?: string;
};
export type BreedingSyncAttempt = { version: 1; record: CloudBreedingRecord };

const textDefaults: Record<string, string> = {
  cowEarTag: '', cowName: '', heatDate: '', estrusType: '',
  breedingMethod: '未選択', breedingStatus: '発情予定',
  inseminationDate: '', inseminationCost: '', bullName: '', inseminatorName: '',
  transferPlannedDate: '', transferDate: '', transferCost: '', embryoCost: '',
  transferProcedureCost: '', transferOtherCost: '', transferCancelReason: '',
  embryoNumber: '', embryoSource: '', collectionDate: '', embryoType: '未選択',
  donorCowName: '', donorCowEarTag: '', embryoSireName: '', embryoGrade: '',
  strawNumber: '', supplierName: '', transferTechnician: '', nextHeatExpectedDate: '',
  pregnancyCheckExpectedDate: '', pregnancyCheckDate: '', pregnancyCheckCost: '',
  pregnancyResult: '未鑑定', recheckExpectedDate: '', expectedCalvingDate: '',
  estrusSignsOther: '', note: '',
};
const optionalFields = [
  'bullMasterId', 'inseminatorMasterId', 'embryoInventoryMovementId', 'embryoInventoryBatchKey',
  'embryoSireMasterId', 'supplierMasterId', 'transferTechnicianMasterId',
  'synchronizationProgramId', 'synchronizationProgramName', 'sourceScheduleId',
] as const;

/** Match the server's existing known-field contract. Unknown local fields and
 * retry metadata stay on the device. Explicit null clears an optional field:
 * omitting it would otherwise retain an old server value during a merge. */
export function toCloudBreeding(record: StoredRecord): CloudBreedingRecord {
  const result: CloudBreedingRecord = { id: String(record.cloudRecordId ?? record.id) };
  for (const [key, fallback] of Object.entries(textDefaults)) result[key] = record[key] ?? fallback;
  for (const key of optionalFields) result[key] = record[key] ?? null;
  result.estrusSigns = Array.isArray(record.estrusSigns) ? record.estrusSigns : [];
  if (record.createdAt !== undefined) result.createdAt = record.createdAt;
  if (record.updatedAt !== undefined) result.updatedAt = record.updatedAt;
  return result;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableValue(item)]));
}

// Costs and stored timestamps remain exact. Normalize only the defaults that
// the breeding server already uses, including absent optional-field values.
export function sameBreedingContent(left: StoredRecord, right: StoredRecord): boolean {
  return JSON.stringify(stableValue(toCloudBreeding(left))) === JSON.stringify(stableValue(toCloudBreeding(right)));
}

export function validBreedingRevision(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value) && !Number.isNaN(Date.parse(value));
}

export function breedingConditionHeaders(revision?: string): Record<string, string> {
  return revision ? { 'If-Match': JSON.stringify(revision) } : { 'If-None-Match': '*' };
}
