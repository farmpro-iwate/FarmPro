import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent } from '@testing-library/react';
import { TreatmentForm } from '../pages/TreatmentForm';
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
  it('opens the compact continuation form directly from a treatment task', async () => {
    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([] as any);
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([{
      id: 't1',
      targetNumber: 'OLD-123',
      targetName: 'あいうえお',
      treatmentDate: '2026-10-03',
      progress: '治療中',
      symptom: '下痢',
    }] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([{
      id: 89,
      calfNumber: '6891',
      name: 'あいうえお',
      birthday: '2026-07-21',
    }] as any);

    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<TodayTasks suppressedScheduleKeys={[]} />} />
          <Route path="/treatments/new" element={<TreatmentForm mode="create" />} />
        </Routes>
      </MemoryRouter>,
    );

    const openText = await screen.findByText('開く →');
    const cardLink = openText.closest('a');
    const params = new URL(cardLink!.getAttribute('href')!, 'http://localhost').searchParams;
    expect(params.get('targetNumber')).toBe('6891');
    expect(params.get('targetName')).toBe('あいうえお');
    expect(params.get('sourceTreatmentId')).toBe('t1');
    fireEvent.click(cardLink!);
    expect(await screen.findByText('継続治療を記録')).toBeInTheDocument();
    expect(screen.getByText(/症状：下痢/)).toBeInTheDocument();
    expect(screen.queryByLabelText('治療区分')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('症状')).not.toBeInTheDocument();
  });

  it('hides an older treatment follow-up once a later treatment was actually recorded', async () => {
    vi.setSystemTime(new Date(2026, 9, 4, 12, 0, 0));
    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([] as any);
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([
      {
        id: 't-20261003',
        targetNumber: '6891',
        targetName: 'あいうえお',
        treatmentDate: '2026-10-03',
        nextScheduledDate: '2026-10-04',
        progress: '治療中',
      },
      {
        id: 't-20261004',
        targetNumber: '6891',
        targetName: 'あいうえお',
        treatmentDate: '2026-10-04',
        nextScheduledDate: '2026-10-05',
        progress: '治療中',
      },
    ] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([{
      id: 89,
      calfNumber: '6891',
      name: 'あいうえお',
      birthday: '2026-07-21',
    }] as any);

    render(
      <MemoryRouter>
        <TodayTasks suppressedScheduleKeys={[]} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('2026-10-05')).toBeInTheDocument();
    expect(screen.queryByText('2026-10-04')).not.toBeInTheDocument();
    expect(screen.getAllByText('治療中')).toHaveLength(1);
  });

});
