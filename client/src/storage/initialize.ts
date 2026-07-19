import { FARM_PRO_DB_VERSION, openFarmProDatabase } from './db';
import { getRecordById, saveRecord } from './repository';
import type { StorageMetadata } from './types';

const DATABASE_METADATA_ID = 'database';

export async function initializeFarmProStorage(
  appVersion: string,
): Promise<StorageMetadata> {
  await openFarmProDatabase();

  const existingMetadata = await getRecordById<StorageMetadata>(
    'metadata',
    DATABASE_METADATA_ID,
  );

  if (existingMetadata) {
    return existingMetadata;
  }

  const initializedAt = new Date().toISOString();

  return saveRecord<StorageMetadata>('metadata', {
    id: DATABASE_METADATA_ID,
    schemaVersion: FARM_PRO_DB_VERSION,
    appVersion,
    initializedAt,
  });
}
