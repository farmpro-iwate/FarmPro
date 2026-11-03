import fs from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { dataPath, writeJson } from './jsonStore';
import { currentFarmId } from './farmContext';
import { withdrawalCompletions } from './accountLifecycle';

export type ManagementSyncResource = 'feedingAlertActions' | 'fatteningTransitions' | 'activityRecords';
export type ManagementSyncRecord = {
  id: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  cloudUpdatedAt?: string;
  deletedAt?: string;
  [key: string]: unknown;
};
export type ManagementSyncConditions = { ifMatch?: string; ifNoneMatch?: string };
const configuration = {
  feedingAlertActions: {
    fileName: 'feeding-alert-actions-sync.json', metadataPrefix: 'feedingAlertActionSync',
    textFields: ['actionDate', 'calfId', 'calfName', 'ageDays', 'alertType', 'actionType', 'memo', 'nextCheckDate', 'status'],
  },
  fatteningTransitions: {
    fileName: 'fattening-transitions-sync.json', metadataPrefix: 'fatteningTransitionSync',
    textFields: ['targetNumber', 'targetName', 'startDate', 'transitionReason', 'startWeight', 'targetWeight',
      'targetShippingDate', 'housingLocation', 'withdrawalEndDate', 'status', 'memo'],
  },
  activityRecords: {
    fileName: 'activity-records-sync.json', metadataPrefix: 'activityRecordSync',
    textFields: ['activityType', 'recordDate', 'title', 'note', 'animalKind', 'animalId', 'animalSyncId',
      'animalIdentificationNumber', 'animalEarTag', 'animalName', 'animalBirthday'],
  },
} as const;
const activityAnimalFields = ['animalKind', 'animalId', 'animalSyncId', 'animalIdentificationNumber',
  'animalEarTag', 'animalName', 'animalBirthday'] as const;
const queues = new Map<string, Promise<void>>();

async function withSyncLock<T>(resource: ManagementSyncResource, action: () => Promise<T>): Promise<T> {
  const key = dataPath(configuration[resource].fileName);
  const previous = queues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  queues.set(key, tail);
  await previous;
  try { return await action(); }
  finally { release(); if (queues.get(key) === tail) queues.delete(key); }
}

async function readFarmOnlyRecords(fileName: string): Promise<ManagementSyncRecord[]> {
  const farmId = currentFarmId() || 'farm-demo';
  if ((await withdrawalCompletions()).some(row => row.farmId === farmId)) throw new Error('FARM_WITHDRAWN');
  try {
    // readJson's demo-farm fallback may copy cwd/src/data. These resources must
    // never adopt a global legacy file during a read or create an empty ledger.
    const records = JSON.parse(await fs.readFile(dataPath(fileName), 'utf8')) as unknown;
    if (!Array.isArray(records) || records.some(record => !record || typeof record !== 'object' || Array.isArray(record))) {
      throw new Error('INVALID_MANAGEMENT_SYNC_STORE');
    }
    return records as ManagementSyncRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function withoutLocalState(resource: ManagementSyncResource, record: ManagementSyncRecord): ManagementSyncRecord {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'syncRecordId' && key !== 'syncWarning' &&
    !key.startsWith('cloudSync') && !key.startsWith(configuration[resource].metadataPrefix))) as ManagementSyncRecord;
}

