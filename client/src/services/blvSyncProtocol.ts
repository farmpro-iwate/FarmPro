import type { StoredRecord } from '../storage/types';

export type CloudBlvRecord = StoredRecord & { id: string; cloudUpdatedAt?: string; deletedAt?: string };
export type BlvSyncBase = { version: 1; record: CloudBlvRecord | null; cloudUpdatedAt?: string };
export type BlvSyncAttempt = { version: 1; record: CloudBlvRecord };

const textFields = ['cowEarTag', 'cowName', 'testDate', 'result', 'nextTestDate', 'isolationMemo', 'note'] as const;

/** Keep all business fields and timestamps; browser synchronization state is
 * never part of the record sent to another device. */
export function toCloudBlv(record: StoredRecord): CloudBlvRecord {
  const business = Object.fromEntries(Object.entries(record).filter(([key]) =>
    !['id', 'syncRecordId', 'syncWarning', 'cloudUpdatedAt', 'deletedAt'].includes(key) &&
    !key.startsWith('cloudSync') && !key.startsWith('blvSync')));
  const result: CloudBlvRecord = {
    ...business,
    id: String(record.syncRecordId || (typeof record.id === 'number' ? `blv:${record.id}` : record.id)),
  };
  for (const key of textFields) result[key] = record[key] ?? '';
  return result;
}

export function stableBlvValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableBlvValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableBlvValue(item)]));
}

export function sameBlvContent(left: StoredRecord, right: StoredRecord): boolean {
  return JSON.stringify(stableBlvValue(toCloudBlv(left))) === JSON.stringify(stableBlvValue(toCloudBlv(right)));
}

export function validBlvRevision(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value) && !Number.isNaN(Date.parse(value));
}

export function blvConditionHeaders(revision?: string): Record<string, string> {
  return revision ? { 'If-Match': JSON.stringify(revision) } : { 'If-None-Match': '*' };
}
