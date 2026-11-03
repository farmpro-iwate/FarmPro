import { describe, expect, it } from 'vitest';
import { activityAnimalFields, findActivityAnimal, type ActivityAnimalReference } from './activityRecordAnimal';

const cow = { id: 7, name: '検証牛', earTag: '0012', birthday: '2020-04-05', identificationNumber: 'fixture-identification', syncId: 'fixture-cow-sync' };
const record: ActivityAnimalReference = { activityType: 'animal', ...activityAnimalFields('cattle', cow) };

describe('activity record animal identity', () => {
  it('retains the recorded leading zeros and resolves a stable identity despite a different local ID', () => {
    expect(record.animalEarTag).toBe('0012');
    const otherDevice = { ...cow, id: 99, name: '変更後の名号', earTag: '0013' };
    expect(findActivityAnimal(record, [otherDevice], [])).toEqual({ kind: 'cattle', animal: otherDevice });
  });

  it('never links a farm record, matching local ID, or name alone to an animal', () => {
    expect(findActivityAnimal({ ...record, activityType: 'farm' }, [cow], [])).toBeNull();
    expect(findActivityAnimal({ activityType: 'animal', animalKind: 'cattle', animalId: '7', animalName: cow.name }, [cow], [])).toBeNull();
    expect(findActivityAnimal({ ...record, animalKind: 'calf' }, [cow], [])).toBeNull();
  });

  it('requires an unambiguous birth date and compatible name when stable identity was not recorded', () => {
    const old = { ...record, animalSyncId: '', animalIdentificationNumber: '' };
    expect(findActivityAnimal(old, [cow], [])?.animal).toBe(cow);
    expect(findActivityAnimal({ ...old, animalBirthday: '' }, [cow], [])).toBeNull();
    expect(findActivityAnimal(old, [{ ...cow, birthday: '2024-04-05' }], [])).toBeNull();
    expect(findActivityAnimal(old, [{ ...cow, name: '別牛' }], [])).toBeNull();
    expect(findActivityAnimal(old, [cow, { ...cow, id: 99 }], [])).toBeNull();
    expect(findActivityAnimal(old, [{ ...cow, earTag: '12' }], [])).toBeNull();
  });

  it('rejects contradictory stronger identifiers and duplicate stable identifiers', () => {
    expect(findActivityAnimal(record, [{ ...cow, syncId: 'other-sync' }], [])).toBeNull();
    expect(findActivityAnimal(record, [{ ...cow, identificationNumber: 'other-identification' }], [])).toBeNull();
    expect(findActivityAnimal(record, [cow, { ...cow, id: 8 }], [])).toBeNull();
    expect(findActivityAnimal(record, [{ ...cow, deletedAt: '2026-11-03T01:00:00.000Z' }], [])).toBeNull();
  });

  it('keeps calves separate and can follow a temporary number through its persisted sync identity', () => {
    const calf = { id: 7, calfNumber: 'TEMP-fixture-calf', name: '', birthday: '2026-11-01', syncRecordId: 'manual-calf:fixture-stable' };
    const note = { activityType: 'animal', ...activityAnimalFields('calf', calf) };
    const numbered = { ...calf, id: 8, calfNumber: '0012', name: '検証子牛' };
    expect(findActivityAnimal(note, [cow], [numbered])).toEqual({ kind: 'calf', animal: numbered });
    expect(activityAnimalFields('calf', { ...calf, syncRecordId: 'local-calf:7' }).animalSyncId).toBe('');
    expect(activityAnimalFields('cattle', { ...cow, syncId: 'ear:0012' }).animalSyncId).toBe('');
    expect(activityAnimalFields('cattle', { ...cow, syncId: '7' }).animalSyncId).toBe('');
  });

  it('does not equate numeric legacy calving IDs from different devices', () => {
    const calf = { id: 7, calfNumber: '0012', name: '検証子牛', birthday: '2026-11-01', calvingId: '123' };
    const legacyReference = { activityType: 'animal', ...activityAnimalFields('calf', calf), animalSyncId: 'calving:123' };
    const other = { ...calf, id: 99, calfNumber: '0013', birthday: '2026-11-02', syncRecordId: 'calving:123' };
    expect(activityAnimalFields('calf', calf).animalSyncId).toBe('');
    expect(activityAnimalFields('calf', other).animalSyncId).toBe('');
    expect(findActivityAnimal(legacyReference, [], [other])).toBeNull();
    expect(activityAnimalFields('calf', { ...calf, calvingId: 'calving_1793692800000_fixture' }).animalSyncId)
      .toBe('calving:calving_1793692800000_fixture');
  });
});
