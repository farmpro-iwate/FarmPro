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

const baseBreeding = {
  id: 101,
  cowEarTag: '0254',
  cowName: 'テスト母牛',
  heatDate: '2026-10-01',
  estrusType: '',
  breedingMethod: '受精卵移植',
  breedingStatus: '移植予定',
  inseminationDate: '',
  bullName: '',
  inseminatorName: '',
  transferPlannedDate: '2026-10-08',
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
  nextHeatExpectedDate: '',
  pregnancyCheckExpectedDate: '',
  pregnancyCheckDate: '',
  pregnancyResult: '未鑑定',
  recheckExpectedDate: '',
  expectedCalvingDate: '',
  note: '',
};

function renderTransfer() {
  return render(
    <MemoryRouter initialEntries={['/breedings/101/transfer']}>
      <Routes>
        <Route path="/breedings/:id/transfer" element={<BreedingExecutionForm kind="transfer" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BreedingExecutionForm linked ET schedule completion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ estrousCycleDays: 21 } as any);
    vi.spyOn(breedingApi, 'updateBreeding').mockResolvedValue({ id: 101 } as any);
    vi.spyOn(scheduleApi, 'completeSchedules').mockResolvedValue([] as any);
  });

  it('completes only the schedule linked by sourceScheduleId after ET execution', async () => {
    vi.spyOn(breedingApi, 'getBreeding').mockResolvedValue({
      ...baseBreeding,
      sourceScheduleId: '202',
    } as any);

    renderTransfer();

    expect(await screen.findByDisplayValue('2026-10-08')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '受精卵移植を保存' }));

    await waitFor(() => expect(breedingApi.updateBreeding).toHaveBeenCalled());
    await waitFor(() => expect(scheduleApi.completeSchedules).toHaveBeenCalledWith(['202']));
  });

  it('does not guess a schedule for older ET records without sourceScheduleId', async () => {
    vi.spyOn(breedingApi, 'getBreeding').mockResolvedValue({ ...baseBreeding } as any);

    renderTransfer();

    expect(await screen.findByDisplayValue('2026-10-08')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '受精卵移植を保存' }));

    await waitFor(() => expect(breedingApi.updateBreeding).toHaveBeenCalled());
    expect(scheduleApi.completeSchedules).not.toHaveBeenCalled();
  });
});
