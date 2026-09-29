import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SynchronizationBreedingExecutionForm } from './SynchronizationBreedingExecutionForm';
import * as breedingApi from '../services/breedingApi';
import * as scheduleApi from '../services/scheduleApi';
import * as settingsApi from '../services/settingsApi';

vi.mock('../components/SireSearchField', () => ({
  SireSearchField: ({ value, onChange, label = '種雄牛' }: any) => (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value, 10)} />
  ),
}));
vi.mock('../components/InseminatorSearchField', () => ({
  InseminatorSearchField: ({ value, onChange, label = '授精師' }: any) => (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value, 20)} />
  ),
}));
vi.mock('../components/PartnerSearchField', () => ({
  PartnerSearchField: ({ value, onChange, label }: any) => (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value, 30)} />
  ),
}));

describe('SynchronizationBreedingExecutionForm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ estrousCycleDays: 21 } as any);
    vi.spyOn(scheduleApi, 'getSchedule').mockResolvedValue({
      id: 's1',
      scheduleType: '種付',
      title: '定時人工授精',
      targetNumber: '9130',
      targetName: 'はな',
      dueDate: '2026-09-29',
      status: '未完了',
      note: '',
      synchronizationProgramId: 'p1',
      synchronizationProgramName: '9月同期',
      synchronizationPurpose: '定時人工授精',
      synchronizationStartDate: '2026-09-20',
      synchronizationStep: 9,
    } as any);
    vi.spyOn(scheduleApi, 'updateSchedule').mockResolvedValue({ id: 's1' } as any);
  });

  afterEach(() => cleanup());

  it('同期化予定から人工授精を保存し、次回予定を計算して元予定を完了にする', async () => {
    const create = vi.spyOn(breedingApi, 'createBreeding').mockResolvedValue({ id: 'b1' } as any);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/sync-exec/insemination?targetNumber=9130&targetName=%E3%81%AF%E3%81%AA&actionDate=2026-09-29&programId=p1&programName=9%E6%9C%88%E5%90%8C%E6%9C%9F&sourceScheduleId=s1&returnTo=%2Fcattle%2F1']}>
        <Routes>
          <Route path="/sync-exec/:kind" element={<SynchronizationBreedingExecutionForm />} />
          <Route path="/cattle/:id" element={<div>個体カルテへ戻った</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText('種雄牛'), '福之姫');
    await user.type(screen.getByLabelText('授精師'), '担当A');
    await user.click(screen.getByRole('button', { name: '実施を保存' }));

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      cowEarTag: '9130',
      cowName: 'はな',
      inseminationDate: '2026-09-29',
      breedingMethod: '種付',
      breedingStatus: '種付実施',
      bullName: '福之姫',
      inseminatorName: '担当A',
      synchronizationProgramId: 'p1',
      synchronizationProgramName: '9月同期',
      sourceScheduleId: 's1',
      nextHeatExpectedDate: '2026-10-20',
      pregnancyCheckExpectedDate: '2026-11-10',
      expectedCalvingDate: '2027-07-11',
    }));

    expect(scheduleApi.updateSchedule).toHaveBeenCalledWith('s1', expect.objectContaining({ status: '完了' }));
    expect(await screen.findByText('個体カルテへ戻った')).toBeInTheDocument();
  });
});
