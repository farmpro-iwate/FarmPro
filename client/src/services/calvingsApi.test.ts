import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getRecordById, saveRecord } from '../storage/repository';
import {
  createCalving,
  deleteCalving,
  fetchCalving,
  registerCalvingToCalfLedger,
  updateCalving,
} from './calvingsApi';

describe('calvingsApi registration, edit, calf linkage and delete', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('farmpro.plan', 'free');
    await clearStore('calvings');
    await clearStore('calves');
    await clearStore('breedings');
  });

  it('分娩記録を登録して編集できる', async () => {
    const created = await createCalving({
      cowId: '9130',
      cowName: 'はな',
      actualCalvingDate: '2026-09-29',
      calfName: 'C-001',
      calfSex: 'メス',
      birthWeightKg: 31,
      calvingResult: '自然分娩',
      colostrumStatus: '未確認',
      memo: '登録時',
      registeredToCalfLedger: false,
    });

    expect(created.id).toBeTruthy();

    await updateCalving(String(created.id), {
      ...created,
      birthWeightKg: 32,
      colostrumStatus: '確認済み',
      memo: '編集後',
    });

    const reloaded = await fetchCalving(String(created.id));
    expect(reloaded.cowId).toBe('9130');
    expect(reloaded.cowName).toBe('はな');
    expect(reloaded.birthWeightKg).toBe(32);
    expect(reloaded.colostrumStatus).toBe('確認済み');
    expect(reloaded.memo).toBe('編集後');
  });

  it('通常分娩を子牛台帳へ登録すると分娩記録と子牛が相互に紐づく', async () => {
    const created = await createCalving({
      cowId: '9130',
      cowName: 'はな',
      actualCalvingDate: '2026-09-29',
      calfName: 'C-002',
      calfSex: 'オス',
      birthWeightKg: 34,
      calvingResult: '自然分娩',
      colostrumStatus: '確認済み',
      memo: '子牛連携テスト',
      registeredToCalfLedger: false,
    });

    const result = await registerCalvingToCalfLedger(String(created.id));

    expect(result.ok).toBe(true);
    expect(result.calving.registeredToCalfLedger).toBe(true);
    expect(result.calving.calfId).toBe(String(result.calf.id));
    expect(result.calf.calvingId).toBe(String(created.id));
    expect(result.calf.earTag).toBe('C-002');
    expect(result.calf.recipientCowId).toBe('9130');
    expect(result.calf.recipientCowName).toBe('はな');
    expect(result.calf.birthDate).toBe('2026-09-29');
    expect(result.calf.birthWeightKg).toBe(34);
  });

  it('死産は子牛台帳へ登録しない', async () => {
    const created = await createCalving({
      cowId: '9130',
      cowName: 'はな',
      actualCalvingDate: '2026-09-29',
      calfName: '',
      calfSex: '不明',
      birthWeightKg: '',
      calvingResult: '死産',
      colostrumStatus: '未確認',
      registeredToCalfLedger: false,
    });

    await expect(registerCalvingToCalfLedger(String(created.id))).rejects.toThrow(
      '死産の記録は子牛台帳へ登録しません。',
    );

    const calves = await getRecordById<any>('calves', 1);
    expect(calves).toBeUndefined();
  });

  it('繁殖記録に連携した分娩を削除すると繁殖記録を受胎へ戻し、子牛は自動削除しない', async () => {
    await saveRecord('breedings', {
      id: 'breed-1',
      cowEarTag: '9130',
      cowName: 'はな',
      breedingMethod: '種付',
      breedingStatus: '受胎',
      pregnancyResult: '受胎',
      expectedCalvingDate: '2026-09-29',
      inseminationDate: '2025-12-18',
      calvingId: '',
      calvedAt: '',
    } as any);

    const created = await createCalving({
      cowId: '9130',
      cowName: 'はな',
      actualCalvingDate: '2026-09-29',
      calfName: 'C-003',
      calfSex: 'メス',
      birthWeightKg: 30,
      calvingResult: '自然分娩',
      colostrumStatus: '確認済み',
      breedingId: 'breed-1',
      registeredToCalfLedger: false,
    });

    const linkedBreeding = await getRecordById<any>('breedings', 'breed-1');
    expect(linkedBreeding.breedingStatus).toBe('分娩済み');
    expect(String(linkedBreeding.calvingId)).toBe(String(created.id));

    const registered = await registerCalvingToCalfLedger(String(created.id));
    const calfId = registered.calf.id;

    await deleteCalving(String(created.id));

    await expect(fetchCalving(String(created.id))).rejects.toThrow('分娩記録が見つかりません。');

    const revertedBreeding = await getRecordById<any>('breedings', 'breed-1');
    expect(revertedBreeding.breedingStatus).toBe('受胎');
    expect(revertedBreeding.calvingId).toBe('');
    expect(revertedBreeding.calvedAt).toBe('');

    const remainingCalf = await getRecordById<any>('calves', calfId);
    expect(remainingCalf).toBeTruthy();
    expect(remainingCalf.calvingId).toBe(String(created.id));
  });
});
