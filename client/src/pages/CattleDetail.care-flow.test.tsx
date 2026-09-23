import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CattleDetail } from './CattleDetail';
import { createCalving } from '../services/calvingsApi';
import { createTreatment } from '../services/treatmentApi';
import { createVaccine } from '../services/vaccineApi';
import {
  getAllRecords,
  getRecordById,
  saveManyRecords,
  saveRecord,
  saveRecordPreservingTimestamps,
} from '../storage/repository';

vi.mock('../storage/repository', () => ({
  getAllRecords: vi.fn(),
  getRecordById: vi.fn(),
  saveManyRecords: vi.fn(),
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

vi.mock('../services/breedingApi', () => ({
  getBreedingList: vi.fn(async () => []),
}));

vi.mock('../services/scheduleApi', () => ({
  getScheduleList: vi.fn(async () => []),
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

vi.mock('../plans/current-plan', () => ({
  getCurrentFarmProPlanId: () => 'free',
}));

vi.mock('../plans/policy', () => ({
  getFarmProPlan: () => ({ multiDeviceSync: false }),
}));

describe('分娩・治療・ワクチン保存から個体カルテ反映まで', () => {
  const stores: Record<string, any[]> = {
    calvings: [],
    calves: [],
    treatments: [],
    vaccines: [],
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
      const now = '2026-09-23T04:00:00.000Z';
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

    vi.mocked(saveManyRecords).mockImplementation(async (storeName: any, records: any[]) => {
      const saved = [];
      for (const record of records) {
        saved.push(await vi.mocked(saveRecord)(storeName, record));
      }
      return saved as any;
    });

    vi.mocked(saveRecordPreservingTimestamps).mockImplementation(async (storeName: any, record: any) => {
      const key = String(storeName);
      const rows = stores[key] ?? (stores[key] = []);
      const saved = {
        ...record,
        createdAt: record.createdAt ?? '2026-09-23T04:00:00.000Z',
        updatedAt: record.updatedAt ?? '2026-09-23T04:00:00.000Z',
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

  it('保存した分娩・治療・ワクチンを同じ牛の個体カルテへ表示する', async () => {
    await createCalving({
      cowId: '7358',
      cattleId: 'cattle-1',
      cowName: 'はなみつ',
      expectedCalvingDate: '2026-09-20',
      actualCalvingDate: '2026-09-22',
      calfName: '子牛A',
      calfSex: '雌',
      birthWeightKg: 32,
      calvingResult: '正常',
      colostrumStatus: '確認済み',
      memo: '分娩テスト',
    });

    await createTreatment({
      recordType: '治療',
      breedingTreatmentType: '',
      targetNumber: '7358',
      targetName: 'はなみつ',
      symptom: '食欲低下',
      diagnosis: '消化不良',
      diseaseMasterId: undefined,
      treatmentProcedure: '投薬',
      treatmentProcedureMasterId: undefined,
      hoofAbnormality: '',
      nextScheduledDate: '',
      treatmentDate: '2026-09-23',
      medicine: 'テスト薬',
      dosage: '10mL',
      medicineCost: '',
      medicalFee: '',
      withdrawalEndDate: '',
      veterinarian: '',
      progress: '経過観察',
      note: '治療テスト',
      sourceScheduleId: undefined,
      synchronizationProgramId: undefined,
      synchronizationProgramName: undefined,
    });

    await createVaccine({
      targetType: '成牛',
      targetNumber: '7358',
      targetName: 'はなみつ',
      vaccineName: 'テストワクチン',
      vaccineCost: '',
      vaccinationDate: '2026-09-24',
      nextDueDate: '2027-09-24',
      status: '接種済み',
      note: 'ワクチンテスト',
    });

    expect(stores.calvings).toHaveLength(1);
    expect(stores.treatments).toHaveLength(1);
    expect(stores.vaccines).toHaveLength(1);

    render(
      <MemoryRouter initialEntries={['/cattle/cattle-1']}>
        <Routes>
          <Route path="/cattle/:id" element={<CattleDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '個体カルテ：はなみつ' })).toBeInTheDocument();

    expect(screen.getAllByText('分娩').length).toBeGreaterThan(0);
    expect(screen.getByText('結果：自然分娩')).toBeInTheDocument();
    expect(screen.getAllByText('2026-09-22').length).toBeGreaterThan(0);

    expect(screen.getAllByText('治療').length).toBeGreaterThan(0);
    expect(screen.getAllByText('食欲低下').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026-09-23').length).toBeGreaterThan(0);

    expect(screen.getAllByText('ワクチン').length).toBeGreaterThan(0);
    expect(screen.getAllByText('テストワクチン').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2026-09-24').length).toBeGreaterThan(0);
  });
});
