import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, saveRecord } from '../storage/repository';
import { createCalf, deleteCalf, getCalf, updateCalf } from './calfApi';
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


describe('calfApi cloud deletion', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    await clearStore('calves');
  });

  it('クラウド削除が成功してから端末内の子牛を削除する', async () => {
    const saved = await createCalf({
      ...etCalfInput(),
      calfNumber: 'DELETE-001',
      birthday: '2026-09-28',
    });

    window.localStorage.setItem('farmpro.plan', 'standard');
    window.localStorage.setItem('farmpro.authToken', 'test-token');

    let existedWhenCloudDeleteRan = false;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';

      if (url === '/api/calves/record-sync' && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            id: `local-calf:${saved.id}`,
            calfNumber: 'DELETE-001',
            birthday: '2026-09-28',
            sex: '雌',
            motherName: '供卵牛A',
          }],
        } as Response;
      }

      if (url.includes('/api/calves/record-sync/') && method === 'DELETE') {
        existedWhenCloudDeleteRan = Boolean(await getCalf(String(saved.id)));
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        } as Response;
      }

      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    await deleteCalf(saved.id);

    expect(existedWhenCloudDeleteRan).toBe(true);
    await expect(getCalf(String(saved.id))).rejects.toThrow('指定された子牛が見つかりません。');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('クラウド削除に失敗したら端末内の子牛を残す', async () => {
    const saved = await createCalf({
      ...etCalfInput(),
      calfNumber: 'DELETE-002',
      birthday: '2026-09-29',
    });

    window.localStorage.setItem('farmpro.plan', 'standard');
    window.localStorage.setItem('farmpro.authToken', 'test-token');

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method || 'GET';

      if (url === '/api/calves/record-sync' && method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => [{
            id: `local-calf:${saved.id}`,
            calfNumber: 'DELETE-002',
            birthday: '2026-09-29',
            sex: '雌',
            motherName: '供卵牛A',
          }],
        } as Response;
      }

      if (url.includes('/api/calves/record-sync/') && method === 'DELETE') {
        return {
          ok: false,
          status: 500,
          json: async () => ({ message: '削除同期エラー' }),
        } as Response;
      }

      throw new Error(`unexpected fetch: ${method} ${url}`);
    });

    await expect(deleteCalf(saved.id)).rejects.toThrow('削除同期エラー');
    expect((await getCalf(String(saved.id))).calfNumber).toBe('DELETE-002');
  });
});


describe('calfApi legacy compatibility', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    await clearStore('calves');
  });

  it('旧形式で耳標番号が欠けた子牛があっても新規登録できる', async () => {
    await saveRecord('calves', {
      id: 1,
      name: '旧形式子牛',
      birthday: '2026-01-01',
      sex: '雌',
      motherName: '母牛A',
      managementStatus: '育成中',
    } as any);

    const saved = await createCalf({
      ...etCalfInput(),
      calfNumber: 'NEW-001',
      birthday: '2026-09-30',
    });

    expect(saved.calfNumber).toBe('NEW-001');
  });

  it('旧形式で耳標番号が欠けた子牛があっても既存子牛を編集できる', async () => {
    await saveRecord('calves', {
      id: 1,
      name: '旧形式子牛',
      birthday: '2026-01-01',
      sex: '雌',
      motherName: '母牛A',
      managementStatus: '育成中',
    } as any);

    const saved = await createCalf({
      ...etCalfInput(),
      calfNumber: 'EDIT-001',
      birthday: '2026-10-01',
    });

    await updateCalf(String(saved.id), {
      ...etCalfInput(),
      calfNumber: 'EDIT-001',
      name: '編集後',
      birthday: '2026-10-01',
    });

    expect((await getCalf(String(saved.id))).name).toBe('編集後');
  });
});


describe('calfApi legacy numeric identifiers', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    await clearStore('calves');
  });

  it('旧形式で個体識別番号が数値でも新規登録できる', async () => {
    await saveRecord('calves', {
      id: 1,
      calfNumber: 'OLD-001',
      identificationNumber: 1234567890,
      name: '旧形式子牛',
      birthday: '2026-01-01',
      sex: '雌',
      motherName: '母牛A',
      managementStatus: '育成中',
    } as any);

    const saved = await createCalf({
      ...etCalfInput(),
      calfNumber: 'NEW-002',
      identificationNumber: '0987654321',
      birthday: '2026-10-02',
    });

    expect(saved.calfNumber).toBe('NEW-002');
    expect(saved.identificationNumber).toBe('0987654321');
  });

  it('旧形式で個体識別番号が数値でも既存子牛を編集できる', async () => {
    await saveRecord('calves', {
      id: 1,
      calfNumber: 'OLD-002',
      identificationNumber: 1234567890,
      name: '旧形式子牛',
      birthday: '2026-01-02',
      sex: '雌',
      motherName: '母牛B',
      managementStatus: '育成中',
    } as any);

    const saved = await createCalf({
      ...etCalfInput(),
      calfNumber: 'EDIT-002',
      identificationNumber: '1111111111',
      birthday: '2026-10-03',
    });

    await updateCalf(String(saved.id), {
      ...etCalfInput(),
      calfNumber: 'EDIT-002',
      identificationNumber: '1111111111',
      name: '編集確認',
      birthday: '2026-10-03',
    });

    const reloaded = await getCalf(String(saved.id));
    expect(reloaded.name).toBe('編集確認');
    expect(reloaded.identificationNumber).toBe('1111111111');
  });
});
