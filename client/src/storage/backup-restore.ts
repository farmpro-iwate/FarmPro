import { FARM_PRO_DB_VERSION, FARM_PRO_STORE_NAMES, openFarmProDatabase } from './db';
import type { FarmProBackup } from './backup';
import type { StoredRecord } from './types';

/**
 * Restore every store in ONE IndexedDB transaction.
 * A failed write rolls the entire restore back, rather than leaving a partly
 * restored cattle/expense inventory database.
 */
export async function restoreFarmProBackup(backup: FarmProBackup): Promise<void> {
  if (backup.schemaVersion !== 3 && backup.schemaVersion !== FARM_PRO_DB_VERSION) {
    throw new Error('このバックアップのデータ形式には対応していません。');
  }
  for (const name of FARM_PRO_STORE_NAMES) {
    const records = backup.stores?.[name];
    if (name === 'supplyInventory' && backup.schemaVersion === 3 && records === undefined) continue;
    if (!Array.isArray(records) || !records.every(
      (record: StoredRecord) => record && (typeof record.id === 'string' || typeof record.id === 'number'),
    )) {
      throw new Error(name + ' のバックアップデータが正しくありません。復元していません。');
    }
  }

  const db = await openFarmProDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FARM_PRO_STORE_NAMES, 'readwrite');
    let validationError: Error | undefined;
    const fail = (message: string) => {
      validationError = new Error(message);
      tx.abort();
    };

    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(validationError || tx.error || new Error('復元が失敗しました。変更は取り消されました。'));

    const replaceAll = () => {
      try {
        for (const name of FARM_PRO_STORE_NAMES) {
          const store = tx.objectStore(name);
          const records = (backup.stores[name] || []) as StoredRecord[];
          store.clear();
          for (const record of records) store.put(record);
        }
      } catch {
        fail('復元データの書き込みに失敗しました。既存データは変更されません。');
      }
    };

    // Legacy v3 backups do not contain the new medical/embryo inventory.
    // Never silently erase purchases made after a v3 backup was created.
    if (backup.schemaVersion === 3) {
      const count = tx.objectStore('supplyInventory').count();
      count.onsuccess = () => {
        if (count.result > 0) {
          fail('旧形式のバックアップには医薬品・受精卵在庫がありません。現在の在庫を消さないため、復元を中止しました。先に新しいバックアップを保存してください。');
        } else {
          replaceAll();
        }
      };
    } else {
      replaceAll();
    }
  });
}
