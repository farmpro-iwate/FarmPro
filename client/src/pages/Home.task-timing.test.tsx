import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from './Home';
import { TreatmentForm } from './TreatmentForm';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';
import * as breedingApi from '../services/breedingApi';
import * as calvingsApi from '../services/calvingsApi';
import * as calvingSync from '../services/calvingRecordSync';
import * as monthlyBalanceApi from '../services/monthlyBalanceApi';
import * as settingsApi from '../services/settingsApi';
import * as authClient from '../services/authClient';
import * as cattlePlanSnapshotService from '../services/cattlePlanSnapshot';
import * as scheduleApi from '../services/scheduleApi';
import * as vaccineApi from '../services/vaccineApi';
import * as blvApi from '../services/blvApi';
import * as treatmentApi from '../services/treatmentApi';
import * as salesApi from '../services/salesApi';
import * as expensesApi from '../services/expensesApi';

const cow = { id: '123', earTag: '0254', name: 'テスト母牛', birthday: '2020-01-01', sex: '雌', stage: '繁殖牛' };
const emptySnapshot = { breedings: [], calvings: [], sales: [], cycleDays: 21, unavailable: [] };

function renderHome() {
  return render(<MemoryRouter><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/treatments/new" element={<TreatmentForm mode="create" />} />
  </Routes></MemoryRouter>);
}

async function loaded() {
  await waitFor(() => {
    expect(screen.queryByText('ファームボードを読み込み中です...')).not.toBeInTheDocument();
  });
  // Home supplies deduplication keys after its own load. Flush the resulting
  // child effect before checking that the task load has also completed.
  await act(async () => { await Promise.resolve(); });
  await waitFor(() => {
    expect(screen.queryByText('対応予定を確認しています...')).not.toBeInTheDocument();
  });
}

