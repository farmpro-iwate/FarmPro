import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarPage } from './CalendarPage';
import * as scheduleApi from '../services/scheduleApi';
import * as cattleApi from '../services/api';
import * as cattlePlanSnapshotService from '../services/cattlePlanSnapshot';
import * as vaccineApi from '../services/vaccineApi';
import * as blvApi from '../services/blvApi';

const cow = { id: '123', earTag: '0254', name: 'テスト母牛', stage: '繁殖牛' };

function renderCalendar() {
  return render(<MemoryRouter><CalendarPage /></MemoryRouter>);
}

describe('calendar shared breeding plans', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0));

    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([] as any);
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([{ ...cow }] as any);
    vi.spyOn(vaccineApi, 'getVaccineList').mockResolvedValue([] as any);
    vi.spyOn(blvApi, 'getBlvTestList').mockResolvedValue([] as any);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses the shared ET heat-based dates instead of stale stored calendar dates', async () => {
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

    renderCalendar();

    expect(await screen.findByText(/2026-10-08 \/ 繁殖 \/ テスト母牛 \/ 次回発情確認/)).toBeInTheDocument();
    expect(screen.getByText(/2026-10-29 \/ 繁殖 \/ テスト母牛 \/ 妊娠鑑定/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-10-15 \/ 繁殖/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-11-05 \/ 繁殖/)).not.toBeInTheDocument();
  });

  it('does not invent a calendar date for undated postpartum guidance', async () => {
    vi.spyOn(cattlePlanSnapshotService, 'getCattlePlanSnapshot').mockResolvedValue({
      breedings: [],
      calvings: [{ id: 'calving-1', cowEarTag: cow.earTag, cowName: cow.name, actualCalvingDate: '2026-09-20' }],
      sales: [],
      cycleDays: 21,
      unavailable: [],
    });

    renderCalendar();

    expect(await screen.findByText('今月の予定はありません。')).toBeInTheDocument();
    expect(screen.queryByText(/分娩後の発情確認/)).not.toBeInTheDocument();
  });

  it('shows shared-plan issues instead of silently treating bad plan data as no issue', async () => {
    vi.spyOn(cattlePlanSnapshotService, 'getCattlePlanSnapshot').mockResolvedValue({
      breedings: [],
      calvings: [],
      sales: [],
      cycleDays: 21,
      unavailable: ['繁殖記録'],
    });

    renderCalendar();

    expect(await screen.findByText(/繁殖予定の確認に必要な情報を読み込めませんでした/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('カレンダーを読み込み中です...')).not.toBeInTheDocument());
  });
});
