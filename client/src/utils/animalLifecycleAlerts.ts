import { isAnimalBreedingInactive, isAnimalDeceased } from './animalLifecycle';

type Row = Readonly<Record<string, any>>;
export type LifecycleAnimalKind = 'cattle' | 'calf';
export type LifecycleAnimalLedger = Readonly<{
  cattle: readonly Row[]; calves: readonly Row[]; unavailable?: readonly LifecycleAnimalKind[];
}>;
type Options = Readonly<{ kind?: LifecycleAnimalKind; breeding?: boolean; asOf?: string }>;

const text = (value: unknown) => String(value ?? '').trim();
const values = (row: Row, keys: readonly string[]) => keys.map(key => text(row[key])).filter(Boolean);
const unique = (items: string[]) => [...new Set(items)];
const usableNumber = (value: string) => !['-', '－', '仮番号'].includes(value) && !/^仮-\d{4}$/.test(value);
const stableId = (value: string) => !/^(?:legacy|local-calf|ear):/.test(value) && !/^(?:calving:)?\d+$/.test(value);

/** Resolve against both complete ledgers. A name, a display-only temporary
 * number, or an identifier shared by multiple animals cannot hide an alert. */
export function findLifecycleAlertAnimal(row: Row, ledger: LifecycleAnimalLedger, requestedKind?: LifecycleAnimalKind): Row | undefined {
  const kinds = new Set<LifecycleAnimalKind>(requestedKind ? [requestedKind] : []);
  const targetType = text(row.targetType || row.animalKind);
  if (['成牛', '繁殖牛', '育成牛', 'cattle'].includes(targetType)) kinds.add('cattle');
  else if (['子牛', 'calf'].includes(targetType)) kinds.add('calf');
  else if (targetType) return undefined;
  if (values(row, ['cattleId', 'targetCattleId']).length) kinds.add('cattle');
  if (values(row, ['calfId', 'targetCalfId']).length) kinds.add('calf');
  if (kinds.size > 1) return undefined;
  if (ledger.unavailable?.some(kind => !kinds.size || kinds.has(kind))) return undefined;

  const numbers = unique(values(row, ['cowEarTag', 'targetNumber', 'earTag', 'animalEarTag']));
  if (numbers.some(value => !usableNumber(value))) return undefined;
  const identifications = unique(values(row, ['identificationNumber', 'targetIdentificationNumber', 'animalIdentificationNumber']));
  const ids = unique(values(row, ['cattleId', 'targetCattleId', 'calfId', 'targetCalfId', 'animalId']));
  const syncIds = unique(values(row, ['animalSyncId', 'targetSyncId', 'targetSyncRecordId']));
  const legacyCowId = text(row.cowId);
  // Management records travel between devices. A device-local numeric ID by
  // itself does not prove that an old record belongs to today's ledger row.
  if (!numbers.length && !identifications.length && !ids.some(stableId) && !syncIds.some(stableId) && !legacyCowId) return undefined;

  const candidates = [
    ...(!kinds.size || kinds.has('cattle') ? ledger.cattle : []),
    ...(!kinds.size || kinds.has('calf') ? ledger.calves : []),
  ].filter(animal => !animal.deletedAt);
  const matches = candidates.filter(animal => {
    const animalNumbers = values(animal, ['earTag', 'calfNumber', 'temporaryCalfNumber', 'identificationNumber']);
    const animalIds = values(animal, ['id', 'syncId', 'syncRecordId']);
    if (numbers.some(value => !animalNumbers.includes(value))) return false;
    if (identifications.some(value => value !== text(animal.identificationNumber))) return false;
    if (ids.some(value => !animalIds.includes(value))) return false;
    if (syncIds.some(value => !values(animal, ['syncId', 'syncRecordId']).includes(value))) return false;
    if (legacyCowId && ![...animalNumbers, ...animalIds.filter(stableId)].includes(legacyCowId)) return false;
    const birthdays = values(row, ['targetBirthday', 'animalBirthday', 'birthday']);
    if (birthdays.some(value => value.slice(0, 10) !== text(animal.birthday).slice(0, 10))) return false;
    return true;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

/** Death ends all active care/plan reminders; culling ends breeding work only. */
export function isLifecycleAlertSuppressed(row: Row, ledger: LifecycleAnimalLedger, options: Options = {}): boolean {
  const animal = findLifecycleAlertAnimal(row, ledger, options.kind);
  if (!animal) return false;
  return options.breeding
    ? isAnimalBreedingInactive(animal, options.asOf)
    : isAnimalDeceased(animal, options.asOf);
}

const breedingScheduleLabels = new Set([
  '繁殖', '妊娠鑑定', '再鑑定', '分娩', '分娩予定', '発情確認', '次回発情確認', '発情予定日',
  '人工授精', '種付', '受精卵移植', '受精卵移植（ET）', '移植予定', '繁殖検診', '繁殖治療',
  '発情同期化', '排卵同期化', '定時人工授精', 'ET向け',
]);

/** Classify saved structured schedule fields; never infer lifecycle or work
 * category from free-form notes. Farm work without an animal stays visible. */
export function isBreedingLifecycleSchedule(row: Row): boolean {
  return Boolean(text(row.synchronizationProgramId)) ||
    [row.scheduleType, row.title, row.synchronizationPurpose].some(value => breedingScheduleLabels.has(text(value)));
}
