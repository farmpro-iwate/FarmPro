import type { ActivityRecordInput } from '../types/activityRecord';

export type ActivityAnimalKind = 'cattle' | 'calf';
export type ActivityAnimalRow = {
  id: string | number;
  earTag?: unknown;
  calfNumber?: unknown;
  name?: unknown;
  birthday?: unknown;
  identificationNumber?: unknown;
  syncId?: unknown;
  syncRecordId?: unknown;
  calvingId?: unknown;
  deletedAt?: unknown;
};
export type ActivityAnimalFields = Pick<ActivityRecordInput, 'animalKind' | 'animalId' | 'animalSyncId' |
  'animalIdentificationNumber' | 'animalEarTag' | 'animalName' | 'animalBirthday'>;
export type ActivityAnimalReference = Partial<ActivityAnimalFields> & { activityType?: string };

const text = (value: unknown) => String(value ?? '').trim();

/** Numeric device IDs and ear-number aliases do not prove identity on another device. */
function stableSyncId(value: unknown): string {
  const id = text(value);
  return /^(?:legacy|local-calf|ear):/.test(id) || /^(?:calving:)?\d+$/.test(id) ? '' : id;
}

export function activityAnimalFields(kind: ActivityAnimalKind, animal: ActivityAnimalRow): ActivityAnimalFields {
  return {
    animalKind: kind,
    animalId: text(animal.id),
    animalSyncId: stableSyncId(kind === 'cattle' ? animal.syncId : animal.syncRecordId ||
      (text(animal.calvingId) ? `calving:${text(animal.calvingId)}` : '')),
    animalIdentificationNumber: text(animal.identificationNumber),
    animalEarTag: text(kind === 'cattle' ? animal.earTag : animal.calfNumber),
    animalName: text(animal.name),
    animalBirthday: text(animal.birthday).slice(0, 10),
  };
}

function uniqueAnimal<T extends ActivityAnimalRow>(reference: ActivityAnimalReference, kind: ActivityAnimalKind, rows: readonly T[]): T | null {
  const candidates = rows.filter(row => !row.deletedAt).map(animal => ({ animal, identity: activityAnimalFields(kind, animal) }));
  const syncId = stableSyncId(reference.animalSyncId);
  const identification = text(reference.animalIdentificationNumber);
  const compatible = (identity: ActivityAnimalFields) =>
    !(syncId && identity.animalSyncId && syncId !== identity.animalSyncId) &&
    !(identification && identity.animalIdentificationNumber && identification !== identity.animalIdentificationNumber);
  if (syncId) {
    const matches = candidates.filter(row => row.identity.animalSyncId === syncId);
    if (matches.length) return matches.length === 1 && compatible(matches[0].identity) ? matches[0].animal : null;
  }
  if (identification) {
    const matches = candidates.filter(row => row.identity.animalIdentificationNumber === identification);
    if (matches.length) return matches.length === 1 && compatible(matches[0].identity) ? matches[0].animal : null;
  }
  const earTag = text(reference.animalEarTag);
  const birthday = text(reference.animalBirthday).slice(0, 10);
  const name = text(reference.animalName);
  // A historical number alone may be reused. Require the recorded birth date,
  // preserve leading zeros, and reject a contradictory recorded name.
  if (!earTag || !birthday) return null;
  const matches = candidates.filter(({ identity }) => compatible(identity) && identity.animalEarTag === earTag &&
    identity.animalBirthday === birthday && (!name || identity.animalName === name));
  return matches.length === 1 ? matches[0].animal : null;
}

/** Resolve against the whole ledger, never the selected animal alone, so ambiguity stays visible. */
export function findActivityAnimal<C extends ActivityAnimalRow, F extends ActivityAnimalRow>(
  reference: ActivityAnimalReference, cattleRows: readonly C[], calfRows: readonly F[],
): { kind: 'cattle'; animal: C } | { kind: 'calf'; animal: F } | null {
  if (reference.activityType !== 'animal') return null;
  if (reference.animalKind === 'cattle') {
    const animal = uniqueAnimal(reference, 'cattle', cattleRows);
    return animal ? { kind: 'cattle', animal } : null;
  }
  if (reference.animalKind === 'calf') {
    const animal = uniqueAnimal(reference, 'calf', calfRows);
    return animal ? { kind: 'calf', animal } : null;
  }
  return null;
}
