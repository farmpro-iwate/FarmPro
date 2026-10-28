import { FARM_PRO_DB_VERSION, FARM_PRO_STORE_NAMES, openFarmProDatabase } from './db';
import type { StoredRecord, StoreName } from './types';

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

/**
 * Read all FarmPro stores in one read-only transaction. When a treatment or
 * embryo transfer is saved together with a stock movement, a backup must
 * capture either both sides before that write or both sides after it.
 */
async function readBackupSnapshot(): Promise<Record<StoreName, StoredRecord[]>> {
  const db = await openFarmProDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FARM_PRO_STORE_NAMES, 'readonly');
    const snapshot = {} as Record<StoreName, StoredRecord[]>;
    tx.oncomplete = () => resolve(snapshot);
    tx.onabort = () => reject(tx.error ?? new Error('バックアップの読み込みに失敗しました。'));

    for (const storeName of FARM_PRO_STORE_NAMES) {
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => {
        snapshot[storeName] = request.result as StoredRecord[];
      };
      // An IndexedDB request failure automatically aborts its transaction.
    }
  });
}

export async function createFarmProBackup(
  appVersion: string,
): Promise<FarmProBackup> {
  const stores = await readBackupSnapshot();
  const farmSettingsRecord = stores.metadata.find(
    (record) => typeof record.farmName === 'string' && record.farmName.trim().length > 0,
  );
  const farmName =
    typeof farmSettingsRecord?.farmName === 'string'
      ? farmSettingsRecord.farmName.trim()
      : '';
  const farm = farmName
    ? { id: 'local-farm', name: farmName }
    : undefined;

  return {
    format: 'farmpro-backup',
    schemaVersion: FARM_PRO_DB_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    farm,
    stores,
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
