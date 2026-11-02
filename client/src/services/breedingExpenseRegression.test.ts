import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStore, getAllRecords } from '../storage/repository';
import { createBreeding, updateBreeding } from './breedingApi';
import type { BreedingInput } from '../types/breeding';
import type { ExpenseRecord } from './expensesApi';

vi.mock('./authClient', () => ({
  getAuthToken: () => '',
  getStoredAuthUser: () => ({ id: 'fixture-et-expense-user', farmId: 'fixture-et-expense-farm' }),
}));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: () => 'free' }));

const input = (changes: Partial<BreedingInput> = {}): BreedingInput => ({
  cowEarTag: 'TEST-001', cowName: 'テスト牛', heatDate: '2026-10-01',
  breedingMethod: '受精卵移植', breedingStatus: '移植実施',
  transferDate: '2026-10-08', transferPlannedDate: '', transferCancelReason: '',
  embryoCost: '30000', transferProcedureCost: '10000', transferOtherCost: '',
  transferCost: '', inseminationDate: '', bullName: '', inseminatorName: '',
  embryoNumber: '', collectionDate: '', embryoType: '', donorCowName: '',
  donorCowEarTag: '', embryoSireName: '', embryoGrade: '', strawNumber: '',
  supplierName: '', transferTechnician: '', nextHeatExpectedDate: '',
  pregnancyCheckExpectedDate: '', pregnancyCheckDate: '', pregnancyResult: '',
  recheckExpectedDate: '', expectedCalvingDate: '', note: '', ...changes,
});

async function expensesByDetail() {
  return new Map((await getAllRecords<ExpenseRecord>('expenses')).map(record => [record.sourceDetail, record]));
}

beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  for (const store of ['breedings', 'expenses', 'metadata', 'masters'] as const) await clearStore(store);
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Free fixture must not use the network'); }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('ET費用と経費同期の回帰テスト', () => {
  it('新規ETの移植料と受精卵代を別々に同期する', async () => {
    const saved = await createBreeding(input());
    const expenses = await expensesByDetail();
    expect(expenses.get('embryo')).toMatchObject({ amount: '30000', sourceType: 'breeding', sourceId: String(saved.id) });
    expect(expenses.get('transfer-procedure')?.amount).toBe('10000');
    expect(expenses.has('transfer')).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('同じ記録の編集では同じ費用区分を更新する', async () => {
    const saved = await createBreeding(input());
    const before = await expensesByDetail();
    await updateBreeding(saved.id, input({ embryoCost: '32000' }));
    const expenses = await expensesByDetail();
    expect(expenses.size).toBe(2);
    expect(expenses.get('embryo')).toMatchObject({ id: before.get('embryo')!.id, amount: '32000' });
    expect(expenses.get('transfer-procedure')!.id).toBe(before.get('transfer-procedure')!.id);
  });
  it('旧ET費と新内訳が混在する記録を保存前に拒否する', async () => {
    await expect(createBreeding(input({ transferCost: '11000' }))).rejects.toThrow('旧ET費');
    expect(await getAllRecords('breedings')).toEqual([]);
    expect(await getAllRecords('expenses')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('旧ET費だけの記録は従来の経費として扱う', async () => {
    await createBreeding(input({ transferCost: '11000', embryoCost: '', transferProcedureCost: '' }));
    const expenses = await expensesByDetail();
    expect(expenses.get('transfer')?.amount).toBe('11000');
    expect(expenses.has('embryo')).toBe(false);
  });
});
