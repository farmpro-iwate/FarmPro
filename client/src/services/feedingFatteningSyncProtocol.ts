import type { StoredRecord } from '../storage/types';

export type FeedingFatteningSource = 'feedingAlertActions' | 'fatteningTransitions' | 'activityRecords';
export type FeedingFatteningCloudRecord = StoredRecord & { id: string; cloudUpdatedAt?: string; deletedAt?: string };
export type FeedingFatteningSyncBase = { version: 1; record: FeedingFatteningCloudRecord | null; cloudUpdatedAt?: string };
export type FeedingFatteningSyncAttempt = { version: 1; record: FeedingFatteningCloudRecord };

export const feedingFatteningSyncResources = {
  feedingAlertActions: {
    prefix: 'feedingAlertActionSync', path: '/api/feeding-alert-actions/record-sync',
    textFields: ['actionDate', 'calfId', 'calfName', 'ageDays', 'alertType', 'actionType', 'memo', 'nextCheckDate', 'status'],
  },
  fatteningTransitions: {
    prefix: 'fatteningTransitionSync', path: '/api/fattening-transitions/record-sync',
    textFields: ['targetNumber', 'targetName', 'startDate', 'transitionReason', 'startWeight', 'targetWeight',
      'targetShippingDate', 'housingLocation', 'withdrawalEndDate', 'status', 'memo'],
  },
  activityRecords: {
    prefix: 'activityRecordSync', path: '/api/activity-records/record-sync',
    textFields: ['activityType', 'recordDate', 'title', 'note', 'animalKind', 'animalId', 'animalSyncId',
      'animalIdentificationNumber', 'animalEarTag', 'animalName', 'animalBirthday'],
  },
} as const;

/** These resources use string IDs. Keep every business value, including
 * explicit null, empty text and date strings; omit only synchronization state. */
export function toCloudFeedingFattening(source: FeedingFatteningSource, record: StoredRecord): FeedingFatteningCloudRecord {
  const config = feedingFatteningSyncResources[source];
  const business = Object.fromEntries(Object.entries(record).filter(([key]) =>
    !['id', 'syncRecordId', 'syncWarning', 'cloudUpdatedAt', 'deletedAt'].includes(key) &&
    !key.startsWith('cloudSync') && !key.startsWith(config.prefix)));
  const result: FeedingFatteningCloudRecord = { ...business, id: String(record.syncRecordId || record.id) };
  for (const key of config.textFields) result[key] = record[key] === undefined ? '' : record[key];
  return result;
}

export function stableFeedingFatteningValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableFeedingFatteningValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, stableFeedingFatteningValue(item)]));
}

export function sameFeedingFatteningContent(source: FeedingFatteningSource, left: StoredRecord, right: StoredRecord): boolean {
  return JSON.stringify(stableFeedingFatteningValue(toCloudFeedingFattening(source, left))) ===
    JSON.stringify(stableFeedingFatteningValue(toCloudFeedingFattening(source, right)));
}

export function validFeedingFatteningRevision(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value) && !Number.isNaN(Date.parse(value));
}

export function feedingFatteningConditionHeaders(revision?: string): Record<string, string> {
  return revision ? { 'If-Match': JSON.stringify(revision) } : { 'If-None-Match': '*' };
}
