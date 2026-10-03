import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BreedingExecutionForm } from './BreedingExecutionForm';
import * as breedingApi from '../services/breedingApi';
import * as settingsApi from '../services/settingsApi';
import * as scheduleApi from '../services/scheduleApi';

vi.mock('../components/InseminatorSearchField', () => ({ InseminatorSearchField: () => null }));
vi.mock('../components/PartnerSearchField', () => ({ PartnerSearchField: () => null }));
vi.mock('../components/SireSearchField', () => ({ SireSearchField: () => null }));

const breeding = {
  id: 101,
  cowEarTag: '0254',
  cowName: 'テスト母牛',
  heatDate: '2026-09-17',
  estrusType: '',
  breedingMethod: '受精卵移植',
  breedingStatus: '移植予定',
  inseminationDate: '',
  bullName: '',
  inseminatorName: '',
  transferPlannedDate: '2026-09-24',
  transferDate: '',
  transferCancelReason: '',
  embryoNumber: '',
  collectionDate: '',
  embryoType: '未選択',
  donorCowName: '',
  donorCowEarTag: '',
  embryoSireName: '',
  embryoGrade: '',
  strawNumber: '',
  supplierName: '',
  transferTechnician: '',
  nextHeatExpectedDate: '2026-10-15',
  pregnancyCheckExpectedDate: '2026-11-05',
  pregnancyCheckDate: '',
  pregnancyResult: '未鑑定',
  recheckExpectedDate: '',
  expectedCalvingDate: '2027-07-06',
  note: '',
};

describe('BreedingExecutionForm ET saved schedule dates', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(breedingApi, 'getBreeding').mockResolvedValue({ ...breeding } as any);
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ estrousCycleDays: 21 } as any);
    vi.spyOn(scheduleApi, 'completeSchedules').mockResolvedValue([] as any);
  });

  it('saves next heat, pregnancy check and calving dates from the ET heat date even when transfer date differs', async () => {
    const update = vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue({ id: 101 } as any);

    render(
      <MemoryRouter initialEntries={['/breedings/101/transfer']}>
        <Routes>
          <Route path="/breedings/:id/transfer" element={<BreedingExecutionForm kind="transfer" />} />
        </Routes>
      </MemoryRouter>,
    );

    const transferDate = await screen.findByLabelText(/移植実施日/);
    fireEvent.change(transferDate, { target: { value: '2026-09-25' } });
    fireEvent.click(screen.getByRole('button', { name: '受精卵移植を保存' }));

    await waitFor(() => expect(update).toHaveBeenCalledWith(
      '101',
      expect.objectContaining({
        transferDate: '2026-09-25',
        nextHeatExpectedDate: '2026-10-08',
        pregnancyCheckExpectedDate: '2026-10-29',
        expectedCalvingDate: '2027-06-29',
      }),
    ));
  });
});
