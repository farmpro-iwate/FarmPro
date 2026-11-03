import fs from 'node:fs/promises';
import { currentFarmId } from './farmContext';
import { dataPath } from './jsonStore';
import { withdrawalCompletions } from './accountLifecycle';

type Row = Record<string, any>;
type Kind = 'cattle' | 'calf';
export type LifecycleAlertLedger = { cattle: Row[]; calves: Row[] };
const text = (value: unknown) => String(value ?? '').trim();
const object = (value: unknown): value is Row => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const values = (row: Row, keys: readonly string[]) => keys.map(key => text(row[key])).filter(Boolean);
const stableId = (value: unknown) => {
  const id = text(value);
  return /^(?:legacy|local-calf|ear):/.test(id) || /^(?:calving:)?\d+$/.test(id) ? '' : id;
};
const syncIds = (row: Row) => values(row, ['syncId', 'syncRecordId', 'id']).map(stableId).filter(Boolean);
const tag = (row: Row) => text(row.earTag || row.calfNumber);
const birthday = (row: Row) => text(row.birthday || row.birthDate).slice(0, 10);
function day(value: unknown): string {
  const date = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}

function sameStrongIdentity(left: Row, right: Row): boolean {
  const leftIds = syncIds(left); const rightIds = syncIds(right);
  const identification = text(left.identificationNumber); const otherIdentification = text(right.identificationNumber);
  const sameId = leftIds.some(id => rightIds.includes(id));
  if (leftIds.length && rightIds.length && !sameId) return false;
  if (identification && otherIdentification && identification !== otherIdentification) return false;
  if (tag(left) && tag(right) && tag(left) !== tag(right)) return false;
  if (birthday(left) && birthday(right) && birthday(left) !== birthday(right)) return false;
  return sameId || Boolean(identification && identification === otherIdentification) ||
    Boolean(tag(left) && tag(left) === tag(right) && birthday(left) && birthday(left) === birthday(right));
}

function collidingStrongIdentity(left: Row, right: Row): boolean {
  return syncIds(left).some(id => syncIds(right).includes(id)) ||
    Boolean(text(left.identificationNumber) && text(left.identificationNumber) === text(right.identificationNumber));
}

function revision(row: Row): number {
  return Math.max(0, ...[row.cloudUpdatedAt, row.updatedAt].map(value => Date.parse(text(value))).filter(Number.isFinite));
}

/** Merge confirmed identity only. Old rows which predate lifecycle metadata
 * cannot erase a recorded decision, and a newer edit can correct its fields. */
export function mergeLifecycleAnimalRows(snapshotRows: readonly Row[], syncedRows: readonly Row[]): Row[] {
  const rows = snapshotRows.map(row => ({ ...row }));
  for (const synced of syncedRows) {
    const matches = rows.map((row, index) => sameStrongIdentity(row, synced) ? index : -1).filter(index => index >= 0);
    const conflicts = rows.map((row, index) => collidingStrongIdentity(row, synced) && !sameStrongIdentity(row, synced) ? index : -1)
      .filter(index => index >= 0);
    if (matches.length !== 1 || conflicts.length) {
      const uncertain = [...matches, ...conflicts];
      if (uncertain.length) for (const index of uncertain) rows[index] = { ...rows[index], lifecycleIdentityUncertain: true };
      rows.push({ ...synced, ...(uncertain.length ? { lifecycleIdentityUncertain: true } : {}) });
      continue;
    }
    const index = matches[0];
    const snapshot = rows[index];
    const newer = revision(snapshot) > revision(synced) ? snapshot : synced;
    const older = newer === snapshot ? synced : snapshot;
    const newerLifecycle = object(newer.lifecycle) && newer.lifecycle.version === 1 ? newer.lifecycle : undefined;
    const olderLifecycle = object(older.lifecycle) && older.lifecycle.version === 1 ? older.lifecycle : undefined;
    const lifecycle = newerLifecycle || olderLifecycle ? {
      ...olderLifecycle, ...newerLifecycle, version: 1,
      ...(newerLifecycle?.death || olderLifecycle?.death ? { death: newerLifecycle?.death ?? olderLifecycle?.death } : {}),
      ...(newerLifecycle?.culling || olderLifecycle?.culling ? { culling: newerLifecycle?.culling ?? olderLifecycle?.culling } : {}),
    } : undefined;
    rows[index] = { ...older, ...newer,
      // A formal tombstone must never revive through an older snapshot.
      ...(synced.deletedAt ? { deletedAt: synced.deletedAt } : {}),
      ...(lifecycle ? { lifecycle } : {}),
      // Keep a stable reference whichever row supplies the visible id. The
      // snapshot's device-local numeric id is never identity evidence below.
      ...(stableId(snapshot.syncId) || stableId(synced.id)
        ? { syncId: stableId(snapshot.syncId) || stableId(synced.id) } : {}),
      ...(snapshot.syncRecordId ? { syncRecordId: snapshot.syncRecordId } : {}),
    };
  }
  return rows;
}

async function readOptional(file: string): Promise<unknown> {
  try { return JSON.parse(await fs.readFile(dataPath(file), 'utf8')); }
  catch (error: any) { if (error?.code === 'ENOENT') return undefined; throw error; }
}
function rows(value: unknown): Row[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(row => !object(row))) throw new Error('INVALID_LIFECYCLE_ALERT_LEDGER');
  return value;
}

