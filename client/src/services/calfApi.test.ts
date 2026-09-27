import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';
import { clearStore } from '../storage/repository';
import { createCalf, getCalf, updateCalf } from './calfApi';
import type { CalfInput } from '../types/calf';

function etCalfInput(): CalfInput {
  return {
    calfNumber: 'ET-001',
    identificationNumber: '',
    name: 'ET子牛',
    birthday: '2026-09-27',
    sex: '雌',
    motherName: '供卵牛A',
    motherCowId: 'DONOR-001',
    motherCowName: '供卵牛A',
    breedingMethod: '受精卵移植',
    recipientCowId: 'RECIP-001',
    recipientCowName: '受卵牛A',
    geneticMotherCowId: 'DONOR-001',
    geneticMotherCowName: '供卵牛A',
    sireName: '父牛A',
    startWeight: 35,
    currentWeight: 35,
    elapsedDays: 0,
    milkAmount: 0,
    starterAmount: 0,
    feedingMethod: '人工哺育',
    weaningPlannedDate: '',
    weaningDate: '',
    weaningStatus: '離乳前',
    weaningWeight: 0,
    weaningStarterAmount: 0,
    milkEndDate: '',
    managementStatus: '育成中',
    note: 'ET登録テスト',
  };
}

describe('calfApi ET manual registration', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await clearStore('calves');
  });

  it('ETの受卵牛・供卵牛・父牛を保存して再取得できる', async () => {
    const saved = await createCalf(etCalfInput());
    const reloaded = await getCalf(String(saved.id));

    expect(reloaded.breedingMethod).toBe('受精卵移植');
    expect(reloaded.recipientCowId).toBe('RECIP-001');
    expect(reloaded.recipientCowName).toBe('受卵牛A');
    expect(reloaded.geneticMotherCowId).toBe('DONOR-001');
    expect(reloaded.geneticMotherCowName).toBe('供卵牛A');
    expect(reloaded.motherName).toBe('供卵牛A');
    expect(reloaded.sireName).toBe('父牛A');
  });

  it('ET情報を編集しても受卵牛・供卵牛の関係を保持できる', async () => {
    const saved = await createCalf(etCalfInput());

    await updateCalf(String(saved.id), {
      ...etCalfInput(),
      recipientCowName: '受卵牛B',
      geneticMotherCowName: '供卵牛B',
      motherName: '供卵牛B',
      motherCowName: '供卵牛B',
      sireName: '父牛B',
    });

    const reloaded = await getCalf(String(saved.id));

    expect(reloaded.breedingMethod).toBe('受精卵移植');
    expect(reloaded.recipientCowName).toBe('受卵牛B');
    expect(reloaded.geneticMotherCowName).toBe('供卵牛B');
    expect(reloaded.motherName).toBe('供卵牛B');
    expect(reloaded.sireName).toBe('父牛B');
  });
});
