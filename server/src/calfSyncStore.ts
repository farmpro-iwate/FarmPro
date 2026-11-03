import { readJson, writeJson } from './jsonStore';
import { currentFarmId } from './farmContext';
import { isDeepStrictEqual } from 'node:util';
import type { AnimalLifecycle } from './animalLifecycle';

export type SyncedCalfRecord = {
  lifecycle?: AnimalLifecycle;
  id: string;
  calvingId?: string;
  calfNumber?: string;
  temporaryCalfNumber?: string;
  identificationNumber?: string;
  name?: string;
  birthday?: string;
  sex?: string;
  motherName?: string;
  motherCowId?: string;
  motherCowName?: string;
  breedingMethod?: string;
  breedingId?: string;
  geneticMotherCowId?: string;
  geneticMotherCowName?: string;
  recipientCowId?: string;
  recipientCowName?: string;
  sireName?: string;
  startWeight?: number;
  currentWeight?: number;
  elapsedDays?: number;
  milkAmount?: number;
  starterAmount?: number;
  feedingMethod?: string;
  weaningPlannedDate?: string;
  weaningDate?: string;
  weaningStatus?: string;
  weaningWeight?: number;
  weaningStarterAmount?: number;
  milkEndDate?: string;
  managementStatus?: string;
  promotedCattleId?: number;
  promotedAt?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

const fileName = 'calves-sync.json';
export type CalfSyncConditions = { ifMatch?: string; ifNoneMatch?: string };
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

function withoutLocalSyncState(record: SyncedCalfRecord): SyncedCalfRecord {
  return Object.fromEntries(Object.entries(record).filter(([key]) =>
    key !== 'cloudSyncPending' && key !== 'syncWarning' && !key.startsWith('animalSync'),
  )) as SyncedCalfRecord;
}

function expectedRevision(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const text = value.trim();
  const revision = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
  if (!revision || revision === '*' || revision.includes('"') || revision.includes(',')) {
    throw new Error('INVALID_CALF_SYNC_CONDITION');
  }
  return revision;
}

function nextCloudUpdatedAt(existing?: SyncedCalfRecord): string {
  const previous = Date.parse(existing?.cloudUpdatedAt || '');
  return new Date(Number.isFinite(previous) ? Math.max(Date.now(), previous + 1) : Date.now()).toISOString();
}

function sameRecordContent(left: SyncedCalfRecord, right: SyncedCalfRecord): boolean {
  const content = (record: SyncedCalfRecord) => {
    const { cloudUpdatedAt: _revision, ...fields } = withoutLocalSyncState(record);
    return JSON.parse(JSON.stringify(fields));
  };
  return isDeepStrictEqual(content(left), content(right));
}

function validIsoDate(value?: string) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function normalizeRecord(input: SyncedCalfRecord, existing?: SyncedCalfRecord): SyncedCalfRecord {
  input = withoutLocalSyncState(input);
  existing = existing ? withoutLocalSyncState(existing) : undefined;
  const now = new Date().toISOString();
  return {
    ...existing,
    ...input,
    id: String(input.id || existing?.id || ''),
    calvingId: input.calvingId ?? existing?.calvingId ?? '',
    calfNumber: input.calfNumber ?? existing?.calfNumber ?? '',
    temporaryCalfNumber: input.temporaryCalfNumber ?? existing?.temporaryCalfNumber ?? '',
    identificationNumber: input.identificationNumber ?? existing?.identificationNumber ?? '',
    name: input.name ?? existing?.name ?? '',
    birthday: input.birthday ?? existing?.birthday ?? '',
    sex: input.sex ?? existing?.sex ?? '',
    motherName: input.motherName ?? existing?.motherName ?? '',
    motherCowId: input.motherCowId ?? existing?.motherCowId ?? '',
    motherCowName: input.motherCowName ?? existing?.motherCowName ?? '',
    breedingMethod: input.breedingMethod ?? existing?.breedingMethod ?? '',
    breedingId: input.breedingId ?? existing?.breedingId ?? '',
    geneticMotherCowId: input.geneticMotherCowId ?? existing?.geneticMotherCowId ?? '',
    geneticMotherCowName: input.geneticMotherCowName ?? existing?.geneticMotherCowName ?? '',
    recipientCowId: input.recipientCowId ?? existing?.recipientCowId ?? '',
    recipientCowName: input.recipientCowName ?? existing?.recipientCowName ?? '',
    sireName: input.sireName ?? existing?.sireName ?? '',
    startWeight: Number(input.startWeight ?? existing?.startWeight ?? 0),
    currentWeight: Number(input.currentWeight ?? existing?.currentWeight ?? 0),
    elapsedDays: Number(input.elapsedDays ?? existing?.elapsedDays ?? 0),
    milkAmount: Number(input.milkAmount ?? existing?.milkAmount ?? 0),
    starterAmount: Number(input.starterAmount ?? existing?.starterAmount ?? 0),
    feedingMethod: input.feedingMethod ?? existing?.feedingMethod ?? '人工哺育',
    weaningPlannedDate: input.weaningPlannedDate ?? existing?.weaningPlannedDate ?? '',
    weaningDate: input.weaningDate ?? existing?.weaningDate ?? '',
    weaningStatus: input.weaningStatus ?? existing?.weaningStatus ?? '離乳前',
    weaningWeight: Number(input.weaningWeight ?? existing?.weaningWeight ?? 0),
    weaningStarterAmount: Number(input.weaningStarterAmount ?? existing?.weaningStarterAmount ?? 0),
    milkEndDate: input.milkEndDate ?? existing?.milkEndDate ?? '',
    managementStatus: input.managementStatus ?? existing?.managementStatus ?? '育成中',
    promotedCattleId: input.promotedCattleId ?? existing?.promotedCattleId,
    promotedAt: input.promotedAt ?? existing?.promotedAt ?? '',
    note: input.note ?? existing?.note ?? '',
    createdAt: validIsoDate(input.createdAt) ? input.createdAt : existing?.createdAt ?? now,
    updatedAt: validIsoDate(input.updatedAt) ? input.updatedAt : now,
    deletedAt: input.deletedAt,
    cloudUpdatedAt: nextCloudUpdatedAt(existing),
  };
}

export async function listSyncedCalves() {
  const records = await readJson<SyncedCalfRecord[]>(fileName, []);
  return records.map(withoutLocalSyncState).sort((a, b) =>
    String(b.cloudUpdatedAt ?? b.updatedAt ?? '').localeCompare(
      String(a.cloudUpdatedAt ?? a.updatedAt ?? ''),
    ),
  );
}

export async function syncCalf(id: string, input: SyncedCalfRecord, conditions: CalfSyncConditions = {}) {
  return withFarmSyncLock(async () => {
  if (!id.trim()) throw new Error('INVALID_CALF_ID');

  const records = await readJson<SyncedCalfRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  const expected = expectedRevision(conditions.ifMatch);
  if (conditions.ifNoneMatch !== undefined) {
    if (conditions.ifNoneMatch.trim() !== '*' || expected !== undefined) throw new Error('INVALID_CALF_SYNC_CONDITION');
    if (existing) throw new Error('CALF_SYNC_PRECONDITION_FAILED');
  }
  if (existing?.deletedAt && !input.deletedAt) throw new Error('CALF_RECORD_DELETED');

  const synced = normalizeRecord({ ...input, id }, existing);
  // Exact content and updatedAt identify a lost-ACK replay. Return the original
  // result without advancing its revision or rewriting the farm file.
  if (existing && sameRecordContent(synced, normalizeRecord(existing, existing))) {
    return withoutLocalSyncState(existing);
  }
  if (expected !== undefined && (!existing || existing.cloudUpdatedAt !== expected)) {
    throw new Error('CALF_SYNC_PRECONDITION_FAILED');
  }
  if (conditions.ifMatch === undefined && conditions.ifNoneMatch === undefined && input.cloudUpdatedAt &&
      (!existing || existing.cloudUpdatedAt !== input.cloudUpdatedAt)) {
    throw new Error('CALF_SYNC_CONFLICT');
  }
  if (index >= 0) records[index] = synced;
  else records.push(synced);

  await writeJson(fileName, records);
  return synced;
  });
}

export async function deleteSyncedCalf(id: string, conditions: CalfSyncConditions = {}) {
  return withFarmSyncLock(async () => {
  if (!id.trim()) throw new Error('INVALID_CALF_ID');
  if (conditions.ifNoneMatch !== undefined) throw new Error('INVALID_CALF_SYNC_CONDITION');
  const expected = expectedRevision(conditions.ifMatch);

  const records = await readJson<SyncedCalfRecord[]>(fileName, []);
  const index = records.findIndex((record) => String(record.id) === id);
  const existing = index >= 0 ? records[index] : undefined;
  if (existing?.deletedAt) return withoutLocalSyncState(existing);
  if (expected !== undefined && (!existing || existing.cloudUpdatedAt !== expected)) {
    throw new Error('CALF_SYNC_PRECONDITION_FAILED');
  }
  const now = new Date().toISOString();
  const deleted = normalizeRecord(
    {
      ...(existing ?? { id }),
      id,
      deletedAt: now,
      updatedAt: now,
    },
    existing,
  );

  if (index >= 0) records[index] = deleted;
  else records.push(deleted);

  await writeJson(fileName, records);
  return deleted;
  });
}
