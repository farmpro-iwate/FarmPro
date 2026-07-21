import { FARM_PRO_DB_VERSION, FARM_PRO_STORE_NAMES } from './db';
import { getAllRecords } from './repository';
import type { StoredRecord, StoreName } from './types';
import { getCurrentUser } from '../services/authClient';
export interface FarmProBackup {
  format: 'farmpro-backup';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
    farm?: {
    id: string;
    name: string;
  };
  stores: Record<StoreName, StoredRecord[]>;
}

export async function createFarmProBackup(
  appVersion: string,
): Promise<FarmProBackup> {
  const storeEntries = await Promise.all(
    FARM_PRO_STORE_NAMES.map(async (storeName) => {
      const records = await getAllRecords<StoredRecord>(storeName);
      return [storeName, records] as const;
    }),
  );
 
  const currentUser = getCurrentUser();

const metadataRecords =
  storeEntries.find(([storeName]) => storeName === 'metadata')?.[1] ?? [];
const farmSettingsRecord = metadataRecords.find(
  (record) =>
    typeof record.farmName === 'string' &&
    record.farmName.trim().length > 0,
);

const farmName =
  typeof farmSettingsRecord?.farmName === 'string'
    ? farmSettingsRecord.farmName.trim()
    : '';

const farm = farmName
  ? {
      id: currentUser?.farmId || 'local-farm',
      name: farmName,
    }
  : undefined;
  return {
    format: 'farmpro-backup',
    schemaVersion: FARM_PRO_DB_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    farm,
    stores: Object.fromEntries(storeEntries) as Record<
      StoreName,
      StoredRecord[]
    >,
  };
}

export function serializeFarmProBackup(backup: FarmProBackup): string {
  return JSON.stringify(backup, null, 2);
}

function createBackupFileName(exportedAt: string): string {
  const safeDate = exportedAt
    .replace(/:/g, '-')
    .replace(/\.\d{3}Z$/, 'Z');

  return `farmpro-backup-${safeDate}.json`;
}

export function downloadFarmProBackup(backup: FarmProBackup): void {
  const json = serializeFarmProBackup(backup);
  const blob = new Blob([json], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = createBackupFileName(backup.exportedAt);
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
