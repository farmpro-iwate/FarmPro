import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { setCurrentFarmProPlanId } from '../plans/current-plan';
import { clearStore, getAllRecords, saveManyRecords } from '../storage/repository';
import type { Cattle, CattleInput } from '../types/cattle';
import { createCattle } from './api';

Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true,
});

const makeFemale = (id: number): Cattle => ({
  id,
  earTag: `F${id}`,
  identificationNumber: '',
  name: `繁殖雌牛${id}`,
  birthday: '2024-01-01',
  sex: '雌',
  sire: '',
  dam: '',
  parity: 0,
  blvStatus: '未検査',
  note: '',
});

const newFemale: CattleInput = {
  earTag: 'NEW',
  identificationNumber: '',
  name: '新規繁殖雌牛',
  birthday: '2024-01-01',
  sex: '雌',
  sire: '',
  dam: '',
  parity: 0,
  blvStatus: '未検査',
  note: '',
};

describe('料金プランの繁殖雌牛頭数制限', () => {
  beforeEach(async () => {
    await clearStore('cattle');
    globalThis.localStorage?.clear();
  });

  it('Freeは10頭登録済みなら11頭目を拒否する', async () => {
    setCurrentFarmProPlanId('free');
    await saveManyRecords('cattle', Array.from({ length: 10 }, (_, index) => makeFemale(index + 1)));

    await expect(createCattle(newFemale)).rejects.toThrow('Freeプランでは繁殖雌牛を10頭まで登録できます。');
    expect(await getAllRecords('cattle')).toHaveLength(10);
  });

  it('Standardは50頭登録済みなら51頭目を拒否する', async () => {
    setCurrentFarmProPlanId('standard');
    await saveManyRecords('cattle', Array.from({ length: 50 }, (_, index) => makeFemale(index + 1)));

    await expect(createCattle(newFemale)).rejects.toThrow('Standardプランでは繁殖雌牛を50頭まで登録できます。');
    expect(await getAllRecords('cattle')).toHaveLength(50);
  });

  it('Proは51頭目も登録できる', async () => {
    setCurrentFarmProPlanId('pro');
    await saveManyRecords('cattle', Array.from({ length: 50 }, (_, index) => makeFemale(index + 1)));

    await createCattle(newFemale);
    expect(await getAllRecords('cattle')).toHaveLength(51);
  });
});
