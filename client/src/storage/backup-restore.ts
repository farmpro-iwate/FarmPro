import { FARM_PRO_STORE_NAMES } from './db';
import type { FarmProBackup } from './backup';
import { replaceAllRecords } from './repository';
import type { StoredRecord } from './types';

export async function restoreFarmProBackup(
  backup: FarmProBackup,
): Promise<void> {
  for (const storeName of FARM_PRO_STORE_NAMES) {
    const records = backup.stores[storeName] as StoredRecord[];

    await replaceAllRecords(storeName, records);
  }
}