function assertId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !id.trim()) throw new Error('INVALID_MANAGEMENT_SYNC_ID');
}
function assertRecord(resource: ManagementSyncResource, value: unknown): asserts value is ManagementSyncRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_MANAGEMENT_SYNC_INPUT');
  const record = value as ManagementSyncRecord;
  assertId(record.id);
  for (const key of [...configuration[resource].textFields, 'createdAt', 'updatedAt']) {
    if (record[key] !== undefined && record[key] !== null && typeof record[key] !== 'string') {
      throw new Error('INVALID_MANAGEMENT_SYNC_INPUT');
    }
  }
}
function assertActivityRecord(record: ManagementSyncRecord): void {
  if (record.deletedAt) return;
  const date = typeof record.recordDate === 'string' ? record.recordDate : '';
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!['farm', 'animal'].includes(String(record.activityType)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ||
      typeof record.title !== 'string' || !record.title.trim()) throw new Error('INVALID_MANAGEMENT_SYNC_INPUT');
  if (record.activityType === 'animal') {
    if (!['cattle', 'calf'].includes(String(record.animalKind)) ||
        !['animalId', 'animalSyncId', 'animalIdentificationNumber', 'animalEarTag'].some(key =>
          typeof record[key] === 'string' && Boolean(record[key].trim()))) throw new Error('INVALID_MANAGEMENT_SYNC_INPUT');
  } else if (activityAnimalFields.some(key => record[key] !== undefined && record[key] !== '')) {
    throw new Error('INVALID_MANAGEMENT_SYNC_INPUT');
  }
}
function validRevision(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && Number.isFinite(Date.parse(value));
}
function storedRevision(record?: ManagementSyncRecord): string | undefined {
  if (validRevision(record?.cloudUpdatedAt)) return record.cloudUpdatedAt;
  if (validRevision(record?.updatedAt)) return record.updatedAt;
  return undefined;
}
function nextRevision(...records: Array<ManagementSyncRecord | undefined>): string {
  const previous = records.map(record => Date.parse(storedRevision(record) || '')).filter(Number.isFinite);
  return new Date(Math.max(Date.now(), ...previous.map(value => value + 1))).toISOString();
}
function publicRecord(resource: ManagementSyncResource, record: ManagementSyncRecord): ManagementSyncRecord {
  return { ...withoutLocalState(resource, record), cloudUpdatedAt: storedRevision(record) };
}
function normalize(resource: ManagementSyncResource, input: ManagementSyncRecord, existing?: ManagementSyncRecord): ManagementSyncRecord {
  const saved = { ...(existing ? withoutLocalState(resource, existing) : {}), ...withoutLocalState(resource, input) };
  for (const key of configuration[resource].textFields) if (saved[key] === undefined) saved[key] = '';
  if (resource === 'activityRecords' && saved.activityType === 'farm') {
    for (const key of activityAnimalFields) saved[key] = '';
  }
  return { ...saved, id: input.id, cloudUpdatedAt: nextRevision(existing) };
}
function sameContent(resource: ManagementSyncResource, left: ManagementSyncRecord, right: ManagementSyncRecord): boolean {
  const content = (record: ManagementSyncRecord) => {
    const { cloudUpdatedAt: _revision, ...fields } = withoutLocalState(resource, record);
    for (const key of configuration[resource].textFields) if (fields[key] === undefined) fields[key] = '';
    return fields;
  };
  return isDeepStrictEqual(content(left), content(right));
}
function expectedRevision(conditions: ManagementSyncConditions): string | undefined {
  if (conditions.ifMatch === undefined && conditions.ifNoneMatch === undefined) throw new Error('MANAGEMENT_SYNC_PRECONDITION_REQUIRED');
  if (conditions.ifNoneMatch !== undefined) {
    if (conditions.ifMatch !== undefined || conditions.ifNoneMatch.trim() !== '*') throw new Error('INVALID_MANAGEMENT_SYNC_CONDITION');
    return undefined;
  }
  const text = conditions.ifMatch!.trim();
  const expected = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
  if (!expected || expected === '*' || expected.includes('"') || expected.includes(',') || !validRevision(expected)) {
    throw new Error('INVALID_MANAGEMENT_SYNC_CONDITION');
  }
  return expected;
}
function assertConditions(existing: ManagementSyncRecord | undefined, expected: string | undefined, conditions: ManagementSyncConditions): void {
  if (conditions.ifNoneMatch !== undefined && existing) throw new Error('MANAGEMENT_SYNC_PRECONDITION_FAILED');
  if (expected !== undefined && (!existing || storedRevision(existing) !== expected)) throw new Error('MANAGEMENT_SYNC_PRECONDITION_FAILED');
}

function activeEarTag(record?: ManagementSyncRecord): string {
  if (!record || record.deletedAt || record.status === '出荷済み') return '';
  return typeof record.targetNumber === 'string' ? record.targetNumber.trim() : '';
}
function assertFatteningUniqueness(records: ManagementSyncRecord[], saved: ManagementSyncRecord, existing?: ManagementSyncRecord): void {
  const earTag = typeof saved.targetNumber === 'string' ? saved.targetNumber.trim() : '';
  if (!earTag) return;
  // Preserve an already-active history entry's memo/status edits. Only a new
  // ID or newly active identity can increase the existing overlap.
  if (existing && (!activeEarTag(saved) || activeEarTag(existing) === activeEarTag(saved))) return;
  if (records.some(record => record.id !== saved.id && activeEarTag(record) === earTag)) {
    throw new Error('FATTENING_ACTIVE_DUPLICATE');
  }
}

