import { readJson, writeJson } from './jsonStore';
import { currentFarmId } from './farmContext';
import { isDeepStrictEqual } from 'node:util';
import type { AnimalLifecycle } from './animalLifecycle';

export type SyncedCattleRecord = {
  lifecycle?: AnimalLifecycle;
  id: string;
  legacyId?: number;
  earTag: string;
  identificationNumber?: string;
  name: string;
  birthday: string;
  sex?: '雌' | '雄' | '去勢';
  sire?: string;
  dam?: string;
  parity?: number;
  blvStatus?: string;
  stage?: '育成牛' | '繁殖牛';
  sourceCalfId?: number;
  acquisitionMethod?: 'purchased-calf' | 'purchased-pregnant' | 'retained';
  acquisitionDate?: string;
  acquisitionPrice?: number;
  acquisitionCost?: number;
  note?: string;
  registrationNumber?: string;
  sourceReferenceNumber?: string;
  maternalSire?: string;
  maternalGrandSire?: string;
  importedOffspringHistory?: Array<{
    parity: string;
    name: string;
    birthday: string;
    sex?: '' | '雌' | '雄' | '去勢';
    sire: string;
    calvingIntervalDays?: string;
    salePrice?: string;
  }>;
  importSourceFileName?: string;
  importSourceType?: 'ai-document';
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

const fileName = 'cattle-record-sync.json';
export type CattleRecordSyncConditions = { ifMatch?: string; ifNoneMatch?: string };
const queues = new Map<string, Promise<void>>();
async function withFarmSyncLock<T>(action: () => Promise<T>): Promise<T> {
  const farmId = currentFarmId() || 'farm-demo';
  const prior = queues.get(farmId) || Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = prior.then(() => gate);
  queues.set(farmId, tail);
  await prior;
  try { return await action(); }
  finally { release(); if (queues.get(farmId) === tail) queues.delete(farmId); }
}

function withoutLocalSyncState(record: SyncedCattleRecord): SyncedCattleRecord {
  return Object.fromEntries(Object.entries(record).filter(([key]) =>
    key !== 'cloudSyncPending' && key !== 'syncWarning' && !key.startsWith('animalSync'),
  )) as SyncedCattleRecord;
}

function expectedRevision(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const text = value.trim();
  const revision = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
  if (!revision || revision === '*' || revision.includes('"') || revision.includes(',')) {
    throw new Error('INVALID_CATTLE_RECORD_CONDITION');
  }
  return revision;
}

function nextCloudUpdatedAt(existing?: SyncedCattleRecord): string {
  const previous = Date.parse(existing?.cloudUpdatedAt || '');
  return new Date(Number.isFinite(previous) ? Math.max(Date.now(), previous + 1) : Date.now()).toISOString();
}

function sameRecordContent(left: SyncedCattleRecord, right: SyncedCattleRecord): boolean {
  const content = (record: SyncedCattleRecord) => {
    const { cloudUpdatedAt: _revision, ...fields } = withoutLocalSyncState(record);
    return JSON.parse(JSON.stringify(fields));
  };
  return isDeepStrictEqual(content(left), content(right));
}

function normalizeRecord(
  input: SyncedCattleRecord,
  existing?: SyncedCattleRecord,
): SyncedCattleRecord {
  input = withoutLocalSyncState(input);
  existing = existing ? withoutLocalSyncState(existing) : undefined;
  const now = new Date().toISOString();

  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    legacyId: input.legacyId ?? existing?.legacyId,
    earTag: String(input.earTag ?? existing?.earTag ?? '').trim(),
    identificationNumber: String(
      input.identificationNumber ?? existing?.identificationNumber ?? '',
    ).trim(),
    name: input.name ?? existing?.name ?? '',
    birthday: input.birthday ?? existing?.birthday ?? '',
    sex: input.sex ?? existing?.sex ?? '雌',
    sire: input.sire ?? existing?.sire ?? '',
    dam: input.dam ?? existing?.dam ?? '',
    parity: Number(input.parity ?? existing?.parity ?? 0),
    blvStatus: input.blvStatus ?? existing?.blvStatus ?? '未検査',
    stage: input.stage ?? existing?.stage ?? '繁殖牛',
    sourceCalfId: input.sourceCalfId ?? existing?.sourceCalfId,
    acquisitionMethod: input.acquisitionMethod ?? existing?.acquisitionMethod,
    acquisitionDate: input.acquisitionDate ?? existing?.acquisitionDate,
    acquisitionPrice: input.acquisitionPrice ?? existing?.acquisitionPrice,
    acquisitionCost: input.acquisitionCost ?? existing?.acquisitionCost,
    note: input.note ?? existing?.note ?? '',
    registrationNumber: input.registrationNumber ?? existing?.registrationNumber,
    sourceReferenceNumber: input.sourceReferenceNumber ?? existing?.sourceReferenceNumber,
    maternalSire: input.maternalSire ?? existing?.maternalSire,
    maternalGrandSire: input.maternalGrandSire ?? existing?.maternalGrandSire,
    importedOffspringHistory: input.importedOffspringHistory ?? existing?.importedOffspringHistory,
    importSourceFileName: input.importSourceFileName ?? existing?.importSourceFileName,
    importSourceType: input.importSourceType ?? existing?.importSourceType,
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? now,
    deletedAt: input.deletedAt,
    cloudUpdatedAt: nextCloudUpdatedAt(existing),
  };
}

