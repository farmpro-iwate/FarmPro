import { createFeedingFatteningSync, type FeedingFatteningSyncContext, type FeedingFatteningSyncFields } from './feedingFatteningSync';

export type FatteningTransitionStatus = '肥育中' | '出荷準備' | '出荷済み';

export type FatteningTransitionRecord = FeedingFatteningSyncFields & {
  id: string;
  targetNumber: string;
  targetName: string;
  startDate: string;
  transitionReason: string;
  startWeight: string;
  targetWeight: string;
  targetShippingDate: string;
  housingLocation: string;
  withdrawalEndDate: string;
  status: FatteningTransitionStatus;
  memo: string;
  createdAt: string;
  updatedAt: string;
  fatteningTransitionSyncDeletePending?: boolean;
  fatteningTransitionSyncWarning?: string;
  fatteningTransitionSyncBlocked?: boolean;
};

export type FatteningTransitionInput = Pick<
  FatteningTransitionRecord,
  'targetNumber' | 'targetName' | 'startDate' | 'transitionReason' | 'startWeight' | 'targetWeight' |
  'targetShippingDate' | 'housingLocation' | 'withdrawalEndDate' | 'status' | 'memo'
>;

export const emptyFatteningTransitionInput: FatteningTransitionInput = {
  targetNumber: '',
  targetName: '',
  startDate: '',
  transitionReason: '繁殖終了',
  startWeight: '',
  targetWeight: '',
  targetShippingDate: '',
  housingLocation: '',
  withdrawalEndDate: '',
  status: '肥育中',
  memo: '',
};

const normalizedNumber = (value: unknown) => String(value ?? '').trim();
function rejectDuplicate(records: FatteningTransitionRecord[], input: FatteningTransitionInput, excludingId?: string): void {
  const target = normalizedNumber(input.targetNumber);
  if (!target) return;
  const existing = records.find(record => record.id !== excludingId && !(record as { deletedAt?: string }).deletedAt &&
    normalizedNumber(record.targetNumber) === target && record.status !== '出荷済み');
  if (existing) throw new Error(`${existing.targetName || input.targetName}（耳標${input.targetNumber}）は、すでに「${existing.status}」で登録されています。`);
}

export const FATTENING_TRANSITION_SYNC_STATUS_EVENT = 'farmpro:fattening-transition-sync-status';
const sync = createFeedingFatteningSync<FatteningTransitionRecord, FatteningTransitionInput>({
  source: 'fatteningTransitions', label: '肥育移行記録', classPrefix: 'FatteningTransition', event: FATTENING_TRANSITION_SYNC_STATUS_EVENT,
  compare: (left, right) => String(right.startDate ?? '').localeCompare(String(left.startDate ?? '')),
  readBeforeCreate: true,
  validateCreate: (records, input) => rejectDuplicate(records, input),
  validateUpdate: (records, current, input) => {
    if (input.status !== '出荷済み' && (current.status === '出荷済み' || normalizedNumber(current.targetNumber) !== normalizedNumber(input.targetNumber))) {
      rejectDuplicate(records, input, current.id);
    }
  },
});
export type FatteningTransitionSyncContext = FeedingFatteningSyncContext;
export const getFatteningTransitionSyncContext = sync.getContext;
export const assertFatteningTransitionSyncContext = sync.assertContext;
export const getFatteningTransitionSyncStatus = sync.getStatus;
export const retryPendingFatteningTransitionSync = sync.retry;
export const FatteningTransitionLocalSaveError = sync.LocalSaveError;
export type FatteningTransitionLocalSaveError = InstanceType<typeof FatteningTransitionLocalSaveError>;
export const FatteningTransitionSyncConflictError = sync.SyncConflictError;
export const getFatteningTransitions = sync.list;
export const getFatteningTransition = sync.get;

export async function getActiveFatteningTransition(
  targetNumber: string,
): Promise<FatteningTransitionRecord | undefined> {
  const normalizedTargetNumber = normalizedNumber(targetNumber);
  if (!normalizedTargetNumber) return undefined;

  const records = await getFatteningTransitions();
  return records.find(
    (record) =>
      normalizedNumber(record.targetNumber) === normalizedTargetNumber &&
      record.status !== '出荷済み',
  );
}

export const createFatteningTransition = sync.create;
export const updateFatteningTransition = sync.update;
export const deleteFatteningTransition = sync.remove;
