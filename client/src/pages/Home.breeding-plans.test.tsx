import type { ComponentProps } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from './Home';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';
import * as breedingApi from '../services/breedingApi';
import * as calvingsApi from '../services/calvingsApi';
import * as calvingSync from '../services/calvingRecordSync';
import * as monthlyBalanceApi from '../services/monthlyBalanceApi';
import * as settingsApi from '../services/settingsApi';
import * as authClient from '../services/authClient';
import * as cattlePlanSnapshotService from '../services/cattlePlanSnapshot';

vi.mock('../components/TodayTasks', () => ({
  TodayTasks: ({ suppressedScheduleKeys = [], renderItems }: ComponentProps<typeof import('../components/TodayTasks').TodayTasks>) => (
    <>
      <div data-testid="today-task-suppressed">{suppressedScheduleKeys.join('|')}</div>
      {renderItems?.([], false, [])}
    </>
  ),
}));

const cow = { id: '123', earTag: '0254', name: 'テスト母牛', birthday: '2020-01-01', sex: '雌', stage: '繁殖牛' };
const emptyBalance = { rows: [], totals: null };

function renderHome() {
  return render(<MemoryRouter><Home /></MemoryRouter>);
}

describe('home shared breeding plans', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0, 0));

    vi.spyOn(authClient, 'getStoredAuthUser').mockReturnValue({ plan: 'standard' } as any);
    vi.spyOn(cattleApi, 'pullNewerCattleRecordsFromCloud').mockResolvedValue(undefined as any);
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([{ ...cow }] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'getCalfListForHomeSummary').mockResolvedValue([] as any);
    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([] as any);
    vi.spyOn(breedingApi, 'getBreedingListForHomeSummary').mockResolvedValue([] as any);
    vi.spyOn(calvingSync, 'pullNewerCalvingRecordsFromCloud').mockResolvedValue(undefined as any);
    vi.spyOn(calvingsApi, 'fetchCalvings').mockResolvedValue([] as any);
    vi.spyOn(monthlyBalanceApi, 'getMonthlyBalance').mockResolvedValue(emptyBalance as any);
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ estrousCycleDays: 21 } as any);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the shared postpartum guidance instead of an empty-plan success message', async () => {
    vi.spyOn(cattlePlanSnapshotService, 'getCattlePlanSnapshot').mockResolvedValue({
      breedings: [],
      calvings: [{ id: 'calving-1', cowEarTag: cow.earTag, cowName: cow.name, actualCalvingDate: '2026-08-29' }],
      sales: [],
      cycleDays: 21,
      unavailable: [],
    });

    renderHome();

    const card = await screen.findByRole('link', { name: /2026-10-03.*発情予定日/ });
    expect(within(card).getByText('発情予定日')).toBeInTheDocument();
    expect(within(card).getByText('2026-10-03')).toBeInTheDocument();
    expect(within(card).getByText('開く →')).toBeInTheDocument();
    const due = within(screen.getByRole('region', { name: '今日の対応' }));
    expect(due.getByText('今日')).toBeInTheDocument();
    expect(due.getByText(/実分娩日から35日後/)).toBeInTheDocument();
    expect(due.queryByText('今日の対応予定はありません。')).not.toBeInTheDocument();
  });

  it('uses the shared ET heat-based dates and applies only the home seven-day view filter', async () => {
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

    renderHome();

    expect(await screen.findByRole('link', { name: /2026-10-08.*次回発情確認/ })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '近日の対応' })).getByText('2026-10-08')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /2026-10-29.*妊娠鑑定/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /2026-10-15.*次回発情確認/ })).not.toBeInTheDocument();
  });

  it('shows shared-plan read issues instead of saying there are no breeding plans', async () => {
    vi.spyOn(cattlePlanSnapshotService, 'getCattlePlanSnapshot').mockResolvedValue({
      breedings: [],
      calvings: [],
      sales: [],
      cycleDays: 21,
      unavailable: ['繁殖記録'],
    });

    renderHome();

    expect(await screen.findByText(/繁殖予定の確認に必要な情報を読み込めませんでした/)).toBeInTheDocument();
    expect(screen.queryByText(/対応予定はありません/)).not.toBeInTheDocument();
    expect(screen.queryByText('0 件')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('ファームボードを読み込み中です...')).not.toBeInTheDocument());
  });

  it('orders calculated postpartum dates together with other dated breeding plans', async () => {
    vi.spyOn(cattlePlanSnapshotService, 'getCattlePlanSnapshot').mockResolvedValue({
      breedings: [{
        id: 'ai-1',
        cowEarTag: cow.earTag,
        cowName: cow.name,
        heatDate: '2026-09-14',
        inseminationDate: '2026-09-14',
        breedingMethod: '種付',
        breedingStatus: '種付実施',
        pregnancyResult: '未鑑定',
      }],
      calvings: [{ id: 'calving-1', cowEarTag: '9999', cowName: '別牛', actualCalvingDate: '2026-08-27' }],
      sales: [],
      cycleDays: 21,
      unavailable: [],
    });
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([
      { ...cow },
      { id: '9999', earTag: '9999', name: '別牛', birthday: '2020-01-01', sex: '雌', stage: '繁殖牛' }
    ] as any);

    renderHome();

    const postpartum = await screen.findByRole('link', { name: /2026-10-01.*発情予定日/ });
    const nextHeat = screen.getByRole('link', { name: /2026-10-05.*次回発情確認/ });
    expect(postpartum.compareDocumentPosition(nextHeat) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('passes exact ear-tag breeding aliases to TodayTasks for home-only dedupe', async () => {
    vi.spyOn(cattlePlanSnapshotService, 'getCattlePlanSnapshot').mockResolvedValue({
      breedings: [],
      calvings: [{ id: 'calving-1', cowEarTag: cow.earTag, cowName: cow.name, actualCalvingDate: '2026-08-29' }],
      sales: [],
      cycleDays: 21,
      unavailable: [],
    });

    renderHome();

    const value = await screen.findByTestId('today-task-suppressed');
    await waitFor(() => expect(value.textContent).toContain('0254::発情確認'));
    expect(value.textContent).toContain('0254::次回発情確認');
    expect(value.textContent).toContain('0254::発情予定日');
  });
});