export async function listSyncedCattleRecords() {
  const records = await readJson<SyncedCattleRecord[]>(fileName, []);
  return records.map(withoutLocalSyncState).sort((a, b) =>
    String(b.cloudUpdatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? '')),
  );
}

export async function syncCattleRecord(
  id: string,
  input: SyncedCattleRecord,
  conditions: CattleRecordSyncConditions = {},
) {
  return withFarmSyncLock(async () => {
  if (!id.trim()) throw new Error('INVALID_CATTLE_RECORD_ID');

  const records = await readJson<SyncedCattleRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const expected = expectedRevision(conditions.ifMatch);
  if (conditions.ifNoneMatch !== undefined) {
    if (conditions.ifNoneMatch.trim() !== '*' || expected !== undefined) throw new Error('INVALID_CATTLE_RECORD_CONDITION');
    if (existing) throw new Error('CATTLE_RECORD_SYNC_PRECONDITION_FAILED');
  }
  if (existing?.deletedAt && !input.deletedAt) throw new Error('CATTLE_RECORD_DELETED');

  const synced = normalizeRecord({ ...input, id }, existing);
  // A repeated successful PUT can carry the previous revision after its ACK
  // was lost. Confirm the exact content and timestamp without another write.
  if (existing && sameRecordContent(synced, normalizeRecord(existing, existing))) {
    return withoutLocalSyncState(existing);
  }
  if (expected !== undefined && (!existing || existing.cloudUpdatedAt !== expected)) {
    throw new Error('CATTLE_RECORD_SYNC_PRECONDITION_FAILED');
  }
  if (conditions.ifMatch === undefined && conditions.ifNoneMatch === undefined && input.cloudUpdatedAt &&
      (!existing || existing.cloudUpdatedAt !== input.cloudUpdatedAt)) {
    throw new Error('CATTLE_RECORD_SYNC_CONFLICT');
  }

  if (!input.deletedAt) {
    const duplicateEarTag = records.find(
      (record) =>
        !record.deletedAt &&
        String(record.id) !== id &&
        record.earTag.trim() === String(input.earTag ?? '').trim(),
    );
    if (duplicateEarTag) throw new Error('DUPLICATED_EAR_TAG');

    const identificationNumber = String(input.identificationNumber ?? '').trim();
    if (identificationNumber) {
      const duplicateIdentificationNumber = records.find(
        (record) =>
          !record.deletedAt &&
          String(record.id) !== id &&
          String(record.identificationNumber ?? '').trim() === identificationNumber,
      );
      if (duplicateIdentificationNumber) throw new Error('DUPLICATED_IDENTIFICATION_NUMBER');
    }
  }

  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
  });
}

export async function deleteSyncedCattleRecord(id: string, conditions: CattleRecordSyncConditions = {}) {
  return withFarmSyncLock(async () => {
    if (!id.trim()) throw new Error('INVALID_CATTLE_RECORD_ID');
    if (conditions.ifNoneMatch !== undefined) throw new Error('INVALID_CATTLE_RECORD_CONDITION');
    const expected = expectedRevision(conditions.ifMatch);
    const records = await readJson<SyncedCattleRecord[]>(fileName, []);
    const index = records.findIndex((record) => String(record.id) === id);
    const existing = index >= 0 ? records[index] : undefined;
    // Retrying a confirmed deletion must not advance its revision or revive it.
    if (existing?.deletedAt) return withoutLocalSyncState(existing);
    if (expected !== undefined && (!existing || existing.cloudUpdatedAt !== expected)) {
      throw new Error('CATTLE_RECORD_SYNC_PRECONDITION_FAILED');
    }
    const now = new Date().toISOString();
    const deleted = normalizeRecord({
      ...(existing ?? { id, earTag: '', name: '', birthday: '' }),
      id, deletedAt: now, updatedAt: now,
    }, existing);
    if (index >= 0) records[index] = deleted;
    else records.push(deleted);
    await writeJson(fileName, records);
    return deleted;
  });
}

export async function createSyncedCattleRecordIfAbsent(id: string, input: SyncedCattleRecord) {
  return withFarmSyncLock(async () => {
    if (!id.trim() || !input.earTag?.trim() || !input.name?.trim() || !input.birthday?.trim())
      throw new Error('INVALID_CATTLE_RECORD_ID');
    const identificationNumber = String(input.identificationNumber ?? '').trim();
    if (!identificationNumber || id !== `idn:${identificationNumber}`)
      throw new Error('INVALID_CATTLE_RECORD_ID');
    const records = await readJson<SyncedCattleRecord[]>(fileName, []);
    if (records.some(r => String(r.id) === id || (
      !r.deletedAt && (r.earTag.trim() === input.earTag.trim() ||
      String(r.identificationNumber ?? '').trim() === identificationNumber)
    ))) throw new Error('CATTLE_RECORD_ALREADY_EXISTS');
    const created = normalizeRecord({ ...input, id });
    records.push(created);
    await writeJson(fileName, records);
    return created;
  });
}

