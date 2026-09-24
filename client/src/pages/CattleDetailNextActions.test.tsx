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
    vi.spyOn(acquisitionApi, 'getBreedingCattleUnallocatedAcquisitionCost').mockResolvedValue(null);
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

    expect(await screen.findByText('受精卵移植（ET）')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '受精卵移植を実施' });
    expect(link).toHaveAttribute(
      'href',
      '/breedings/b1/transfer?returnTo=%2Fcattle%2F123',
    );
  });
});
