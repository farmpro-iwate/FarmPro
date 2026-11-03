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
            const restored = { ...record };
            // A restored row is not a new formal save by this browser, even
            // when the backup came from this same browser and farm.
            if (storeName === 'treatments') delete restored.treatmentSyncOrigin;
            if (storeName === 'breedings') delete restored.breedingSyncOrigin;
            if (storeName === 'blvTests') delete restored.blvSyncOrigin;
            if (storeName === 'feedingAlertActions') delete restored.feedingAlertActionSyncOrigin;
            if (storeName === 'fatteningTransitions') delete restored.fatteningTransitionSyncOrigin;
            if (storeName === 'activityRecords') delete restored.activityRecordSyncOrigin;
            store.put({
              ...restored,
              createdAt: record.createdAt ?? now,
              updatedAt: record.updatedAt ?? now,
            });
          }
        }
      } catch {
        fail('復元処理に失敗しました。変更は取り消されます。');
      }
    };

    const checkInventoryThenReplace = () => {
      if (backup.schemaVersion !== 3) { replaceStores(); return; }
      const request = transaction.objectStore('supplyInventory').count();
      request.onsuccess = () => {
        if (request.result > 0) {
          fail('現在の医薬品・受精卵在庫を消さないため、旧バックアップの復元を中止しました。');
          return;
        }
        replaceStores();
      };
      // A failed count automatically aborts the transaction.
    };
    if (backup.schemaVersion < 5) {
      // Older backups cannot represent these records. Never clear new work
      // while restoring a previously supported backup or cloud snapshot.
      const request = transaction.objectStore('activityRecords').count();
      request.onsuccess = () => {
        if (request.result > 0) {
          fail('現在の農場作業・個体の記録を消さないため、旧バックアップの復元を中止しました。');
          return;
        }
        checkInventoryThenReplace();
      };
    } else {
      checkInventoryThenReplace();
    }
  });
}
