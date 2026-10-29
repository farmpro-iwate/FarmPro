import { FARM_PRO_STORE_NAMES, openFarmProDatabase } from './db';
import type { FarmProBackup } from './backup';
import type { StoredRecord } from './types';

/** Replace all stores as one IndexedDB transaction, or leave every store unchanged. */
export async function restoreFarmProBackup(backup: FarmProBackup): Promise<void> {
  // Validate the entire payload before opening a write transaction.
  for (const storeName of FARM_PRO_STORE_NAMES) {
    const records = backup.stores[storeName] as StoredRecord[] | undefined;
    if (!Array.isArray(records) || records.some((record) =>
      !record || (typeof record.id !== 'string' && typeof record.id !== 'number'))) {
      throw new Error(`${storeName} のバックアップデータが正しくありません。`);
    }
  }

  const database = await openFarmProDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(FARM_PRO_STORE_NAMES, 'readwrite');
    const fail = (message: string) => {
      transaction.abort();
      reject(new Error(message));
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('復元に失敗しました。既存データは保持されます。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('復元を中止しました。既存データは保持されます。'));

    const replaceStores = () => {
      try {
        for (const storeName of FARM_PRO_STORE_NAMES) {
          const store = transaction.objectStore(storeName);
          store.clear();
          const now = new Date().toISOString();
          for (const record of backup.stores[storeName] as StoredRecord[]) {
            store.put({
              ...record,
              createdAt: record.createdAt ?? now,
              updatedAt: record.updatedAt ?? now,
            });
          }
        }
      } catch {
        fail('復元処理に失敗しました。変更は取り消されます。');
      }
    };

    if (backup.schemaVersion === 3) {
      const request = transaction.objectStore('supplyInventory').count();
      request.onsuccess = () => {
        if (request.result > 0) {
          fail('現在の医薬品・受精卵在庫を消さないため、旧バックアップの復元を中止しました。');
          return;
        }
        replaceStores();
      };
      // A failed count automatically aborts the transaction.
    } else {
      replaceStores();
    }
  });
}
