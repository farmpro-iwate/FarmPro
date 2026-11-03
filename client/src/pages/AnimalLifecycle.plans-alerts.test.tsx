import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertPage } from './AlertPage';
import { CalendarPage } from './CalendarPage';
import { ScheduleList } from './ScheduleList';
import { TodayTasks } from '../components/TodayTasks';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';
import * as scheduleApi from '../services/scheduleApi';
import * as breedingApi from '../services/breedingApi';
import * as vaccineApi from '../services/vaccineApi';
import * as treatmentApi from '../services/treatmentApi';
import * as salesApi from '../services/salesApi';
import * as blvApi from '../services/blvApi';
import * as alertSettings from '../services/alertSettings';
import * as snapshotApi from '../services/cattlePlanSnapshot';

const event = { date: '2026-11-02', reason: '記録済み', note: '', recordedAt: '2026-11-02T00:00:00Z' };
const deceased = { id: 1, earTag: '0123', name: '死亡牛', lifecycle: { version: 1, death: event } };
const culled = { id: 2, earTag: '0456', name: '廃用牛', lifecycle: { version: 1, culling: { ...event, route: 'fattening' } } };
const schedule = (id: number, targetNumber: string, title: string, extra = {}) => ({
  id, targetNumber, targetName: targetNumber === '0123' ? '死亡牛' : '廃用牛', title,
  scheduleType: 'その他', dueDate: '2026-11-04', status: '未完了', note: '', ...extra,
});

