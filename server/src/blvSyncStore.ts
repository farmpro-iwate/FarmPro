import { isDeepStrictEqual } from 'node:util';
import { dataPath, readJson, writeJson } from './jsonStore';
import type { BlvTest } from './blvStore';

export type SyncedBlvTestRecord = {
  id: string;
  cowEarTag?: string;
  cowName?: string;
  testDate?: string;
  result?: string;
  nextTestDate?: string;
  isolationMemo?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
  [key: string]: unknown;
};
export type BlvSyncConditions = { ifMatch?: string; ifNoneMatch?: string };
const fileName = 'blv-tests-sync.json';
const textFields = ['cowEarTag', 'cowName', 'testDate', 'result', 'nextTestDate', 'isolationMemo', 'note'] as const;
const queues = new Map<string, Promise<void>>();

// The complete read/check/write boundary is shared by GET, mutation and restore.
// dataPath contains both the runtime root and authenticated farm identity.
async function withBlvSyncLock<T>(action: () => Promise<T>): Promise<T> {
  const key = dataPath(fileName);
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  queues.set(key, tail);
  await previous;
  try { return await action(); }
  finally { release(); if (queues.get(key) === tail) queues.delete(key); }
}

async function readExistingRecords<T>(name: string): Promise<T[]> {
  try {
    const records = await readJson<T>(name);
    if (!Array.isArray(records)) throw new Error('INVALID_BLV_SYNC_STORE');
    return records;
  } catch (error) {
    // An empty GET must neither create an empty ledger nor migrate legacy BLV.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function withoutLocalSyncState(record: SyncedBlvTestRecord): SyncedBlvTestRecord {
  return Object.fromEntries(Object.entries(record).filter(([key]) =>
    key !== 'syncRecordId' && key !== 'syncWarning' &&
    !key.startsWith('cloudSync') && !key.startsWith('blvSync'),
  )) as SyncedBlvTestRecord;
}

function assertId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !id.trim()) throw new Error('INVALID_BLV_SYNC_ID');
}

function assertRecord(input: unknown): asserts input is SyncedBlvTestRecord {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_BLV_SYNC_INPUT');
  const record = input as SyncedBlvTestRecord;
  assertId(record.id);
  for (const field of textFields) {
    if (record[field] !== undefined && record[field] !== null && typeof record[field] !== 'string') {
      throw new Error('INVALID_BLV_SYNC_INPUT');
    }
  }
  for (const field of ['createdAt', 'updatedAt'] as const) {
    if (record[field] !== undefined && typeof record[field] !== 'string') throw new Error('INVALID_BLV_SYNC_INPUT');
  }
}

function validRevision(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && Number.isFinite(Date.parse(value));
}

function expectedRevision(conditions: BlvSyncConditions): string | undefined {
  if (conditions.ifMatch === undefined && conditions.ifNoneMatch === undefined) {
    throw new Error('BLV_SYNC_PRECONDITION_REQUIRED');
  }
  if (conditions.ifNoneMatch !== undefined) {
    if (conditions.ifMatch !== undefined || conditions.ifNoneMatch.trim() !== '*') {
      throw new Error('INVALID_BLV_SYNC_CONDITION');
    }
    return undefined;
  }
  const text = conditions.ifMatch!.trim();
  const expected = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
  if (!expected || expected === '*' || expected.includes('"') || expected.includes(',') || !validRevision(expected)) {
    throw new Error('INVALID_BLV_SYNC_CONDITION');
  }
  return expected;
}

function storedRevision(record?: SyncedBlvTestRecord): string | undefined {
  if (validRevision(record?.cloudUpdatedAt)) return record.cloudUpdatedAt;
  if (validRevision(record?.updatedAt)) return record.updatedAt;
  return undefined;
}

function nextCloudUpdatedAt(existing?: SyncedBlvTestRecord, restored?: SyncedBlvTestRecord): string {
  const prior = [storedRevision(existing), storedRevision(restored)].map(value => Date.parse(value || ''));
  return new Date(Math.max(Date.now(), ...prior.filter(Number.isFinite).map(value => value + 1))).toISOString();
}

function publicRecord(record: SyncedBlvTestRecord): SyncedBlvTestRecord {
  return { ...withoutLocalSyncState(record), cloudUpdatedAt: storedRevision(record) };
}

function normalizeRecord(input: SyncedBlvTestRecord, existing?: SyncedBlvTestRecord): SyncedBlvTestRecord {
  // Omitted business fields survive an older or incomplete sender. An explicit
  // null/empty value still clears that field; timestamps are never filled from
  // a device-independent read clock.
  const record = { ...(existing ? withoutLocalSyncState(existing) : {}), ...withoutLocalSyncState(input) };
  for (const field of textFields) record[field] ??= '';
  return { ...record, id: input.id, cloudUpdatedAt: nextCloudUpdatedAt(existing) };
}

function sameRecordContent(left: SyncedBlvTestRecord, right: SyncedBlvTestRecord): boolean {
  const content = (record: SyncedBlvTestRecord) => {
    const { cloudUpdatedAt: _revision, ...fields } = withoutLocalSyncState(record);
    for (const field of textFields) fields[field] ??= '';
    return fields;
  };
  return isDeepStrictEqual(content(left), content(right));
}

function assertConditions(existing: SyncedBlvTestRecord | undefined, expected: string | undefined, conditions: BlvSyncConditions): void {
  if (conditions.ifNoneMatch !== undefined && existing) throw new Error('BLV_SYNC_PRECONDITION_FAILED');
  if (expected !== undefined && (!existing || storedRevision(existing) !== expected)) {
    throw new Error('BLV_SYNC_PRECONDITION_FAILED');
  }
}

