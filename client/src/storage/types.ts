export type StoreName =
  | 'settings'
  | 'masters'
  | 'cattle'
  | 'calves'
  | 'breedings'
  | 'calvings'
  | 'treatments'
  | 'vaccines'
  | 'schedules'
  | 'feedings'
  | 'feedingGuide'
  | 'feedingAlertActions'
  | 'feedInventory'
  | 'sales'
  | 'expenses'
  | 'photos'
  | 'metadata';

export interface StoredRecord {
  id: string | number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface StorageMetadata extends StoredRecord {
  id: 'database';
  schemaVersion: number;
  appVersion: string;
  initializedAt: string;
}