describe('lifecycle in active plans and alerts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 3, 12));
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([deceased, culled] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([]);
    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([]);
    vi.spyOn(scheduleApi, 'deleteSchedule').mockResolvedValue(undefined);
    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([]);
    vi.spyOn(vaccineApi, 'getVaccineList').mockResolvedValue([]);
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    vi.spyOn(salesApi, 'getSalesList').mockResolvedValue([]);
    vi.spyOn(blvApi, 'getBlvTestList').mockResolvedValue([]);
    vi.spyOn(snapshotApi, 'getCattlePlanSnapshot').mockResolvedValue({ breedings: [], calvings: [], sales: [], cycleDays: 21, unavailable: [] });
    vi.spyOn(alertSettings, 'getAlertSettings').mockResolvedValue({ scheduleDays: 30, pregnancyCheckDays: 14,
      nextHeatDays: 14, recheckDays: 14, calvingDays: 60, vaccineDays: 30 });
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('removes deceased reminders and culled breeding reminders while retaining care, feeding and shipping', async () => {
    const schedules = [schedule(1, '0123', '死亡牛の給餌'), schedule(2, '0456', '人工授精'),
      schedule(3, '0456', '廃用後の給餌'), schedule(4, '', '牛舎の清掃', { targetName: '' })];
    vi.mocked(scheduleApi.getScheduleList).mockResolvedValue(schedules);
    vi.mocked(breedingApi.getBreedingList).mockResolvedValue([deceased, culled].map((cow, index) => ({
      id: index + 1, cowEarTag: cow.earTag, cowName: cow.name, pregnancyResult: '受胎', expectedCalvingDate: '2026-11-06',
    })) as any);
    vi.mocked(vaccineApi.getVaccineList).mockResolvedValue([deceased, culled].map((cow, index) => ({
      id: index + 1, targetType: '成牛', targetNumber: cow.earTag, targetName: cow.name, vaccineName: `接種-${cow.earTag}`,
      nextDueDate: '2026-11-04', status: '未接種',
    })) as any);
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValue([deceased, culled].map((cow, index) => ({
      id: index + 1, targetNumber: cow.earTag, targetName: cow.name, treatmentDate: '2026-11-01', progress: '治療中', withdrawalEndDate: '2026-11-05',
    })) as any);
    vi.mocked(salesApi.getSalesList).mockResolvedValue([deceased, culled].map((cow, index) => ({
      id: index + 1, targetType: '成牛', targetNumber: cow.earTag, targetName: cow.name, status: '出荷予定', shippingPlanDate: '2026-11-04',
    })) as any);
    const before = JSON.stringify(schedules);
    render(<MemoryRouter><AlertPage /></MemoryRouter>);
    expect((await screen.findAllByText('廃用後の給餌')).length).toBeGreaterThan(0);
    expect(screen.queryByText('死亡牛')).not.toBeInTheDocument();
    expect(screen.queryByText('死亡牛の給餌')).not.toBeInTheDocument();
    expect(screen.queryByText('人工授精')).not.toBeInTheDocument();
    expect(screen.queryByText('分娩予定')).not.toBeInTheDocument();
    expect(screen.queryByText('増し飼い検討')).not.toBeInTheDocument();
    expect(screen.getAllByText('接種-0456').length).toBeGreaterThan(0);
    expect(screen.getAllByText('治療中').length).toBeGreaterThan(0);
    expect(screen.getAllByText('休薬期間中').length).toBeGreaterThan(0);
    expect(screen.getAllByText('搬出準備').length).toBeGreaterThan(0);
    expect(screen.getAllByText('牛舎の清掃').length).toBeGreaterThan(0);
    expect(JSON.stringify(schedules)).toBe(before);
  });

  it('keeps stopped manual plans inspectable as history and offers no execution action', async () => {
    const schedules = [schedule(1, '0123', '死亡牛の治療'),
      schedule(2, '0456', '人工授精', { synchronizationProgramId: 'program-1' }),
      schedule(3, '0456', '廃用後の給餌'), schedule(4, '0123', '実施済みの治療', { status: '完了', dueDate: '2026-11-01' })];
    vi.mocked(scheduleApi.getScheduleList).mockResolvedValue(schedules);
    const before = JSON.stringify(schedules);
    render(<MemoryRouter><ScheduleList /></MemoryRouter>);
    expect((await screen.findAllByText('廃用後の給餌')).length).toBeGreaterThan(0);
    expect(screen.queryByText('死亡牛の治療')).not.toBeInTheDocument();
    expect(screen.queryByText('人工授精')).not.toBeInTheDocument();
    expect(screen.getAllByText('実施済みの治療').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '停止した予定を含める（2件）' }));
    expect(screen.getAllByText('死亡牛の治療').length).toBeGreaterThan(0);
    expect(screen.getAllByText('人工授精').length).toBeGreaterThan(0);
    expect(screen.getAllByText('停止').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: '実施' })).not.toBeInTheDocument();
    expect(scheduleApi.deleteSchedule).not.toHaveBeenCalled();
    expect(JSON.stringify(schedules)).toBe(before);
  });

  it('also suppresses the independent home task list while preserving culling care and ambiguous records', async () => {
    vi.mocked(scheduleApi.getScheduleList).mockResolvedValue([schedule(1, '0123', '死亡牛の給餌'),
      schedule(2, '0456', '人工授精'), schedule(3, '0456', '廃用後の給餌')]);
    vi.mocked(vaccineApi.getVaccineList).mockResolvedValue([deceased, culled].map((cow, index) => ({
      id: index + 1, targetType: '成牛', targetNumber: cow.earTag, targetName: cow.name, vaccineName: `接種-${cow.earTag}`,
      nextDueDate: '2026-11-04', status: '未接種',
    })) as any);
    vi.mocked(blvApi.getBlvTestList).mockResolvedValue([{ id: 1, cowEarTag: '0123', cowName: '死亡牛', nextTestDate: '2026-11-04' }] as any);
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValue([
      { id: 1, targetNumber: '0123', targetName: '死亡牛', treatmentDate: '2026-11-03', progress: '治療中', withdrawalEndDate: '2026-11-04' },
      { id: 2, targetNumber: '0456', targetName: '廃用牛', treatmentDate: '2026-11-03', progress: '治療中' },
      { id: 3, targetNumber: '', targetName: '名前だけの記録', treatmentDate: '2026-11-03', progress: '要再診' },
    ] as any);
    vi.mocked(salesApi.getSalesList).mockResolvedValue([deceased, culled].map((cow, index) => ({
      id: index + 1, targetType: '成牛', targetNumber: cow.earTag, targetName: cow.name, status: '出荷予定', shippingPlanDate: '2026-11-04',
    })) as any);
    render(<MemoryRouter><TodayTasks /></MemoryRouter>);
    expect(await screen.findByText('廃用後の給餌')).toBeInTheDocument();
    expect(screen.queryByText('死亡牛')).not.toBeInTheDocument();
    expect(screen.queryByText('死亡牛の給餌')).not.toBeInTheDocument();
    expect(screen.queryByText('人工授精')).not.toBeInTheDocument();
    expect(screen.queryByText('接種-0123')).not.toBeInTheDocument();
    expect(screen.queryByText('BLV次回検査')).not.toBeInTheDocument();
    expect(screen.queryByText('休薬期間中')).not.toBeInTheDocument();
    expect(screen.getByText('接種-0456')).toBeInTheDocument();
    expect(screen.getByText('治療中')).toBeInTheDocument();
    expect(screen.getByText('搬出準備')).toBeInTheDocument();
    expect(screen.getByText('名前だけの記録')).toBeInTheDocument();
  });

  it('removes future dead-animal calendar work and preserves past entries and culled-animal care', async () => {
    vi.mocked(scheduleApi.getScheduleList).mockResolvedValue([schedule(1, '0123', '死亡牛の今後の予定'),
      schedule(2, '0123', '過去の記録', { dueDate: '2026-11-01' }), schedule(3, '0456', '人工授精'),
      schedule(4, '0456', '廃用後の給餌')]);
    vi.mocked(vaccineApi.getVaccineList).mockResolvedValue([deceased, culled].map((cow, index) => ({
      id: index + 1, targetType: '成牛', targetNumber: cow.earTag, targetName: cow.name, vaccineName: `接種-${cow.earTag}`,
      nextDueDate: '2026-11-04', status: '未接種',
    })) as any);
    vi.mocked(blvApi.getBlvTestList).mockResolvedValue([{ id: 1, cowEarTag: '0123', cowName: '死亡牛', nextTestDate: '2026-11-04' }] as any);
    render(<MemoryRouter><CalendarPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getAllByText(/過去の記録/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/死亡牛の今後の予定/)).not.toBeInTheDocument();
    expect(screen.queryByText(/人工授精/)).not.toBeInTheDocument();
    expect(screen.queryByText(/接種-0123/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-11-04 \/ BLV \/ 死亡牛/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/廃用後の給餌/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/接種-0456/).length).toBeGreaterThan(0);
  });
});
