import { readJson, writeJson } from './jsonStore';

export type CloudSnapshot = {
  format: 'farmpro-backup';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  farm?: {
    id: string;
    name: string;
  };
  stores: Record<string, unknown[]>;
};

export type StoredCloudSnapshot = {
  savedAt: string;
  snapshot: CloudSnapshot;
};

function validateSnapshot(value: unknown): asserts value is CloudSnapshot {
  if (!value || typeof value !== 'object') throw new Error('INVALID_CLOUD_SNAPSHOT');
  const snapshot = value as Partial<CloudSnapshot>;
  if (snapshot.format !== 'farmpro-backup') throw new Error('INVALID_CLOUD_SNAPSHOT');
  if (typeof snapshot.schemaVersion !== 'number') throw new Error('INVALID_CLOUD_SNAPSHOT');
  if (typeof snapshot.appVersion !== 'string') throw new Error('INVALID_CLOUD_SNAPSHOT');
  if (typeof snapshot.exportedAt !== 'string') throw new Error('INVALID_CLOUD_SNAPSHOT');
  if (!snapshot.stores || typeof snapshot.stores !== 'object' || Array.isArray(snapshot.stores)) {
    throw new Error('INVALID_CLOUD_SNAPSHOT');
  }

  for (const records of Object.values(snapshot.stores)) {
    if (!Array.isArray(records)) throw new Error('INVALID_CLOUD_SNAPSHOT');
  }
}

export async function saveCloudSnapshot(snapshot: unknown): Promise<StoredCloudSnapshot> {
  validateSnapshot(snapshot);
  const stored: StoredCloudSnapshot = {
    savedAt: new Date().toISOString(),
    snapshot,
  };
  await writeJson('cloudSnapshot.json', stored);
  return stored;
}

export async function getCloudSnapshot(): Promise<StoredCloudSnapshot | null> {
  return readJson<StoredCloudSnapshot | null>('cloudSnapshot.json', null);
}
