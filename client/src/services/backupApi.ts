import { createFarmProBackup, downloadFarmProBackup } from '../storage/backup';
import { parseFarmProBackupJson } from '../storage/backup-import';
import { restoreFarmProBackup } from '../storage/backup-restore';

export async function downloadBackup() {
  const backup = await createFarmProBackup(__APP_VERSION__);
  downloadFarmProBackup(backup);
}

export async function importBackupJson(backup: unknown) {
  const parsed = parseFarmProBackupJson(JSON.stringify(backup));

  await restoreFarmProBackup(parsed);

  return {
    counts: Object.fromEntries(
      Object.entries(parsed.stores).map(([storeName, records]) => [
        storeName,
        records.length,
      ]),
    ),
  };
}

