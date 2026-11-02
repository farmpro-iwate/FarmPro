import { isDeepStrictEqual } from 'node:util';
import { dataPath, readJson, writeJson } from './jsonStore';

export type Breeding = {
  id: string | number;
  cowEarTag: string;
  cowName: string;
  heatDate: string;
  estrusType?: '自然発情' | '繁殖治療による発情' | '';
  breedingMethod: string;
  breedingStatus: string;
  inseminationDate: string;
  inseminationCost?: string;
  bullName: string;
  bullMasterId?: number;
  inseminatorName: string;
  inseminatorMasterId?: number;
  transferPlannedDate: string;
  transferDate: string;
  transferCost?: string;
  embryoCost?: string;
  transferProcedureCost?: string;
  transferOtherCost?: string;
  transferCancelReason: string;
  embryoNumber: string;
  embryoSource?: '' | 'farm_stock' | 'external';
  embryoInventoryMovementId?: string;
  embryoInventoryBatchKey?: string;
  collectionDate: string;
  embryoType: string;
  donorCowName: string;
  donorCowEarTag: string;
  embryoSireName: string;
  embryoSireMasterId?: number;
  embryoGrade: string;
  strawNumber: string;
  supplierName: string;
  supplierMasterId?: number;
  transferTechnician: string;
  transferTechnicianMasterId?: number;
  nextHeatExpectedDate: string;
  pregnancyCheckExpectedDate: string;
  pregnancyCheckDate: string;
  pregnancyCheckCost?: string;
  pregnancyResult: string;
  recheckExpectedDate: string;
  expectedCalvingDate: string;
  estrusSigns?: string[];
  estrusSignsOther?: string;
  synchronizationProgramId?: string;
  synchronizationProgramName?: string;
  sourceScheduleId?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  cloudUpdatedAt?: string;
  deletedAt?: string;
};

export type BreedingInput = Omit<Breeding, 'id' | 'createdAt' | 'updatedAt' | 'cloudUpdatedAt' | 'deletedAt'>;
export type BreedingSyncInput = BreedingInput & {
  createdAt?: string;
  updatedAt?: string;
};

const fileName = 'breedings.json';
export type BreedingSyncConditions = { ifMatch?: string; ifNoneMatch?: string };
const queues = new Map<string, Promise<void>>();