describe('home timing integration with real task components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
    vi.spyOn(authClient, 'getStoredAuthUser').mockReturnValue({ plan: 'standard' } as any);
    vi.spyOn(cattleApi, 'pullNewerCattleRecordsFromCloud').mockResolvedValue(undefined as any);
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);
    vi.spyOn(calfApi, 'getCalfListForHomeSummary').mockResolvedValue([] as any);
    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([] as any);
    vi.spyOn(breedingApi, 'getBreedingListForHomeSummary').mockResolvedValue([] as any);
    vi.spyOn(calvingSync, 'pullNewerCalvingRecordsFromCloud').mockResolvedValue(undefined as any);
    vi.spyOn(calvingsApi, 'fetchCalvings').mockResolvedValue([] as any);
    vi.spyOn(monthlyBalanceApi, 'getMonthlyBalance').mockResolvedValue({ rows: [], totals: null } as any);
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ estrousCycleDays: 21 } as any);
    vi.spyOn(cattlePlanSnapshotService, 'getCattlePlanSnapshot').mockResolvedValue({ ...emptySnapshot });
    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([] as any);
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

  it('combines categories by timing once, preserves dedupe, and keeps the continuation route', async () => {
    vi.mocked(cattleApi.getCattleList).mockResolvedValue([{ ...cow }] as any);
    vi.mocked(cattlePlanSnapshotService.getCattlePlanSnapshot).mockResolvedValue({
      ...emptySnapshot,
      calvings: [{ id: 'birth', cowEarTag: '0254', cowName: cow.name, actualCalvingDate: '2026-08-31' }],
    });
    vi.mocked(scheduleApi.getScheduleList).mockResolvedValue([
      { id: 'duplicate', title: '発情予定日', targetNumber: '0254', dueDate: '2026-10-05' },
      { id: 'overdue', title: '牛舎清掃', dueDate: '2026-10-04' },
      { id: 'future', title: '体重確認', dueDate: '2026-10-06' },
    ] as any);
    vi.mocked(vaccineApi.getVaccineList).mockResolvedValue([
      { id: 'vac', vaccineName: '接種予定テスト', nextDueDate: '2026-10-07' },
    ] as any);
    vi.mocked(blvApi.getBlvTestList).mockResolvedValue([
      { id: 'blv', cowEarTag: '0254', nextTestDate: '2026-10-08' },
    ] as any);
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValue([
      { id: 't1', targetNumber: '6891', targetName: '治療対象', treatmentDate: '2026-10-04', nextScheduledDate: '2026-10-05', progress: '治療中' },
      { id: 'w1', targetNumber: '6892', targetName: '休薬対象', treatmentDate: '2026-10-04', progress: '回復', withdrawalEndDate: '2026-10-10' },
    ] as any);
    vi.mocked(calfApi.getCalfList).mockResolvedValue([
      { id: 7, calfNumber: '6891', name: '治療対象', birthday: '2026-07-21' },
    ] as any);

    renderHome();
    await loaded();

    const due = within(screen.getByRole('region', { name: '今日の対応' }));
    const upcoming = within(screen.getByRole('region', { name: '近日の対応' }));
    const ongoing = within(screen.getByRole('region', { name: '継続中・確認事項' }));
    expect(await due.findByText('3 件')).toBeInTheDocument();
    expect(due.getByText('牛舎清掃')).toBeInTheDocument();
    const heatCard = due.getByRole('link', { name: /2026-10-05.*発情予定日/ });
    expect(within(heatCard).getByText('2026-10-05')).toBeInTheDocument();
    expect(within(heatCard).getByText('開く →')).toBeInTheDocument();
    expect(screen.getAllByText('発情予定日', { exact: true })).toHaveLength(1);
    expect(due.getByText('治療中')).toBeInTheDocument();
    expect(upcoming.getByText('3 件')).toBeInTheDocument();
    expect(upcoming.getAllByRole('link').map((link) => link.textContent)).toEqual([
      expect.stringContaining('体重確認'),
      expect.stringContaining('接種予定テスト'),
      expect.stringContaining('BLV次回検査'),
    ]);
    expect(ongoing.getByText('休薬期間中')).toBeInTheDocument();
    expect(ongoing.getByText('1 件')).toBeInTheDocument();
    const link = due.getByText('治療中').closest('a')!;
    const url = new URL(link.getAttribute('href')!, 'http://localhost');
    expect(url.pathname).toBe('/treatments/new');
    expect(url.searchParams.get('sourceTreatmentId')).toBe('t1');
    expect(url.searchParams.get('targetNumber')).toBe('6891');
    expect(url.searchParams.get('returnTo')).toBe('/');
    expect(within(link).queryByText(/市場日/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '繁殖要対応牛を確認する' })).toHaveAttribute('href', '/alerts?scope=breeding');
  });

  it('includes local day seven, excludes day eight, and excludes completed schedules', async () => {
    vi.mocked(scheduleApi.getScheduleList).mockResolvedValue([
      { id: 'seven', title: '7日後の作業', dueDate: '2026-10-12' },
      { id: 'eight', title: '8日後の作業', dueDate: '2026-10-13' },
      { id: 'done', title: '終了した作業', dueDate: '2026-10-05', status: '完了' },
    ] as any);
    renderHome();
    await loaded();
    expect(within(screen.getByRole('region', { name: '近日の対応' })).getByText('7日後の作業')).toBeInTheDocument();
    expect(screen.queryByText('8日後の作業')).not.toBeInTheDocument();
    expect(screen.queryByText('終了した作業')).not.toBeInTheDocument();
  });

  it('keeps undated treatment and preparation visible without treating the market date as a due date', async () => {
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValue([
      { id: 'undated', targetNumber: '6891', targetName: '経過観察', progress: '治療中', treatmentDate: '2026-10-04' },
    ] as any);
    vi.mocked(salesApi.getSalesList).mockResolvedValue([
      { id: 'market', status: '出荷予定', shippingPlanDate: '2026-10-25', targetNumber: '6892', marketName: 'テスト市場' },
    ] as any);
    renderHome();
    await loaded();
    const ongoing = within(screen.getByRole('region', { name: '継続中・確認事項' }));
    expect(await ongoing.findByText('2 件')).toBeInTheDocument();
    expect(ongoing.getByText('治療中')).toBeInTheDocument();
    expect(ongoing.getByText('ワクチン・治療歴確認')).toBeInTheDocument();
    expect(ongoing.getByText('市場まで20日')).toBeInTheDocument();
    const marketCard = ongoing.getByRole('link', { name: /市場日：2026-10-25/ });
    expect(marketCard).toHaveAttribute('href', '/market-shipping-plan');
    expect(marketCard.textContent?.match(/2026-10-25/g)).toHaveLength(1);
  });

  it('shows one explicitly labelled market date per calf and retains eight-day preparation in ongoing', async () => {
    vi.setSystemTime(new Date(2026, 9, 6, 12, 0, 0));
    const rows = Object.freeze(['5754', '5755'].map((number) => Object.freeze({
      id: `sale-${number}`, status: '出荷予定', shippingPlanDate: '2026-10-14',
      targetNumber: number, targetName: '子牛（耳標未装着）', marketName: '岩手中央家畜市場',
    })));
    vi.mocked(salesApi.getSalesList).mockResolvedValue(rows as any);
    renderHome();
    await loaded();

    const ongoing = within(screen.getByRole('region', { name: '継続中・確認事項' }));
    expect(await ongoing.findByText('2 件')).toBeInTheDocument();
    const cards = ongoing.getAllByRole('link');
    expect(cards).toHaveLength(2);
    cards.forEach((card, index) => {
      expect(card).toHaveAttribute('href', '/market-shipping-plan');
      expect(within(card).getByText('市場まで8日')).toBeInTheDocument();
      expect(within(card).getByText('体重確認')).toBeInTheDocument();
      expect(within(card).getByText('市場日：2026-10-14')).toBeInTheDocument();
      expect(within(card).getByText('開く →')).toBeInTheDocument();
      expect(card.textContent?.match(/2026-10-14/g)).toHaveLength(1);
      expect(card).toHaveTextContent(rows[index].targetNumber);
      expect(card).toHaveTextContent(rows[index].targetName);
      expect(card).toHaveTextContent(rows[index].marketName);
    });
    expect(within(screen.getByRole('region', { name: '今日の対応' })).queryByRole('link')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: '近日の対応' })).queryByRole('link')).not.toBeInTheDocument();
    expect(rows.every((row) => row.shippingPlanDate === '2026-10-14' && row.status === '出荷予定')).toBe(true);
  });

  it.each([
    ['2026-10-05', '市場出荷', '今日'],
    ['2026-10-04', '市場出荷状況を確認', '要対応'],
  ])('keeps due market %s in today while clearly identifying its date', async (date, title, status) => {
    vi.mocked(salesApi.getSalesList).mockResolvedValue([
      { id: 'market-due', status: '出荷予定', shippingPlanDate: date, targetNumber: '5754', marketName: 'テスト市場' },
    ] as any);
    renderHome();
    await loaded();
    const due = within(screen.getByRole('region', { name: '今日の対応' }));
    const card = await due.findByRole('link');
    expect(within(card).getByText(title)).toBeInTheDocument();
    expect(within(card).getByText(status)).toBeInTheDocument();
    expect(within(card).getByText(`市場日：${date}`)).toBeInTheDocument();
    expect(card).toHaveAttribute('href', '/market-shipping-plan');
    expect(within(screen.getByRole('region', { name: '継続中・確認事項' })).queryByRole('link')).not.toBeInTheDocument();
  });

  it.each([
    [12, false, ''], [13, true, '近日中'], [20, true, '今日'],
    [27, true, '確認待ち'], [28, false, ''],
  ])('shows feed review only seven days around its review date (October %s)', async (day, visible, status) => {
    vi.setSystemTime(new Date(2026, 9, day, 12));
    vi.mocked(cattleApi.getCattleList).mockResolvedValue([{ ...cow }] as any);
    vi.mocked(cattlePlanSnapshotService.getCattlePlanSnapshot).mockResolvedValue({
      ...emptySnapshot,
      breedings: [{ id: 'pregnant', cowEarTag: cow.earTag, cowName: cow.name,
        inseminationDate: '2026-03-09', pregnancyResult: '受胎', expectedCalvingDate: '2026-12-19' }],
    });
    renderHome();
    await loaded();
    const title = screen.queryByText('増し飼い検討', { exact: true });
    expect(Boolean(title)).toBe(visible);
    if (title) {
      const card = within(title.closest('a')!);
      expect(card.getByText('2026-10-20')).toBeInTheDocument();
      expect(card.getByText(status)).toBeInTheDocument();
      expect(card.getByText(/分娩予定日：2026-12-19/)).toBeInTheDocument();
    }
  });

  it('hides tasks eight days overdue, keeps day seven and heat wording, without changing records', async () => {
    const schedules = [
      { id: 'old', title: '古い妊娠鑑定', dueDate: '2026-09-27' },
      { id: 'edge', title: '境界妊娠鑑定', dueDate: '2026-09-28' },
      { id: 'heat', title: '発情確認', dueDate: '2026-10-04' },
      { id: 'cancel', title: '取り消した予定', dueDate: '2026-10-05', status: '取消' },
    ];
    const original = JSON.stringify(schedules);
    vi.mocked(scheduleApi.getScheduleList).mockResolvedValue(schedules as any);
    vi.mocked(vaccineApi.getVaccineList).mockResolvedValue([
      { id: 'old-v', vaccineName: '古い接種', nextDueDate: '2026-09-27' },
      { id: 'edge-v', vaccineName: '境界接種', nextDueDate: '2026-09-28' },
    ] as any);
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValue([
      { id: 'old-t', targetNumber: '1', targetName: '古い治療牛', progress: '治療中', nextScheduledDate: '2026-09-27' },
      { id: 'edge-t', targetNumber: '2', targetName: '境界治療牛', progress: '治療中', nextScheduledDate: '2026-09-28' },
    ] as any);
    renderHome();
    await loaded();
    expect(screen.queryByText('古い妊娠鑑定')).not.toBeInTheDocument();
    expect(screen.queryByText('古い接種')).not.toBeInTheDocument();
    expect(screen.queryByText('古い治療牛')).not.toBeInTheDocument();
    expect(screen.queryByText('取り消した予定')).not.toBeInTheDocument();
    const due = within(screen.getByRole('region', { name: '今日の対応' }));
    expect(due.getByText('境界妊娠鑑定')).toBeInTheDocument();
    expect(due.getByText('境界接種')).toBeInTheDocument();
    expect(due.getByText('境界治療牛')).toBeInTheDocument();
    expect(due.getByText('発情未確認')).toBeInTheDocument();
    expect(JSON.stringify(schedules)).toBe(original);
  });

  it('does not display empty reassurance during loading or after a source fails', async () => {
    let fail!: (reason: Error) => void;
    // A single deferred read also covers the reload when Home supplies its keys.
    const deferred = new Promise<Awaited<ReturnType<typeof treatmentApi.getTreatmentList>>>((_, reject) => { fail = reject; });
    vi.mocked(treatmentApi.getTreatmentList).mockReturnValue(deferred);
    renderHome();
    expect(await screen.findByText('対応予定を確認しています...')).toBeInTheDocument();
    expect(screen.queryByText(/対応予定はありません/)).not.toBeInTheDocument();
    expect(screen.queryByText('0 件')).not.toBeInTheDocument();
    await act(async () => { fail(new Error('test read failure')); });
    expect(await screen.findByText(/治療記録を読み込めませんでした/)).toBeInTheDocument();
    await loaded();
    expect(screen.queryByText(/対応予定はありません/)).not.toBeInTheDocument();
    expect(screen.queryByText('0 件')).not.toBeInTheDocument();
  });

  it('saves recovery through the grouped home card, removes the old task, and keeps withdrawal and history', async () => {
    vi.spyOn(expensesApi, 'deleteExpenseBySource').mockResolvedValue(undefined as any);
    const original = {
      id: 1, targetNumber: 'OLD-123', targetName: 'あいうえお', symptom: '下痢',
      treatmentDate: '2026-10-04', nextScheduledDate: '2026-10-06',
      withdrawalEndDate: '2026-10-10', progress: '治療中',
    };
    const rows: any[] = [{ ...original }];
    vi.mocked(treatmentApi.getTreatmentList).mockImplementation(async () => [...rows]);
    const create = vi.spyOn(treatmentApi, 'createTreatment').mockImplementation(async (input) => {
      const saved = { ...input, id: 2 } as any;
      rows.push(saved);
      return saved;
    });
    vi.mocked(calfApi.getCalfList).mockResolvedValue([
      { id: 7, calfNumber: '6891', name: 'あいうえお', birthday: '2026-07-21' },
    ] as any);
    renderHome();
    await loaded();
    fireEvent.click(screen.getByText('治療中').closest('a')!);
    expect(await screen.findByText('継続治療を記録')).toBeInTheDocument();
    expect(screen.queryByLabelText('症状')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/治療日/), { target: { value: '2026-10-05' } });
    fireEvent.mouseDown(screen.getByLabelText('経過'));
    fireEvent.click(await screen.findByRole('option', { name: '回復' }));
    expect(screen.getByLabelText('次回予定日（任意）')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByText('FarmPro ファームボード')).toBeInTheDocument();
    await loaded();
    expect(within(screen.getByRole('region', { name: '継続中・確認事項' })).getByText('休薬期間中')).toBeInTheDocument();
    expect(screen.queryByText('治療中')).not.toBeInTheDocument();
    expect(screen.queryByText('2026-10-06')).not.toBeInTheDocument();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ progress: '回復', targetNumber: '6891', nextScheduledDate: '', treatmentCourseId: 'treatment:1' }));
    expect(rows[0]).toEqual(original);
    expect(rows).toHaveLength(2);
  });
});
