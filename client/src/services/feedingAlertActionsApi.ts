import { createFeedingFatteningSync, type FeedingFatteningSyncContext, type FeedingFatteningSyncFields } from './feedingFatteningSync';

export type FeedingAlertAction = FeedingFatteningSyncFields & {
  id: string;
  actionDate: string;
  calfId: string;
  calfName: string;
  ageDays: string;
  alertType: string;
  actionType: string;
  memo: string;
  nextCheckDate: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  feedingAlertActionSyncDeletePending?: boolean;
  feedingAlertActionSyncWarning?: string;
  feedingAlertActionSyncBlocked?: boolean;
};

export type FeedingAlertActionInput = Pick<
  FeedingAlertAction,
  'actionDate' | 'calfId' | 'calfName' | 'ageDays' | 'alertType' | 'actionType' | 'memo' | 'nextCheckDate' | 'status'
>;

export const FEEDING_ALERT_ACTION_SYNC_STATUS_EVENT = 'farmpro:feeding-alert-action-sync-status';
const sync = createFeedingFatteningSync<FeedingAlertAction, FeedingAlertActionInput>({
  source: 'feedingAlertActions', label: '給与アラート対応記録', classPrefix: 'FeedingAlertAction', event: FEEDING_ALERT_ACTION_SYNC_STATUS_EVENT,
});
export type FeedingAlertActionSyncContext = FeedingFatteningSyncContext;
export const getFeedingAlertActionSyncContext = sync.getContext;
export const assertFeedingAlertActionSyncContext = sync.assertContext;
export const getFeedingAlertActionSyncStatus = sync.getStatus;
export const retryPendingFeedingAlertActionSync = sync.retry;
export const FeedingAlertActionLocalSaveError = sync.LocalSaveError;
export type FeedingAlertActionLocalSaveError = InstanceType<typeof FeedingAlertActionLocalSaveError>;
export const FeedingAlertActionSyncConflictError = sync.SyncConflictError;
export const fetchFeedingAlertActions = sync.list;
export const fetchFeedingAlertAction = sync.get;
export const createFeedingAlertAction = sync.create;
export const updateFeedingAlertAction = sync.update;
export const deleteFeedingAlertAction = sync.remove;