// Every reader and mutation shares the complete read/check/write boundary.
// dataPath includes both the runtime directory and the current farm.
async function withFarmBreedingLock<T>(action: () => Promise<T>): Promise<T> {
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

function normalize(input: Partial<BreedingInput>): BreedingInput {
  return {
    cowEarTag: input.cowEarTag ?? '',
    cowName: input.cowName ?? '',
    heatDate: input.heatDate ?? '',
    estrusType: input.estrusType ?? '',
    breedingMethod: input.breedingMethod ?? '未選択',
    breedingStatus: input.breedingStatus ?? '発情予定',
    inseminationDate: input.inseminationDate ?? '',
    inseminationCost: input.inseminationCost ?? '',
    bullName: input.bullName ?? '',
    bullMasterId: input.bullMasterId,
    inseminatorName: input.inseminatorName ?? '',
    inseminatorMasterId: input.inseminatorMasterId,
    transferPlannedDate: input.transferPlannedDate ?? '',
    transferDate: input.transferDate ?? '',
    transferCost: input.transferCost ?? '',
    embryoCost: input.embryoCost ?? '',
    transferProcedureCost: input.transferProcedureCost ?? '',
    transferOtherCost: input.transferOtherCost ?? '',
    transferCancelReason: input.transferCancelReason ?? '',
    embryoNumber: input.embryoNumber ?? '',
    embryoSource: input.embryoSource ?? '',
    embryoInventoryMovementId: input.embryoInventoryMovementId,
    embryoInventoryBatchKey: input.embryoInventoryBatchKey,
    collectionDate: input.collectionDate ?? '',
    embryoType: input.embryoType ?? '未選択',
    donorCowName: input.donorCowName ?? '',
    donorCowEarTag: input.donorCowEarTag ?? '',
    embryoSireName: input.embryoSireName ?? '',
    embryoSireMasterId: input.embryoSireMasterId,
    embryoGrade: input.embryoGrade ?? '',
    strawNumber: input.strawNumber ?? '',
    supplierName: input.supplierName ?? '',
    supplierMasterId: input.supplierMasterId,
    transferTechnician: input.transferTechnician ?? '',
    transferTechnicianMasterId: input.transferTechnicianMasterId,
    nextHeatExpectedDate: input.nextHeatExpectedDate ?? '',
    pregnancyCheckExpectedDate: input.pregnancyCheckExpectedDate ?? '',
    pregnancyCheckDate: input.pregnancyCheckDate ?? '',
    pregnancyCheckCost: input.pregnancyCheckCost ?? '',
    pregnancyResult: input.pregnancyResult ?? '未鑑定',
    recheckExpectedDate: input.recheckExpectedDate ?? '',
    expectedCalvingDate: input.expectedCalvingDate ?? '',
    estrusSigns: Array.isArray(input.estrusSigns) ? input.estrusSigns : [],
    estrusSignsOther: input.estrusSignsOther ?? '',
    synchronizationProgramId: input.synchronizationProgramId,
    synchronizationProgramName: input.synchronizationProgramName,
    sourceScheduleId: input.sourceScheduleId,
    note: input.note ?? '',
  };
}

function validIsoDate(value?: string) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function assertId(id: string | number): void {
  if ((typeof id !== 'string' && typeof id !== 'number') || String(id).trim() === '' ||
      (typeof id === 'number' && !Number.isFinite(id))) throw new Error('INVALID_BREEDING_ID');
}

function assertMutationInput(input: unknown): asserts input is BreedingSyncInput {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      (input as { deletedAt?: unknown }).deletedAt !== undefined) {
    throw new Error('INVALID_BREEDING_SYNC_INPUT');
  }
}

function expectedRevision(conditions: BreedingSyncConditions): string | undefined {
  const value = conditions.ifMatch;
  let expected: string | undefined;
  if (value !== undefined) {
    const text = value.trim();
    expected = text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text;
    if (!expected || expected === '*' || expected.includes('"') || expected.includes(',')) {
      throw new Error('INVALID_BREEDING_SYNC_CONDITION');
    }
  }
  if (conditions.ifNoneMatch !== undefined &&
      (conditions.ifNoneMatch.trim() !== '*' || expected !== undefined)) {
    throw new Error('INVALID_BREEDING_SYNC_CONDITION');
  }
  return expected;
}

function storedRevision(item?: Breeding): string | undefined {
  if (validIsoDate(item?.cloudUpdatedAt)) return item!.cloudUpdatedAt;
  if (validIsoDate(item?.updatedAt)) return item!.updatedAt;
  return undefined;
}

function nextCloudUpdatedAt(...records: Array<Breeding | undefined>): string {
  const clocks = records.map(record => Date.parse(storedRevision(record) || '')).filter(Number.isFinite);
  const previous = clocks.length ? Math.max(...clocks) : Number.NaN;
  return new Date(Number.isFinite(previous) ? Math.max(Date.now(), previous + 1) : Date.now()).toISOString();
}

function normalizeStored(item: Breeding): Breeding {
  return {
    ...normalize(item), id: item.id, createdAt: item.createdAt, updatedAt: item.updatedAt,
    // Old rows have no server clock. Their persisted updatedAt is a stable
    // comparison value; reading never changes the ledger or invents a new clock.
    cloudUpdatedAt: storedRevision(item),
    ...(item.deletedAt ? { deletedAt: item.deletedAt } : {}),
  };
}

function recordFromInput(id: string | number, input: BreedingSyncInput, existing?: Breeding): Breeding {
  const now = new Date().toISOString();
  return {
    ...normalize({ ...existing, ...input }), id: existing?.id ?? id,
    createdAt: validIsoDate(input.createdAt) ? input.createdAt! : existing?.createdAt ?? now,
    updatedAt: validIsoDate(input.updatedAt) ? input.updatedAt! : now,
    cloudUpdatedAt: nextCloudUpdatedAt(existing),
  };
}

