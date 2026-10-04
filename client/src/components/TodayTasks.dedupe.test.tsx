import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayTasks } from './TodayTasks';
import * as scheduleApi from '../services/scheduleApi';
import * as vaccineApi from '../services/vaccineApi';
import * as blvApi from '../services/blvApi';
import * as treatmentApi from '../services/treatmentApi';
import * as salesApi from '../services/salesApi';
import * as calfApi from '../services/calfApi';

describe('TodayTasks home dedupe', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0));

    vi.spyOn(vaccineApi, 'getVaccineList').mockResolvedValue([] as any);
    vi.spyOn(blvApi, 'getBlvTestList').mockResolvedValue([] as any);
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([] as any);
    vi.spyOn(salesApi, 'getSalesList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('hides only an exact ear-tag and title duplicate and keeps other schedules', async () => {
    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([
      { id: '1', title: '発情確認', targetNumber: '0254', targetName: 'おと', dueDate: '2026-10-08', status: '未完了' },
      { id: '2', title: '発情確認', targetNumber: '9999', targetName: '別牛', dueDate: '2026-10-08', status: '未完了' },
      { id: '3', title: '体重確認', targetNumber: '0254', targetName: 'おと', dueDate: '2026-10-08', status: '未完了' },
    ] as any);

    render(
      <MemoryRouter>
        <TodayTasks suppressedScheduleKeys={['0254::発情確認']} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('別牛')).toBeInTheDocument();
    expect(screen.getAllByText('発情確認')).toHaveLength(1);
    expect(screen.getByText('体重確認')).toBeInTheDocument();
    expect(screen.getByText('おと')).toBeInTheDocument();
  });
  it('opens the calf chart from a treatment task when the calf is identifiable', async () => {
    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([] as any);
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([{
      id: 't1',
      targetNumber: 'OLD-123',
      targetName: 'あいうえお',
      treatmentDate: '2026-10-03',
      progress: '治療中',
    }] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([{
      id: 89,
      calfNumber: '6891',
      name: 'あいうえお',
      birthday: '2026-07-21',
    }] as any);

    render(
      <MemoryRouter>
        <TodayTasks />
      </MemoryRouter>,
    );

    const openText = await screen.findByText('開く →');
    const cardLink = openText.closest('a');
    expect(cardLink).toHaveAttribute('href', '/calves/89');
  });

});
