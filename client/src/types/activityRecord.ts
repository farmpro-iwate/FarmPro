import type { StoredRecord } from '../storage/types';

export type ActivityRecordInput = {
  activityType: 'farm' | 'animal';
  recordDate: string;
  title: string;
  note: string;
  animalKind: '' | 'cattle' | 'calf';
  animalId: string;
  animalSyncId: string;
  animalIdentificationNumber: string;
  animalEarTag: string;
  animalName: string;
  animalBirthday: string;
};

export type ActivityRecord = ActivityRecordInput & StoredRecord & {
  id: string;
  createdAt: string;
  updatedAt: string;
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  deletedAt?: string;
  activityRecordSyncDeletePending?: boolean;
  activityRecordSyncWarning?: string;
  activityRecordSyncBlocked?: boolean;
};