function sameRecordContent(left: Breeding, right: Breeding): boolean {
  const content = (record: Breeding) => {
    const { cloudUpdatedAt: _revision, ...fields } = normalizeStored(record);
    return JSON.parse(JSON.stringify(fields));
  };
  return isDeepStrictEqual(content(left), content(right));
}

function assertConditions(existing: Breeding | undefined, expected: string | undefined, conditions: BreedingSyncConditions): void {
  if (conditions.ifNoneMatch !== undefined && existing) throw new Error('BREEDING_SYNC_PRECONDITION_FAILED');
  if (expected !== undefined && (!existing || storedRevision(existing) !== expected)) {
    throw new Error('BREEDING_SYNC_PRECONDITION_FAILED');
  }
}

export async function listStoredBreedings(): Promise<Breeding[]> {
  return withFarmBreedingLock(async () => {
    const data = await readJson<Breeding[]>(fileName, []);
    // Reports and explicit backups preserve raw business fields and unknown
    // legacy fields. They must never include internal deletion history.
    return data.filter(item => !item.deletedAt);
  });
}

export async function listBreedings() {
  return withFarmBreedingLock(async () => {
    const data = await readJson<Breeding[]>(fileName, []);
    return data.filter(item => !item.deletedAt).map(normalizeStored)
      .sort((a, b) => String(b.cloudUpdatedAt ?? b.updatedAt ?? '').localeCompare(String(a.cloudUpdatedAt ?? a.updatedAt ?? '')));
  });
}

export async function findSyncedBreeding(id: string | number): Promise<Breeding | undefined> {
  assertId(id);
  return withFarmBreedingLock(async () => {
    const data = await readJson<Breeding[]>(fileName, []);
    const item = data.find(row => String(row.id) === String(id));
    return item ? normalizeStored(item) : undefined;
  });
}

export async function findBreeding(id: string | number) {
  const item = await findSyncedBreeding(id);
  return item?.deletedAt ? undefined : item;
}

export async function createBreeding(input: BreedingInput) {
  assertMutationInput(input);
  return withFarmBreedingLock(async () => {
    const data = await readJson<Breeding[]>(fileName, []);
    const now = new Date().toISOString();
    // Deleted numeric IDs must not be allocated to a different animal.
    const numericIds = data.map(x => Number(x.id)).filter(Number.isFinite);
    const id = numericIds.length === 0 ? 1 : Math.max(...numericIds) + 1;
    const item = recordFromInput(id, { ...input, createdAt: now, updatedAt: now });
    data.push(item);
    await writeJson(fileName, data);
    return item;
  });
}

export async function updateBreeding(id: string | number, input: BreedingInput, conditions: BreedingSyncConditions = {}) {
  assertId(id);
  assertMutationInput(input);
  const expected = expectedRevision(conditions);
  return withFarmBreedingLock(async () => {
    const data = await readJson<Breeding[]>(fileName, []);
    const index = data.findIndex(item => String(item.id) === String(id));
    const existing = index >= 0 ? data[index] : undefined;
    if (existing?.deletedAt) throw new Error('BREEDING_RECORD_DELETED');
    assertConditions(existing, expected, conditions);
    if (!existing) return null;
    const saved = recordFromInput(existing.id, { ...input, createdAt: existing.createdAt }, existing);
    data[index] = saved;
    await writeJson(fileName, data);
    return normalizeStored(saved);
  });
}

