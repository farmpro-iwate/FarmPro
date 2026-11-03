import type { ActivityRecord, ActivityRecordInput } from '../types/activityRecord';
import { createFeedingFatteningSync } from './feedingFatteningSync';

export const ACTIVITY_RECORD_SYNC_STATUS_EVENT = 'farmpro:activity-record-sync-status';

function normalizeInput(input: ActivityRecordInput): ActivityRecordInput {
  if (input.activityType !== 'farm' && input.activityType !== 'animal') throw new Error('記録の区分を選択してください。');
  const recordDate = String(input.recordDate ?? '').trim();
  const parsed = new Date(`${recordDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(recordDate) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== recordDate) {
    throw new Error('有効な記録日を入力してください。');
  }
  const title = String(input.title ?? '').trim();
  if (!title) throw new Error('記録の内容を入力してください。');
  const result: ActivityRecordInput = {
    activityType: input.activityType, recordDate, title, note: String(input.note ?? ''),
    animalKind: '', animalId: '', animalSyncId: '', animalIdentificationNumber: '', animalEarTag: '', animalName: '', animalBirthday: '',
  };
  if (input.activityType === 'animal') {
    if (input.animalKind !== 'cattle' && input.animalKind !== 'calf') throw new Error('対象の牛を選択してください。');
    result.animalKind = input.animalKind;
    for (const key of ['animalId', 'animalSyncId', 'animalIdentificationNumber', 'animalEarTag', 'animalName', 'animalBirthday'] as const) {
      result[key] = String(input[key] ?? '').trim();
    }
    if (!result.animalId && !result.animalSyncId && !result.animalIdentificationNumber && !result.animalEarTag) {
      throw new Error('対象の牛を選択してください。');
    }
  }
  return result;
}

const sync = createFeedingFatteningSync<ActivityRecord, ActivityRecordInput>({
  source: 'activityRecords', label: '活動記録', classPrefix: 'ActivityRecord', event: ACTIVITY_RECORD_SYNC_STATUS_EVENT,
  compare: (left, right) => String(right.recordDate ?? '').localeCompare(String(left.recordDate ?? '')) ||
    String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')),
});

export const getActivityRecordSyncContext = sync.getContext;
export const assertActivityRecordSyncContext = sync.assertContext;
export const getActivityRecordSyncStatus = sync.getStatus;
export const retryPendingActivityRecordSync = sync.retry;
export const ActivityRecordLocalSaveError = sync.LocalSaveError;
export type ActivityRecordLocalSaveError = InstanceType<typeof ActivityRecordLocalSaveError>;
export const ActivityRecordSyncConflictError = sync.SyncConflictError;
export const getActivityRecords = sync.list;
export const getActivityRecord = sync.get;
export const deleteActivityRecord = sync.remove;
export async function createActivityRecord(input: ActivityRecordInput): Promise<ActivityRecord> {
  return sync.create(normalizeInput(input));
}
export async function updateActivityRecord(id: string, input: ActivityRecordInput): Promise<ActivityRecord> {
  return sync.update(id, normalizeInput(input));
}
