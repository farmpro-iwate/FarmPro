import { describe, expect, it } from 'vitest';
import type { AnimalLifecycle, AnimalLifecycleChange } from '../types/animalLifecycle';
import { applyAnimalLifecycleChange, assertAnimalLifecycleIdentity, getAnimalLifecycleLabel,
  getAnimalLifecycleState, isAnimalBreedingInactive, isAnimalDeceased, validateAnimalLifecycle } from './animalLifecycle';

const now = new Date('2026-11-03T03:00:00.000Z');
const culling: AnimalLifecycleChange = { type: 'culling', date: '2026-10-30', reason: '繁殖終了', note: '経過を記録', route: 'fattening' };
const death: AnimalLifecycleChange = { type: 'death', date: '2026-11-02', reason: '死亡を確認', note: '確認済み' };
const cow = { birthday: '2023-01-01' };

describe('animal lifecycle decisions', () => {
  it('culling ends breeding eligibility from its date while death applies only from the death date', () => {
    const culled = applyAnimalLifecycleChange(cow, culling, undefined, now);
    const deceased = applyAnimalLifecycleChange({ ...cow, lifecycle: culled }, death, culled, now);
    const animal = { ...cow, lifecycle: deceased };
    expect(getAnimalLifecycleState(animal, '2026-10-29')).toMatchObject({ deceased: false, culled: false });
    expect(getAnimalLifecycleState(animal, '2026-10-30')).toMatchObject({ deceased: false, culled: true, route: 'fattening' });
    expect(isAnimalBreedingInactive(animal, '2026-10-30')).toBe(true);
    expect(isAnimalDeceased(animal, '2026-11-01')).toBe(false);
    expect(isAnimalDeceased(animal, '2026-11-02')).toBe(true);
    expect(deceased.culling).toEqual(culled.culling);
    expect(getAnimalLifecycleLabel(animal, '2026-10-30')).toBe('廃用・肥育中');
    expect(getAnimalLifecycleLabel(animal, '2026-11-02')).toBe('死亡');
  });

  it('legacy calf death stays inactive without inventing a death date', () => {
    const legacy = { managementStatus: '死亡・その他' };
    expect(getAnimalLifecycleState(legacy, '2026-11-03')).toMatchObject({ deceased: true, legacyDeceased: true, deathDate: '' });
    expect(isAnimalBreedingInactive(legacy)).toBe(true);
    const lifecycle = applyAnimalLifecycleChange({ ...cow, ...legacy }, death, undefined, now);
    expect(getAnimalLifecycleState({ ...legacy, lifecycle }, '2026-11-01')).toMatchObject({ deceased: false, legacyDeceased: false });
  });

  it.each([
    { ...death, date: '2026-02-30' }, { ...death, date: '2026-11-04' }, { ...death, date: '2022-12-31' },
    { ...death, reason: '  ' }, { ...culling, route: undefined },
  ])('rejects an invalid formal change without altering the animal: %j', change => {
    expect(() => applyAnimalLifecycleChange(cow, change as AnimalLifecycleChange, undefined, now)).toThrow();
    expect(cow).toEqual({ birthday: '2023-01-01' });
  });

  it('does not create culling on a deceased animal or move an existing culling past death', () => {
    const deceased = applyAnimalLifecycleChange(cow, death, undefined, now);
    expect(() => applyAnimalLifecycleChange({ ...cow, lifecycle: deceased }, culling, deceased, now)).toThrow('死亡した牛');
    expect(() => applyAnimalLifecycleChange({ ...cow, managementStatus: '死亡・その他' }, culling, undefined, now)).toThrow('死亡した牛');
    const culled = applyAnimalLifecycleChange(cow, culling, undefined, now);
    expect(() => applyAnimalLifecycleChange({ ...cow, lifecycle: culled }, { ...death, date: '2026-10-29' }, culled, now)).toThrow('死亡日より後');
    const both = applyAnimalLifecycleChange({ ...cow, lifecycle: culled }, death, culled, now);
    const edited = applyAnimalLifecycleChange({ ...cow, lifecycle: both }, { ...culling, reason: '理由を修正' }, both, now);
    expect(edited.death).toEqual(both.death);
    expect(edited.culling?.reason).toBe('理由を修正');
    expect(() => applyAnimalLifecycleChange({ ...cow, lifecycle: both }, { ...culling, date: '2026-11-03' }, both, now)).toThrow('死亡日より後');
  });

  it('allows an exact retry but refuses to overwrite a different decision using stale expectations', () => {
    const lifecycle = applyAnimalLifecycleChange(cow, culling, undefined, now);
    const animal = { ...cow, lifecycle };
    expect(applyAnimalLifecycleChange(animal, culling, undefined, now)).toBe(lifecycle);
    expect(() => applyAnimalLifecycleChange(animal, { ...culling, route: 'sale' }, undefined, now)).toThrow('記録が変更');
    expect(applyAnimalLifecycleChange(animal, { ...culling, route: 'sale' }, lifecycle, now).culling?.recordedAt).toBe(lifecycle.culling?.recordedAt);
  });

  it('keeps unknown lifecycle and event fields while refusing an unsupported or malformed format', () => {
    const lifecycle = applyAnimalLifecycleChange(cow, culling, undefined, now);
    lifecycle.future = { amount: '001.20', value: null };
    lifecycle.culling!.future = [null, '', '001'];
    const changed = applyAnimalLifecycleChange({ ...cow, lifecycle }, death, lifecycle, now);
    expect(changed.future).toEqual(lifecycle.future);
    expect(changed.culling).toEqual(lifecycle.culling);
    for (const invalid of [{ version: 2 }, { version: 1, death: { date: 'bad' } }, null]) {
      const before = structuredClone(invalid);
      expect(() => applyAnimalLifecycleChange({ ...cow, lifecycle: invalid as unknown as AnimalLifecycle }, death, undefined, now)).toThrow();
      expect(invalid).toEqual(before);
    }
    expect(() => validateAnimalLifecycle(changed, { today: '2026-11-03', birthday: cow.birthday })).not.toThrow();
  });

  it('checks selected identities including leading zero tags, sync IDs and birthday', () => {
    const identity = { id: 7, syncId: 'cow:fixture', identificationNumber: '0000000123', earTag: '0123', birthday: '2023-01-01' };
    expect(() => assertAnimalLifecycleIdentity(identity, { ...identity })).not.toThrow();
    for (const change of [{ id: 8 }, { syncId: 'cow:other' }, { identificationNumber: '0000000999' }, { earTag: '123' }, { birthday: '2023-02-01' }]) {
      expect(() => assertAnimalLifecycleIdentity({ ...identity, ...change }, identity)).toThrow('識別情報が変更');
    }
  });
});