export async function listSyncedManagementRecords(resource: ManagementSyncResource): Promise<ManagementSyncRecord[]> {
  return withSyncLock(resource, async () => (await readFarmOnlyRecords(configuration[resource].fileName))
    .map(record => publicRecord(resource, record))
    .sort((a, b) => String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? ''))));
}
export async function findSyncedManagementRecord(resource: ManagementSyncResource, id: string): Promise<ManagementSyncRecord | undefined> {
  assertId(id);
  return withSyncLock(resource, async () => {
    const record = (await readFarmOnlyRecords(configuration[resource].fileName)).find(row => row.id === id);
    return record ? publicRecord(resource, record) : undefined;
  });
}
export async function syncManagementRecord(
  resource: ManagementSyncResource, id: string, input: unknown, conditions: ManagementSyncConditions = {},
): Promise<ManagementSyncRecord> {
  assertId(id); assertRecord(resource, input);
  if (input.id !== id || Object.prototype.hasOwnProperty.call(input, 'deletedAt')) throw new Error('INVALID_MANAGEMENT_SYNC_INPUT');
  const expected = expectedRevision(conditions);
  return withSyncLock(resource, async () => {
    const records = await readFarmOnlyRecords(configuration[resource].fileName);
    const index = records.findIndex(record => record.id === id);
    const existing = records[index];
    if (conditions.ifNoneMatch !== undefined && existing) throw new Error('MANAGEMENT_SYNC_PRECONDITION_FAILED');
    if (existing?.deletedAt) throw new Error('MANAGEMENT_RECORD_DELETED');
    const saved = normalize(resource, input, existing);
    if (resource === 'activityRecords') assertActivityRecord(saved);
    if (existing && sameContent(resource, saved, existing)) return publicRecord(resource, existing);
    assertConditions(existing, expected, conditions);
    if (resource === 'fatteningTransitions') assertFatteningUniqueness(records, saved, existing);
    if (index >= 0) records[index] = saved; else records.push(saved);
    await writeJson(configuration[resource].fileName, records);
    return saved;
  });
}
export async function deleteSyncedManagementRecord(
  resource: ManagementSyncResource, id: string, conditions: ManagementSyncConditions = {},
): Promise<ManagementSyncRecord> {
  assertId(id);
  const expected = expectedRevision(conditions);
  return withSyncLock(resource, async () => {
    const records = await readFarmOnlyRecords(configuration[resource].fileName);
    const index = records.findIndex(record => record.id === id);
    const existing = records[index];
    if (conditions.ifNoneMatch !== undefined && existing) throw new Error('MANAGEMENT_SYNC_PRECONDITION_FAILED');
    if (existing?.deletedAt) return publicRecord(resource, existing);
    assertConditions(existing, expected, conditions);
    const deleted = { ...withoutLocalState(resource, existing ?? { id }), id,
      deletedAt: new Date().toISOString(), cloudUpdatedAt: nextRevision(existing) };
    if (index >= 0) records[index] = deleted; else records.push(deleted);
    await writeJson(configuration[resource].fileName, records);
    return deleted;
  });
}

export function readFarmFeedingAlertActions(): Promise<ManagementSyncRecord[]> {
  return readFarmOnlyRecords('feedingAlertActions.json');
}
/** Reports may merge only an existing farm-specific legacy ledger. The legacy
 * global API remains separate; explicit ID, never calf identity, determines overlap. */
export async function listLiveFeedingAlertActions(): Promise<ManagementSyncRecord[]> {
  return withSyncLock('feedingAlertActions', async () => {
    const legacy = await readFarmFeedingAlertActions();
    const synced = await readFarmOnlyRecords(configuration.feedingAlertActions.fileName);
    const ids = new Set(synced.map(record => record.id));
    return [...legacy.filter(record => !record.deletedAt && !ids.has(String(record.syncRecordId || record.id))),
      ...synced.filter(record => !record.deletedAt).map(record => publicRecord('feedingAlertActions', record))];
  });
}

export function validateManagementSyncBackupRecords(resource: ManagementSyncResource, records: unknown): asserts records is ManagementSyncRecord[] {
  if (!Array.isArray(records)) throw new Error('INVALID_MANAGEMENT_SYNC_BACKUP');
  const ids = new Set<string>();
  for (const record of records) {
    assertRecord(resource, record);
    if (resource === 'activityRecords') assertActivityRecord(record);
    if (ids.has(record.id) || (record.deletedAt !== undefined && !validRevision(record.deletedAt)) ||
        (record.cloudUpdatedAt !== undefined && !validRevision(record.cloudUpdatedAt))) throw new Error('INVALID_MANAGEMENT_SYNC_BACKUP');
    ids.add(record.id);
  }
}
export async function replaceManagementSyncRecordsFromBackup(resource: ManagementSyncResource, records: ManagementSyncRecord[]): Promise<void> {
  validateManagementSyncBackupRecords(resource, records);
  return withSyncLock(resource, async () => {
    const existing = await readFarmOnlyRecords(configuration[resource].fileName);
    const byId = new Map(existing.map(record => [record.id, record]));
    const incomingIds = new Set(records.map(record => record.id));
    const restored = records.map(record => {
      const current = byId.get(record.id);
      if (current?.deletedAt) return current;
      return { ...withoutLocalState(resource, record), cloudUpdatedAt: nextRevision(current, record) };
    });
    for (const record of existing) {
      if (incomingIds.has(record.id)) continue;
      restored.push(record.deletedAt ? record : { ...record, deletedAt: new Date().toISOString(), cloudUpdatedAt: nextRevision(record) });
    }
    await writeJson(configuration[resource].fileName, restored);
  });
}
