import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScheduleList } from './ScheduleList';
import * as scheduleApi from '../services/scheduleApi';
import * as cattleApi from '../services/api';
import * as cattlePlanSnapshotService from '../services/cattlePlanSnapshot';

const cow = { id: '123', earTag: '0254', name: 'テスト母牛', stage: '繁殖牛' };

function renderPage() {
  return render(<MemoryRouter><ScheduleList /></MemoryRouter>);
}

describe('schedule list shared breeding plans', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0));
    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([] as any);
    vi.spyOn(scheduleApi, 'deleteSchedule').mockResolvedValue(undefined as any);
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([{ ...cow }] as any);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows shared breeding plans as read-only reference items with shared ET dates', async () => {
    vi.spyOn(cattlePlanSnapshotService, 'getCattlePlanSnapshot').mockResolvedValue({
      breedings: [{
        id: 'et-1',
        cowEarTag: cow.earTag,
        cowName: cow.name,
        heatDate: '2026-09-17',
        transferDate: '2026-09-24',
        breedingMethod: '受精卵移植',
        breedingStatus: '移植実施',
        pregnancyResult: '未鑑定',
        nextHeatExpectedDate: '2026-10-15',
        pregnancyCheckExpectedDate: '2026-11-05',
      }],
      calvings: [],
      sales: [],
      cycleDays: 21,
      unavailable: [],
    });

    renderPage();

    expect(await screen.findByText('次回発情確認')).toBeInTheDocument();
    expect(screen.getByText('妊娠鑑定')).toBeInTheDocument();
    expect(screen.getByText(/予定日：2026-10-08/)).toBeInTheDocument();
    expect(screen.getByText(/予定日：2026-10-29/)).toBeInTheDocument();
    expect(screen.queryByText(/予定日：2026-10-15/)).not.toBeInTheDocument();
    expect(screen.getByText(/ここから削除・完了にはせず/)).toBeInTheDocument();
    expect(scheduleApi.deleteSchedule).not.toHaveBeenCalled();
  });

  it('shows the calculated postpartum heat date as a read-only breeding plan', async () => {
    vi.spyOn(cattlePlanSnapshotService, 'getCattlePlanSnapshot').mockResolvedValue({
      breedings: [],
      calvings: [{ id: 'calving-1', cowEarTag: cow.earTag, cowName: cow.name, actualCalvingDate: '2026-09-20' }],
      sales: [],
      cycleDays: 21,
      unavailable: [],
    });

    renderPage();

    expect(await screen.findByText('発情予定日')).toBeInTheDocument();
    expect(screen.getByText('あと22日')).toBeInTheDocument();
    expect(screen.getByText(/予定日：2026-10-25/)).toBeInTheDocument();
    expect(screen.getByText(/実分娩日から35日後/)).toBeInTheDocument();
  });

  it('shows shared resolver issues instead of presenting them as editable schedules', async () => {
    vi.spyOn(cattlePlanSnapshotService, 'getCattlePlanSnapshot').mockResolvedValue({
      breedings: [],
      calvings: [],
      sales: [],
      cycleDays: 21,
      unavailable: ['繁殖記録'],
    });

    renderPage();

    expect(await screen.findByText(/繁殖予定の確認に必要な情報を読み込めませんでした/)).toBeInTheDocument();
  });
});
