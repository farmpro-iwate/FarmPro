export type BlvTest = {
  id: number;
  syncRecordId?: string;
  cloudUpdatedAt?: string;
  cloudSyncPending?: boolean;
  blvSyncDeletePending?: boolean;
  blvSyncWarning?: string;
  blvSyncBlocked?: boolean;
  cowEarTag: string;
  cowName: string;
  testDate: string;
  result: string;
  nextTestDate: string;
  isolationMemo: string;
  note: string;
  createdAt?: string;
  updatedAt?: string;
};
export type BlvTestInput = { cowEarTag: string; cowName: string; testDate: string; result: string; nextTestDate: string; isolationMemo: string; note: string; };
