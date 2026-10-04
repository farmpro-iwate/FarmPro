import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CalfDetail } from './CalfDetail';
import * as repository from '../storage/repository';
import * as calfApi from '../services/calfApi';
import * as feedApi from '../services/feedInventoryApi';
import * as expensesApi from '../services/expensesApi';
import * as farmExpenseApi from '../services/farmExpenseAllocation';
import * as allExpenseApi from '../services/allFarmExpenseAllocation';
import * as acquisitionApi from '../services/breedingCattleAcquisitionAllocation';
import * as salesApi from '../services/salesApi';

describe('calf chart activity registration route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(repository, 'getRecordById').mockResolvedValue({
      id: 55,
      calfNumber: '5754',
      name: '子牛A',
      birthday: '2026-08-01',
      sex: 'オス',
      managementStatus: '哺育中',
    } as any);
    vi.spyOn(repository, 'getAllRecords').mockResolvedValue([] as any);
    vi.spyOn(feedApi, 'getAnimalFeedCostTotal').mockResolvedValue(0);
    vi.spyOn(expensesApi, 'getAnimalExpenseTotals').mockResolvedValue({ medical: 0, breeding: 0, other: 0, nonFeedTotal: 0 } as any);
    vi.spyOn(farmExpenseApi, 'getCalfYearlyFarmExpenseAllocation').mockResolvedValue(0);
    vi.spyOn(allExpenseApi, 'getAllFarmExpenseAllocation').mockResolvedValue(0);
    vi.spyOn(acquisitionApi, 'getBreedingCattleAcquisitionAllocationForCalf').mockResolvedValue({ amount: 0, allocationParity: 7 } as any);
    vi.spyOn(salesApi, 'getSalesList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'promoteCalf').mockResolvedValue({} as any);
    vi.spyOn(calfApi, 'registerCalfEarTag').mockResolvedValue({} as any);
    vi.spyOn(calfApi, 'registerCalfName').mockResolvedValue({} as any);
  });

  it('opens activity choices and prefills the calf on the treatment registration link', async () => {
    render(
      <MemoryRouter initialEntries={['/calves/55']}>
        <Routes><Route path="/calves/:id" element={<CalfDetail />} /></Routes>
      </MemoryRouter>,
    );

    const activityButton = await screen.findByRole('button', { name: '活動登録' });
    fireEvent.click(activityButton);

    const treatmentLink = screen.getByRole('link', { name: '治療' });
    const url = new URL(treatmentLink.getAttribute('href')!, 'https://example.test');
    expect(url.pathname).toBe('/treatments/new');
    expect(url.searchParams.get('targetNumber')).toBe('5754');
    expect(url.searchParams.get('targetName')).toBe('子牛A');
    expect(url.searchParams.get('returnTo')).toBe('/calves/55');
  });
});