export async function listSyncedBlvTests(): Promise<SyncedBlvTestRecord[]> {
  return withBlvSyncLock(async () => (await readExistingRecords<SyncedBlvTestRecord>(fileName))
    .map(publicRecord).sort((a, b) => String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? ''))));
}

export async function findSyncedBlvTest(id: string): Promise<SyncedBlvTestRecord | undefined> {
  assertId(id);
  return withBlvSyncLock(async () => {
    const existing = (await readExistingRecords<SyncedBlvTestRecord>(fileName)).find(record => record.id === id);
    return existing ? publicRecord(existing) : undefined;
  });
}

export async function syncBlvTest(id: string, input: unknown, conditions: BlvSyncConditions = {}): Promise<SyncedBlvTestRecord> {
  assertId(id);
  assertRecord(input);
  if (input.id !== id || Object.prototype.hasOwnProperty.call(input, 'deletedAt')) throw new Error('INVALID_BLV_SYNC_INPUT');
  const expected = expectedRevision(conditions);
  return withBlvSyncLock(async () => {
    const records = await readExistingRecords<SyncedBlvTestRecord>(fileName);
    const index = records.findIndex(record => record.id === id);
    const existing = records[index];
    if (conditions.ifNoneMatch !== undefined && existing) throw new Error('BLV_SYNC_PRECONDITION_FAILED');
    if (existing?.deletedAt) throw new Error('BLV_RECORD_DELETED');
    const saved = normalizeRecord(input, existing);
    // A repeated If-Match may have lost its first response. Every unknown
    // field and both business timestamps must still match the persisted row.
    if (existing && sameRecordContent(saved, existing)) return publicRecord(existing);
    assertConditions(existing, expected, conditions);
    if (index >= 0) records[index] = saved;
    else records.push(saved);
    await writeJson(fileName, records);
    return saved;
  });
}

export async function deleteSyncedBlvTest(id: string, conditions: BlvSyncConditions = {}): Promise<SyncedBlvTestRecord> {
  assertId(id);
  const expected = expectedRevision(conditions);
  return withBlvSyncLock(async () => {
    const records = await readExistingRecords<SyncedBlvTestRecord>(fileName);
    const index = records.findIndex(record => record.id === id);
    const existing = records[index];
    if (conditions.ifNoneMatch !== undefined && existing) throw new Error('BLV_SYNC_PRECONDITION_FAILED');
    // The original DELETE response can be replayed without revising the tombstone.
    if (existing?.deletedAt) return publicRecord(existing);
    assertConditions(existing, expected, conditions);
    const deleted: SyncedBlvTestRecord = {
      ...withoutLocalSyncState(existing ?? { id }), id,
      deletedAt: new Date().toISOString(), cloudUpdatedAt: nextCloudUpdatedAt(existing),
    };
    if (index >= 0) records[index] = deleted;
    else records.push(deleted);
    await writeJson(fileName, records);
    return deleted;
  });
}

function legacySyncId(record: BlvTest & { syncRecordId?: unknown }): string {
  if (typeof record.syncRecordId === 'string' && record.syncRecordId.trim()) return record.syncRecordId;
  return typeof record.id === 'number' ? `blv:${record.id}` : String(record.id);
}

/** Read-only aggregate. An explicit sync identity shadows only that legacy ID;
 * a tombstone hides its legacy predecessor without copying or deleting it. */
export async function listLiveBlvTests(): Promise<Array<BlvTest | SyncedBlvTestRecord>> {
  return withBlvSyncLock(async () => {
    const legacy = await readExistingRecords<BlvTest & { deletedAt?: string }>('blvTests.json');
    const synced = await readExistingRecords<SyncedBlvTestRecord>(fileName);
    const syncedIds = new Set(synced.map(record => record.id));
    return [
      ...legacy.filter(record => !record.deletedAt && !syncedIds.has(legacySyncId(record))),
      ...synced.filter(record => !record.deletedAt).map(publicRecord),
    ];
  });
}

export function validateBlvSyncBackupRecords(records: unknown): asserts records is SyncedBlvTestRecord[] {
  if (!Array.isArray(records)) throw new Error('INVALID_BLV_SYNC_BACKUP');
  const ids = new Set<string>();
  for (const record of records) {
    assertRecord(record);
    if (ids.has(record.id) || (record.deletedAt !== undefined && !validRevision(record.deletedAt)) ||
        (record.cloudUpdatedAt !== undefined && !validRevision(record.cloudUpdatedAt))) {
      throw new Error('INVALID_BLV_SYNC_BACKUP');
    }
    ids.add(record.id);
  }
}

/** Only the explicit optional sync section is restored. Older backup files
 * leave this ledger untouched, and no backup may revive an existing tombstone. */
export async function replaceSyncedBlvTestsFromBackup(records: SyncedBlvTestRecord[]): Promise<void> {
  validateBlvSyncBackupRecords(records);
  return withBlvSyncLock(async () => {
    const existing = await readExistingRecords<SyncedBlvTestRecord>(fileName);
    const existingById = new Map(existing.map(record => [record.id, record]));
    const incomingIds = new Set(records.map(record => record.id));
    const restored = records.map(record => {
      const current = existingById.get(record.id);
      if (current?.deletedAt) return current;
      return { ...withoutLocalSyncState(record), cloudUpdatedAt: nextCloudUpdatedAt(current, record) };
    });
    for (const record of existing) {
      if (incomingIds.has(record.id)) continue;
      restored.push(record.deletedAt ? record : {
        ...record, deletedAt: new Date().toISOString(), cloudUpdatedAt: nextCloudUpdatedAt(record),
      });
    }
    await writeJson(fileName, restored);
  });
}
