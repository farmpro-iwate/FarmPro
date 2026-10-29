import { FARM_PRO_STORE_NAMES } from './db';
import type { FarmProBackup } from './backup';
import { getAllRecords, replaceAllRecords } from './repository';
import type { StoredRecord } from './types';

export async function restoreFarmProBackup(
  backup: FarmProBackup,
): Promise<void> {
  if (backup.schemaVersion === 3) {
    const existingInventory = await getAllRecords('supplyInventory');
    if (existingInventory.length > 0) {
      throw new Error('現在の医薬品・受精卵在庫を消さないため、旧バックアップの復元を中止しました。');
    }
  }
  for (const storeName of FARM_PRO_STORE_NAMES) {
    const records = backup.stores[storeName] as StoredRecord[];

    await replaceAllRecords(storeName, records);
  }
}