/** Exact farm paths only: unlike generic legacy store readers this read never
 * copies global fixtures, creates empty ledgers, or changes a saved record. */
export async function readLifecycleAlertLedger(): Promise<LifecycleAlertLedger> {
  const farm = currentFarmId();
  if (!/^[a-zA-Z0-9_-]+$/.test(farm)) throw new Error('MISSING_LIFECYCLE_ALERT_FARM');
  if ((await withdrawalCompletions()).some(row => row.farmId === farm)) throw new Error('FARM_WITHDRAWN');
  const [cattleSync, calfSync, stored] = await Promise.all([
    readOptional('cattle-record-sync.json'), readOptional('calves-sync.json'), readOptional(`cloudSnapshot-${farm}.json`),
  ]);
  const saved = stored === undefined ? await readOptional('cloudSnapshot.json') : stored;
  let stores: Row = {};
  if (saved !== undefined && saved !== null) {
    if (!object(saved) || !object(saved.snapshot)) throw new Error('INVALID_LIFECYCLE_ALERT_SNAPSHOT');
    if (saved.snapshot.farm?.id !== farm) throw new Error('LIFECYCLE_ALERT_FARM_MISMATCH');
    if (!object(saved.snapshot.stores)) throw new Error('INVALID_LIFECYCLE_ALERT_SNAPSHOT');
    stores = saved.snapshot.stores;
  }
  return {
    cattle: mergeLifecycleAnimalRows(rows(stores.cattle), rows(cattleSync)),
    calves: mergeLifecycleAnimalRows(rows(stores.calves), rows(calfSync)),
  };
}

const breedingScheduleLabels = new Set([
  '繁殖', '妊娠鑑定', '再鑑定', '分娩', '分娩予定', '発情確認', '次回発情確認', '発情予定日',
  '人工授精', '種付', '受精卵移植', '受精卵移植（ET）', '移植予定', '繁殖検診', '繁殖治療',
  '発情同期化', '排卵同期化', '定時人工授精', 'ET向け',
]);
export function isBreedingLifecycleSchedule(row: Row): boolean {
  return Boolean(text(row.synchronizationProgramId)) ||
    [row.scheduleType, row.title, row.synchronizationPurpose].some(value => breedingScheduleLabels.has(text(value)));
}

/** Client-local numeric IDs and names are never sufficient for server pushes.
 * Every supplied strong identifier must agree with one unique animal. */
export function isLifecycleAlertSuppressed(row: Row, ledger: LifecycleAlertLedger,
  options: { asOf: string; breeding?: boolean; kind?: Kind }): boolean {
  const kinds = new Set<Kind>(options.kind ? [options.kind] : []);
  const targetType = text(row.targetType || row.animalKind);
  if (['成牛', '繁殖牛', '育成牛', 'cattle'].includes(targetType)) kinds.add('cattle');
  else if (['子牛', 'calf'].includes(targetType)) kinds.add('calf');
  else if (targetType) return false;
  if (values(row, ['cattleId', 'targetCattleId']).length) kinds.add('cattle');
  if (values(row, ['calfId', 'targetCalfId']).length) kinds.add('calf');
  if (kinds.size > 1) return false;
  const numbers = values(row, ['cowEarTag', 'targetNumber', 'earTag', 'animalEarTag']);
  if (numbers.some(value => ['-', '－', '仮番号'].includes(value) || /^仮-\d{4}$/.test(value))) return false;
  const identifications = values(row, ['identificationNumber', 'targetIdentificationNumber', 'animalIdentificationNumber']);
  const ids = values(row, ['cattleId', 'targetCattleId', 'calfId', 'targetCalfId', 'animalId',
    'animalSyncId', 'targetSyncId', 'targetSyncRecordId']).map(stableId).filter(Boolean);
  const legacyCowId = text(row.cowId);
  if (!numbers.length && !identifications.length && !ids.length && !legacyCowId) return false;
  const candidates = [
    ...(!kinds.size || kinds.has('cattle') ? ledger.cattle : []),
    ...(!kinds.size || kinds.has('calf') ? ledger.calves : []),
  ].filter(animal => !animal.deletedAt);
  const matches = candidates.filter(animal => {
    const animalNumbers = values(animal, ['earTag', 'calfNumber', 'temporaryCalfNumber', 'identificationNumber']);
    if (numbers.some(value => !animalNumbers.includes(value))) return false;
    if (identifications.some(value => value !== text(animal.identificationNumber))) return false;
    if (ids.some(value => !syncIds(animal).includes(value))) return false;
    if (legacyCowId && ![...animalNumbers, ...syncIds(animal)].includes(legacyCowId)) return false;
    if (values(row, ['targetBirthday', 'animalBirthday', 'birthday']).some(value => value.slice(0, 10) !== birthday(animal))) return false;
    return true;
  });
  if (matches.length !== 1 || matches[0].lifecycleIdentityUncertain) return false;
  const animal = matches[0];
  const lifecycle = object(animal.lifecycle) && animal.lifecycle.version === 1 ? animal.lifecycle : undefined;
  const deathDate = day(lifecycle?.death?.date);
  const cullingDate = day(lifecycle?.culling?.date);
  const asOf = day(options.asOf);
  const deceased = (!deathDate && animal.managementStatus === '死亡・その他') || Boolean(asOf && deathDate && deathDate <= asOf);
  return deceased || Boolean(options.breeding && asOf && cullingDate && cullingDate <= asOf);
}
