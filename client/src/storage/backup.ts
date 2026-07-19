import { FARM_PRO_DB_VERSION, FARM_PRO_STORE_NAMES } from './db';
import { getAllRecords } from './repository';
import type { StoredRecord, StoreName } from './types';

export interface FarmProBackup {
  format: 'farmpro-backup';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
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

  return {
    format: 'farmpro-backup',
    schemaVersion: FARM_PRO_DB_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    stores: Object.fromEntries(storeEntries) as Record<
      StoreName,
      StoredRecord[]
    >,
  };
}

export function serializeFarmProBackup(backup: FarmProBackup): string {
  return JSON.stringify(backup, null, 2);
}