export async function syncBreeding(id: string | number, input: BreedingSyncInput, conditions: BreedingSyncConditions = {}) {
  assertId(id);
  assertMutationInput(input);
  const expected = expectedRevision(conditions);
  return withFarmBreedingLock(async () => {
    const data = await readJson<Breeding[]>(fileName, []);
    const index = data.findIndex(item => String(item.id) === String(id));
    const existing = index >= 0 ? data[index] : undefined;
    if (conditions.ifNoneMatch !== undefined && existing) throw new Error('BREEDING_SYNC_PRECONDITION_FAILED');
    if (existing?.deletedAt) throw new Error('BREEDING_RECORD_DELETED');
    const item = recordFromInput(id, input, existing);
    // An exact lost-ACK replay is already committed, even if its If-Match is old.
    if (existing && sameRecordContent(item, existing)) return normalizeStored(existing);
    assertConditions(existing, expected, conditions);
    // Conditional clients use the server revision, independent of device clocks.
    // Existing headerless clients retain the old timestamp conflict behavior.
    if (expected === undefined && conditions.ifNoneMatch === undefined && existing &&
        validIsoDate(input.updatedAt) && validIsoDate(existing.updatedAt) &&
        Date.parse(input.updatedAt!) < Date.parse(existing.updatedAt)) {
      throw new Error('BREEDING_SYNC_CONFLICT');
    }
    if (index >= 0) data[index] = item;
    else data.push(item);
    await writeJson(fileName, data);
    return normalizeStored(item);
  });
}

export async function deleteBreeding(id: string | number, conditions: BreedingSyncConditions = {}) {
  assertId(id);
  const expected = expectedRevision(conditions);
  return withFarmBreedingLock(async () => {
    const data = await readJson<Breeding[]>(fileName, []);
    const index = data.findIndex(item => String(item.id) === String(id));
    const existing = index >= 0 ? data[index] : undefined;
    if (existing?.deletedAt) return true;
    assertConditions(existing, expected, conditions);
    // Preserve the legacy missing-ID 404. New clients explicitly stamp absence
    // so an in-flight creation cannot later restore a successfully deleted ID.
    if (!existing && conditions.ifNoneMatch === undefined) return false;
    const now = new Date().toISOString();
    const deleted: Breeding = {
      ...(existing ?? recordFromInput(id, {} as BreedingSyncInput)),
      id: existing?.id ?? id, updatedAt: now, cloudUpdatedAt: nextCloudUpdatedAt(existing), deletedAt: now,
    };
    if (index >= 0) data[index] = deleted;
    else data.push(deleted);
    await writeJson(fileName, data);
    return true;
  });
}

export function validateBreedingBackupRecords(value: unknown): asserts value is Breeding[] {
  if (!Array.isArray(value)) throw new Error('INVALID_BACKUP_BREEDINGS');
  const ids = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('INVALID_BACKUP_BREEDINGS');
    try { assertId(item.id); }
    catch { throw new Error('INVALID_BACKUP_BREEDINGS'); }
    const key = String(item.id);
    if (ids.has(key) || (item.deletedAt && (!validIsoDate(item.deletedAt) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(item.deletedAt)))) {
      throw new Error('INVALID_BACKUP_BREEDINGS');
    }
    ids.add(key);
  }
}

export async function replaceBreedingsFromBackup(records: Breeding[]): Promise<void> {
  validateBreedingBackupRecords(records);
  // Take a copy before waiting for another mutation's lock; callers retain
  // their original backup object and cannot alter an already-validated restore.
  const incoming = structuredClone(records);
  return withFarmBreedingLock(async () => {
    const existing = await readJson<Breeding[]>(fileName, []);
    const byId = new Map(existing.map(record => [String(record.id), record]));
    const included = new Set(incoming.map(record => String(record.id)));
    const now = new Date().toISOString();
    const restored: Breeding[] = incoming.map(record => {
      const current = byId.get(String(record.id));
      const next = { ...record, cloudUpdatedAt: nextCloudUpdatedAt(current, record) };
      if (!record.deletedAt) delete next.deletedAt;
      return next;
    });
    // Omitted IDs remain deleted, preventing pre-restore requests from silently
    // reintroducing them. Only this explicit restore may revive an included ID.
    for (const record of existing) {
      if (included.has(String(record.id))) continue;
      restored.push(record.deletedAt ? record : {
        ...record, updatedAt: now, cloudUpdatedAt: nextCloudUpdatedAt(record), deletedAt: now,
      });
    }
    await writeJson(fileName, restored);
  });
}
