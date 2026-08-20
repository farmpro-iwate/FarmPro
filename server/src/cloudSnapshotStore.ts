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
  revision: number;
  snapshot: CloudSnapshot;
};

type LegacyStoredCloudSnapshot = Omit<StoredCloudSnapshot, 'revision'> & {
  revision?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDateString(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function safeFarmId(farmId: string) {
  const normalized = farmId.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) throw new Error('INVALID_FARM_ID');
  return normalized;
}

function snapshotFileName(farmId: string) {
  return `cloudSnapshot-${safeFarmId(farmId)}.json`;
}

function validateSnapshot(value: unknown): asserts value is CloudSnapshot {
  if (!isRecord(value)) throw new Error('INVALID_CLOUD_SNAPSHOT');
  const snapshot = value as Partial<CloudSnapshot>;

  if (snapshot.format !== 'farmpro-backup') throw new Error('INVALID_CLOUD_SNAPSHOT');
  if (typeof snapshot.schemaVersion !== 'number' || !Number.isInteger(snapshot.schemaVersion) || snapshot.schemaVersion < 1) throw new Error('INVALID_CLOUD_SNAPSHOT');
  if (typeof snapshot.appVersion !== 'string' || !snapshot.appVersion.trim()) throw new Error('INVALID_CLOUD_SNAPSHOT');
  if (typeof snapshot.exportedAt !== 'string' || !isValidDateString(snapshot.exportedAt)) throw new Error('INVALID_CLOUD_SNAPSHOT');

  if (snapshot.farm !== undefined) {
    if (!isRecord(snapshot.farm)) throw new Error('INVALID_CLOUD_SNAPSHOT');
    if (typeof snapshot.farm.id !== 'string' || typeof snapshot.farm.name !== 'string') throw new Error('INVALID_CLOUD_SNAPSHOT');
  }

  if (!snapshot.stores || typeof snapshot.stores !== 'object' || Array.isArray(snapshot.stores)) throw new Error('INVALID_CLOUD_SNAPSHOT');
  for (const records of Object.values(snapshot.stores)) {
    if (!Array.isArray(records)) throw new Error('INVALID_CLOUD_SNAPSHOT');
    for (const record of records) {
      if (!isRecord(record)) throw new Error('INVALID_CLOUD_SNAPSHOT');
      if (typeof record.id !== 'string' && typeof record.id !== 'number') throw new Error('INVALID_CLOUD_SNAPSHOT');
    }
  }
}

function normalizeStoredSnapshot(value: LegacyStoredCloudSnapshot | null): StoredCloudSnapshot | null {
  if (!value) return null;
  return {
    ...value,
    revision: Number.isInteger(value.revision) && Number(value.revision) > 0 ? Number(value.revision) : 1,
  };
}

function snapshotBelongsToFarm(stored: StoredCloudSnapshot, farmId: string) {
  return stored.snapshot.farm?.id === farmId;
}

async function readFarmSnapshot(farmId: string): Promise<StoredCloudSnapshot | null> {
  return normalizeStoredSnapshot(
    await readJson<LegacyStoredCloudSnapshot | null>(snapshotFileName(farmId), null),
  );
}

async function migrateMatchingLegacySnapshot(farmId: string): Promise<StoredCloudSnapshot | null> {
  const legacy = normalizeStoredSnapshot(
    await readJson<LegacyStoredCloudSnapshot | null>('cloudSnapshot.json', null),
  );
  if (!legacy || !snapshotBelongsToFarm(legacy, farmId)) return null;

  await writeJson(snapshotFileName(farmId), legacy);
  return legacy;
}

export async function saveCloudSnapshot(
  farmIdInput: string,
  snapshot: unknown,
  expectedRevision: number | null,
): Promise<StoredCloudSnapshot> {
  const farmId = safeFarmId(farmIdInput);
  validateSnapshot(snapshot);

  if (snapshot.farm?.id && snapshot.farm.id !== farmId) {
    throw new Error('CLOUD_SNAPSHOT_FARM_MISMATCH');
  }

  const current = await getCloudSnapshot(farmId);

  if (current) {
    if (expectedRevision === null || current.revision !== expectedRevision) throw new Error('CLOUD_SNAPSHOT_CONFLICT');
  } else if (expectedRevision !== null) {
    throw new Error('CLOUD_SNAPSHOT_CONFLICT');
  }

  const stored: StoredCloudSnapshot = {
    savedAt: new Date().toISOString(),
    revision: current ? current.revision + 1 : 1,
    snapshot: {
      ...snapshot,
      farm: {
        id: farmId,
        name: snapshot.farm?.name || '',
      },
    },
  };
  await writeJson(snapshotFileName(farmId), stored);
  return stored;
}

export async function getCloudSnapshot(farmIdInput: string): Promise<StoredCloudSnapshot | null> {
  const farmId = safeFarmId(farmIdInput);
  const stored = await readFarmSnapshot(farmId);
  if (stored) {
    if (!snapshotBelongsToFarm(stored, farmId)) throw new Error('CLOUD_SNAPSHOT_FARM_MISMATCH');
    return stored;
  }

  return migrateMatchingLegacySnapshot(farmId);
}
