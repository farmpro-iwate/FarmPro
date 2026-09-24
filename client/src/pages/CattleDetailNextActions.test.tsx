import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CattleDetail } from './CattleDetail';
import * as cattleApi from '../services/api';
import * as breedingApi from '../services/breedingApi';
import * as vaccineApi from '../services/vaccineApi';
import * as scheduleApi from '../services/scheduleApi';
import * as treatmentApi from '../services/treatmentApi';
import * as salesApi from '../services/salesApi';
import * as repository from '../storage/repository';
import * as feedInventoryApi from '../services/feedInventoryApi';
import * as expensesApi from '../services/expensesApi';
import * as acquisitionApi from '../services/breedingCattleUnallocatedAcquisitionCost';
import * as cattleFarmExpenseApi from '../services/cattleFarmExpenseAllocation';
import * as allFarmExpenseApi from '../services/allFarmExpenseAllocation';

describe('CattleDetail next actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(cattleApi, 'getCattle').mockResolvedValue({
      id: '123',
      earTag: '7358',
      name: 'はなみつ',
      birthday: '2020-01-01',
    } as any);

    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([
      {
        id: 'b-old',
        cowEarTag: '7358',
        cowName: 'はなみつ',
        breedingMethod: '受精卵移植',
        breedingStatus: '移植予定',
        heatDate: '2026-09-06',
        transferPlannedDate: '2026-09-13',
        transferDate: '',
        pregnancyCheckDate: '',
        pregnancyResult: '未鑑定',
      },
      {
        id: 'b1',
        cowEarTag: '7358',
        cowName: 'はなみつ',
        breedingMethod: '受精卵移植',
        breedingStatus: '移植予定',
        heatDate: '2026-09-17',
        transferPlannedDate: '2026-09-24',
        transferDate: '',
        pregnancyCheckDate: '',
        pregnancyResult: '未鑑定',
      },
    ] as any);

    vi.spyOn(vaccineApi, 'getVaccineList').mockResolvedValue([]);
    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([]);
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    vi.spyOn(salesApi, 'getSalesList').mockResolvedValue([]);
    vi.spyOn(repository, 'getAllRecords').mockResolvedValue([]);
    vi.spyOn(feedInventoryApi, 'getAnimalFeedCostTotal').mockResolvedValue(0);
    vi.spyOn(expensesApi, 'getAnimalExpenseTotals').mockResolvedValue({ medical: 0, breeding: 0, other: 0, nonFeedTotal: 0 });
    vi.spyOn(acquisitionApi, 'getBreedingCattleUnallocatedAcquisitionCost').mockResolvedValue(null as any);
    vi.spyOn(cattleFarmExpenseApi, 'getCattleFarmExpenseAllocation').mockResolvedValue(0);
    vi.spyOn(allFarmExpenseApi, 'getAllFarmExpenseAllocation').mockResolvedValue(0);
  });

  it('ET予定を個体カルテの次の予定から実施画面へ開ける', async () => {
    render(
      <MemoryRouter initialEntries={['/cattle/123']}>
        <Routes>
          <Route path="/cattle/:id" element={<CattleDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect((await screen.findAllByText('受精卵移植（ET）')).length).toBe(1);
    expect(screen.queryByText('予定日：2026-09-13')).not.toBeInTheDocument();
    expect(screen.getByText('予定日：2026-09-24')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '受精卵移植を実施' });
    expect(link).toHaveAttribute(
      'href',
      '/breedings/b1/transfer?returnTo=%2Fcattle%2F123',
    );
  });
  it('ET実施済みなら同日以前のET予定scheduleを次の予定に残さない', async () => {
    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([
      {
        id: 'b-done',
        cowEarTag: '7358',
        cowName: 'はなみつ',
        breedingMethod: '受精卵移植',
        breedingStatus: '移植実施',
        heatDate: '2026-09-17',
        transferPlannedDate: '2026-09-23',
        transferDate: '2026-09-23',
        pregnancyCheckExpectedDate: '2026-11-04',
        pregnancyCheckDate: '',
        pregnancyResult: '未鑑定',
      },
    ] as any);

    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([
      {
        id: 1,
        scheduleType: 'その他',
        title: '受精卵移植（ET）',
        targetNumber: '7358',
        targetName: 'はなみつ',
        dueDate: '2026-09-13',
        status: '未完了',
        note: '古いET予定',
      },
      {
        id: 2,
        scheduleType: 'その他',
        title: '受精卵移植（ET）',
        targetNumber: '7358',
        targetName: 'はなみつ',
        dueDate: '2026-09-23',
        status: '未完了',
        note: '実施済みET予定',
      },
    ] as any);

    render(
      <MemoryRouter initialEntries={['/cattle/123']}>
        <Routes>
          <Route path="/cattle/:id" element={<CattleDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('妊娠鑑定')).toBeInTheDocument();
    expect(screen.queryByText('予定日：2026-09-13')).not.toBeInTheDocument();
    expect(screen.queryByText('予定日：2026-09-23')).not.toBeInTheDocument();
    expect(screen.queryByText('受精卵移植を実施')).not.toBeInTheDocument();
  });

});
