import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CattleDetail } from './CattleDetail';
import { createBreeding } from '../services/breedingApi';
import {
  getAllRecords,
  getRecordById,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';

vi.mock('../storage/repository', () => ({
  getAllRecords: vi.fn(),
  getRecordById: vi.fn(),
  saveRecord: vi.fn(),
  saveRecordPreservingTimestamps: vi.fn(),
  deleteRecord: vi.fn(),
}));

vi.mock('../services/api', () => ({
  getCattle: vi.fn(async () => ({
    id: 'cattle-1',
    earTag: '7358',
    identificationNumber: '',
    name: 'はなみつ',
    birthday: '2022-01-01',
    sex: '雌',
    sire: '',
    dam: '',
    stage: '繁殖牛',
    note: '',
    createdAt: '2022-01-01T00:00:00.000Z',
    updatedAt: '2022-01-01T00:00:00.000Z',
  })),
}));

vi.mock('../services/vaccineApi', () => ({
  getVaccineList: vi.fn(async () => []),
}));

vi.mock('../services/scheduleApi', () => ({
  getScheduleList: vi.fn(async () => []),
}));

vi.mock('../services/treatmentApi', () => ({
  getTreatmentList: vi.fn(async () => []),
}));

vi.mock('../services/salesApi', () => ({
  getSalesList: vi.fn(async () => []),
}));

vi.mock('../services/feedInventoryApi', () => ({
  getAnimalFeedCostTotal: vi.fn(async () => 0),
}));

vi.mock('../services/expensesApi', () => ({
  getAnimalExpenseTotals: vi.fn(async () => ({
    medical: 0,
    breeding: 0,
    other: 0,
    nonFeedTotal: 0,
  })),
  upsertExpenseBySource: vi.fn(async () => undefined),
  deleteExpenseBySource: vi.fn(async () => undefined),
}));

vi.mock('../services/breedingCattleUnallocatedAcquisitionCost', () => ({
  getBreedingCattleUnallocatedAcquisitionCost: vi.fn(async () => null),
}));

vi.mock('../services/cattleFarmExpenseAllocation', () => ({
  getCattleFarmExpenseAllocation: vi.fn(async () => 0),
}));

vi.mock('../services/allFarmExpenseAllocation', () => ({
  getAllFarmExpenseAllocation: vi.fn(async () => 0),
}));

vi.mock('../services/masterApi', () => ({
  getMasterList: vi.fn(async () => []),
  createMaster: vi.fn(async () => ({ id: 1, name: 'test' })),
}));

vi.mock('../plans/current-plan', () => ({
  getCurrentFarmProPlanId: () => 'free',
}));

vi.mock('../plans/policy', () => ({
  getFarmProPlan: () => ({ multiDeviceSync: false }),
}));

describe('発情保存から個体カルテ反映まで', () => {
  const stores: Record<string, any[]> = {
    breedings: [],
    calvings: [],
    calves: [],
  };

  beforeEach(() => {
    for (const key of Object.keys(stores)) stores[key] = [];

    vi.mocked(getAllRecords).mockImplementation(async (storeName: any) => {
      return [...(stores[String(storeName)] ?? [])] as any;
    });

    vi.mocked(getRecordById).mockImplementation(async (storeName: any, id: any) => {
      return (stores[String(storeName)] ?? []).find((row) => String(row.id) === String(id)) as any;
    });

    vi.mocked(saveRecord).mockImplementation(async (storeName: any, record: any) => {
      const key = String(storeName);
      const rows = stores[key] ?? (stores[key] = []);
      const now = '2026-09-23T03:50:00.000Z';
      const saved = {
        ...record,
        createdAt: record.createdAt ?? now,
        updatedAt: now,
      };
      const index = rows.findIndex((row) => String(row.id) === String(saved.id));
      if (index >= 0) rows[index] = saved;
      else rows.push(saved);
      return saved as any;
    });

    vi.mocked(saveRecordPreservingTimestamps).mockImplementation(async (storeName: any, record: any) => {
      const key = String(storeName);
      const rows = stores[key] ?? (stores[key] = []);
      const saved = {
        ...record,
        createdAt: record.createdAt ?? '2026-09-23T03:50:00.000Z',
        updatedAt: record.updatedAt ?? '2026-09-23T03:50:00.000Z',
      };
      const index = rows.findIndex((row) => String(row.id) === String(saved.id));
      if (index >= 0) rows[index] = saved;
      else rows.push(saved);
      return saved as any;
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('保存した発情記録を同じ牛の個体ストーリーへ表示する', async () => {
    await createBreeding({
      cowEarTag: '7358',
      cowName: 'はなみつ',
      heatDate: '2026-09-23',
      estrusType: '自然発情',
      breedingMethod: '未選択',
      breedingStatus: '発情確認',
      inseminationDate: '',
      inseminationCost: '',
      bullName: '',
      bullMasterId: undefined,
      inseminatorName: '',
      inseminatorMasterId: undefined,
      transferPlannedDate: '',
      transferDate: '',
      transferCost: '',
      transferCancelReason: '',
      embryoNumber: '',
      collectionDate: '',
      embryoType: '未選択',
      donorCowName: '',
      donorCowEarTag: '',
      embryoSireName: '',
      embryoSireMasterId: undefined,
      embryoGrade: '',
      strawNumber: '',
      supplierName: '',
      supplierMasterId: undefined,
      transferTechnician: '',
      transferTechnicianMasterId: undefined,
      nextHeatExpectedDate: '',
      pregnancyCheckExpectedDate: '',
      pregnancyCheckDate: '',
      pregnancyCheckCost: '',
      pregnancyResult: '未鑑定',
      recheckExpectedDate: '',
      expectedCalvingDate: '',
      estrusSigns: ['乗駕許容'],
      estrusSignsOther: '',
      synchronizationProgramId: undefined,
      synchronizationProgramName: undefined,
      sourceScheduleId: undefined,
      note: 'テスト発情',
    });

    expect(stores.breedings).toHaveLength(1);
    expect(stores.breedings[0].cowEarTag).toBe('7358');
    expect(stores.breedings[0].heatDate).toBe('2026-09-23');

    render(
      <MemoryRouter initialEntries={['/cattle/cattle-1']}>
        <Routes>
          <Route path="/cattle/:id" element={<CattleDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '個体カルテ：はなみつ' })).toBeInTheDocument();
    expect(await screen.findByText('2026-09-23')).toBeInTheDocument();
    expect(screen.getByText('発情を確認')).toBeInTheDocument();
    expect(screen.getByText('テスト発情')).toBeInTheDocument();
  });
});
