import { FARM_PRO_STORE_NAMES, openFarmProDatabase } from './db';
import type { FarmProBackup } from './backup';
import type { StoredRecord } from './types';
import { assertRecoveryIdentity, recoveryBackupContent, validateRecoveryBackup, type RecoveryIdentity } from './sync-recovery';

export type RestoreBackupPrecondition = {
  expectedFarmId: string;
  expectedUserId: string;
  expectedLocalBackup: FarmProBackup;
  recoveryPermit?: RecoveryIdentity;
};

/** Replace all stores as one IndexedDB transaction, or leave every store unchanged. */
export async function restoreFarmProBackup(backup: FarmProBackup, precondition?: RestoreBackupPrecondition): Promise<void> {
  // Validate the entire payload before opening a write transaction.
  for (const storeName of FARM_PRO_STORE_NAMES) {
    const records = backup.stores[storeName] as StoredRecord[] | undefined;
    if (!Array.isArray(records) || records.some((record) =>
      !record || (typeof record.id !== 'string' && typeof record.id !== 'number'))) {
      throw new Error(`${storeName} のバックアップデータが正しくありません。`);
    }
  }

  const identity = precondition ? { farmId: precondition.expectedFarmId, userId: precondition.expectedUserId } : null;
  if (identity && precondition) {
    assertRecoveryIdentity(identity);
    if (precondition.recoveryPermit && (precondition.recoveryPermit.farmId !== identity.farmId || precondition.recoveryPermit.userId !== identity.userId)) {
      throw new Error('復旧の農場または利用者を確認できません。');
    }
    validateRecoveryBackup(backup, identity);
    validateRecoveryBackup(precondition.expectedLocalBackup, identity, { allowUndefined: true, allowMissingTimestamps: true });
  }
  const database = await openFarmProDatabase(precondition?.recoveryPermit);
  if (identity) assertRecoveryIdentity(identity);
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(FARM_PRO_STORE_NAMES, 'readwrite');
    const fail = (message: string) => {
      transaction.abort();
      reject(new Error(message));
    };
    transaction.oncomplete = () => {
      try { if (identity) assertRecoveryIdentity(identity); resolve(); } catch (error) { reject(error); }
    };
    transaction.onerror = () => reject(transaction.error ?? new Error('復元に失敗しました。既存データは保持されます。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('復元を中止しました。既存データは保持されます。'));

    const replaceStores = () => {
      try {
        if (identity) assertRecoveryIdentity(identity);
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

    if (precondition) {
      // Read and compare inside the same transaction that performs replacement.
      // A write queued between preview/capture and this transaction must abort it.
      const currentStores = {} as FarmProBackup['stores'];
      let remaining = FARM_PRO_STORE_NAMES.length;
      for (const name of FARM_PRO_STORE_NAMES) {
        const request = transaction.objectStore(name).getAll();
        request.onsuccess = () => {
          currentStores[name] = request.result as StoredRecord[];
          remaining -= 1;
          if (remaining > 0) return;
          const current = { ...precondition.expectedLocalBackup, stores: currentStores };
          if (recoveryBackupContent(current) !== recoveryBackupContent(precondition.expectedLocalBackup)) {
            fail('確認後にこの端末の記録が変わりました。変更を保護するため復旧を中止しました。');
            return;
          }
          replaceStores();
        };
      }
    } else if (backup.schemaVersion === 3) {
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
