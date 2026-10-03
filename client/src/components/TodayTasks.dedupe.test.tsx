import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TodayTasks } from './TodayTasks';
import * as scheduleApi from '../services/scheduleApi';
import * as vaccineApi from '../services/vaccineApi';
import * as blvApi from '../services/blvApi';
import * as treatmentApi from '../services/treatmentApi';
import * as salesApi from '../services/salesApi';

describe('TodayTasks home dedupe', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0));

    vi.spyOn(vaccineApi, 'getVaccineList').mockResolvedValue([] as any);
    vi.spyOn(blvApi, 'getBlvTestList').mockResolvedValue([] as any);
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([] as any);
    vi.spyOn(salesApi, 'getSalesList').mockResolvedValue([] as any);
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
});
