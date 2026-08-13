import { createFarmProBackup, type FarmProBackup } from '../storage/backup';
import { parseFarmProBackupJson } from '../storage/backup-import';
import { restoreFarmProBackup } from '../storage/backup-restore';
import { downloadLatestCloudSnapshot, uploadCloudSnapshot } from './cloudClient';

export type SyncDirection = 'cloud-newer' | 'local-newer' | 'same' | 'cloud-empty';

export type DeviceSyncPreview = {
  direction: SyncDirection;
  localRecordCount: number