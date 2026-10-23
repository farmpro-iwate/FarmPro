import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  records: new Map<string, any>(),
  expenses: new Map<string, any>(),
  saveRecord: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('../storage/repository', () => ({
  getAllRecords: vi.fn(async (store: string) => store === 'breedings' ? [...mocks.records.values()] : [...mocks.expenses.values()]),
  getRecordById: vi.fn(async (_store: string, id: string) => mocks.records.get(String(id))),
  saveRecord: mocks.saveRecord,
  saveRecordPreservingTimestamps: vi.fn(async (_store: string, record: any) => record),
  deleteRecord: vi.fn(),
}));
vi.mock('./masterApi', () => ({ createMaster: vi.fn(), getMasterList: vi.fn(async () => []) }));
vi.mock('./authClient', () => ({ getAuthToken: vi.fn(() => '') }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: vi.fn(() => 'free') }));
vi.mock('../plans/policy', () => ({ getFarmProPlan: vi.fn(() => ({ multiDeviceSync: false })) }));
vi.mock('./expensesApi', () => ({
  upsertExpenseBySource: mocks.upsert,
  deleteExpenseBySource: mocks.remove,
}));
import { createBreeding, updateBreeding } from './breedingApi';
import type { BreedingInput } from '../types/breeding';

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
} as BreedingInput);

beforeEach(() => {
  mocks.records.clear(); mocks.expenses.clear();
  vi.clearAllMocks();
  mocks.saveRecord.mockImplementation(async (_store: string, record: any) => {
    mocks.records.set(String(record.id), record);
    return record;
  });
  mocks.upsert.mockImplementation(async (expense: any) => {
    mocks.expenses.set(expense.sourceDetail, expense);
    return expense;
  });
  mocks.remove.mockImplementation(async (_type: string, _id: string, _category: string, detail: string) => {
    mocks.expenses.delete(detail);
  });
});

describe('ET費用と経費同期の回帰テスト', () => {
  it('新規ETの移植料と受精卵代を別々に同期する', async () => {
    await createBreeding(input());
    expect(mocks.expenses.get('embryo')?.amount).toBe('30000');
    expect(mocks.expenses.get('transfer-procedure')?.amount).toBe('10000');
    expect(mocks.expenses.has('transfer')).toBe(false);
  });
  it('同じ記録の編集では同じ費用区分を更新する', async () => {
    const saved = await createBreeding(input());
    await updateBreeding(saved.id, input({ embryoCost: '32000' }));
    expect(mocks.expenses.size).toBe(2);
    expect(mocks.expenses.get('embryo')?.amount).toBe('32000');
  });
  it('旧ET費と新内訳が混在する記録を保存前に拒否する', async () => {
    await expect(createBreeding(input({ transferCost: '11000' }))).rejects.toThrow('旧ET費');
    expect(mocks.saveRecord).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('旧ET費だけの記録は従来の経費として扱う', async () => {
    await createBreeding(input({ transferCost: '11000', embryoCost: '', transferProcedureCost: '' }));
    expect(mocks.expenses.get('transfer')?.amount).toBe('11000');
    expect(mocks.expenses.has('embryo')).toBe(false);
  });
});
