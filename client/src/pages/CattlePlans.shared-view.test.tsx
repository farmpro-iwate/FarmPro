import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CattleList } from './CattleList';
import { CattleDetail } from './CattleDetail';
import * as cattleApi from '../services/api';
import * as breedingApi from '../services/breedingApi';
import * as vaccineApi from '../services/vaccineApi';
import * as scheduleApi from '../services/scheduleApi';
import * as treatmentApi from '../services/treatmentApi';
import * as salesApi from '../services/salesApi';
import * as repository from '../storage/repository';
import * as settingsApi from '../services/settingsApi';
import * as feedApi from '../services/feedInventoryApi';
import * as expensesApi from '../services/expensesApi';
import * as acquisitionApi from '../services/breedingCattleUnallocatedAcquisitionCost';
import * as cattleExpenseApi from '../services/cattleFarmExpenseAllocation';
import * as allExpenseApi from '../services/allFarmExpenseAllocation';
import * as currentPlan from '../plans/current-plan';

const cow = { id: '123', earTag: '0254', name: 'テスト母牛', birthday: '2020-01-01', sex: '雌', stage: '繁殖牛' };
const calving = { id: 'calving-1', cowEarTag: '0254', cowName: cow.name, actualCalvingDate: '2026-08-29', calvingResult: '自然分娩' };
const ai = { id: 'ai-1', cowEarTag: '0254', cowName: cow.name, heatDate: '2026-09-19', inseminationDate: '2026-09-20', breedingMethod: '種付', breedingStatus: '種付実施', pregnancyResult: '未鑑定' };
const et = { id: 'et-1', cowEarTag: '0254', cowName: cow.name, heatDate: '2026-09-17', transferPlannedDate: '2026-09-24', transferDate: '2026-09-24', breedingMethod: '受精卵移植', breedingStatus: '移植実施', pregnancyResult: '未鑑定', nextHeatExpectedDate: '2026-10-15', pregnancyCheckExpectedDate: '2026-11-05' };
let breedingRows: any[];
let calvingRows: any[];

function planValues(element: Element) {
  return Array.from(element.querySelectorAll('[data-plan-kind]')).map((node) => [node.getAttribute('data-plan-kind'), node.getAttribute('data-plan-date')]);
}

async function openList(stageFilter?: '育成牛') {
  const path = stageFilter === '育成牛' ? '/cattle/growing' : '/cattle';
  const view = render(<MemoryRouter initialEntries={[path]}><Routes><Route path={path} element={<CattleList stageFilter={stageFilter} />} /></Routes></MemoryRouter>);
  await screen.findByText('耳標 0254');
  await waitFor(() => expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument());
  return { ...view, block: view.container.querySelector<HTMLTableRowElement>('tbody tr')! };
}

async function openDetail() {
  const view = render(<MemoryRouter initialEntries={['/cattle/123']}><Routes><Route path="/cattle/:id" element={<CattleDetail />} /></Routes></MemoryRouter>);
  await screen.findByText('個体カルテ：テスト母牛');
  return { ...view, block: screen.getByText('次の予定').parentElement! };
}

async function compareBoth(expected: string[][]) {
  const list = await openList();
  expect(planValues(list.block)).toEqual(expected);
  list.unmount();
  const detail = await openDetail();
  expect(planValues(detail.block)).toEqual(expected);
  return detail;
}

describe('shared breeding plans in real list and detail components', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 12, 0, 0));
    breedingRows = [];
    calvingRows = [{ ...calving }];
    vi.spyOn(currentPlan, 'getCurrentFarmProPlanId').mockReturnValue('free');
    vi.spyOn(cattleApi, 'getCattleList').mockResolvedValue([{ ...cow }] as any);
    vi.spyOn(cattleApi, 'getCattle').mockResolvedValue({ ...cow } as any);
    vi.spyOn(breedingApi, 'getBreedingList').mockImplementation(async () => breedingRows as any);
    vi.spyOn(vaccineApi, 'getVaccineList').mockResolvedValue([]);
    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([]);
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    vi.spyOn(salesApi, 'getSalesList').mockResolvedValue([]);
    vi.spyOn(repository, 'getAllRecords').mockImplementation(async (store) => (store === 'calvings' ? calvingRows : []) as any);
    vi.spyOn(settingsApi, 'getFarmSettingsForPageOpen').mockResolvedValue({ estrousCycleDays: 21 } as any);
    vi.spyOn(feedApi, 'getAnimalFeedCostTotal').mockResolvedValue(23175);
    vi.spyOn(expensesApi, 'getAnimalExpenseTotals').mockResolvedValue({ medical: 0, breeding: 0, other: 0, nonFeedTotal: 0 });
    vi.spyOn(acquisitionApi, 'getBreedingCattleUnallocatedAcquisitionCost').mockResolvedValue(null as any);
    vi.spyOn(cattleExpenseApi, 'getCattleFarmExpenseAllocation').mockResolvedValue(0);
    vi.spyOn(allExpenseApi, 'getAllFarmExpenseAllocation').mockResolvedValue(0);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it('keeps culling resident, excludes death from the normal ledger, and opens death history without altering records', async () => {
    const dead = { ...cow, id: 'dead', name: '死亡履歴の牛', earTag: '0901',
      lifecycle: { version: 1, death: { date: '2026-10-01', reason: '検証', note: '', recordedAt: '2026-10-01T00:00:00Z' } } };
    const culled = { ...cow, id: 'culled', name: '廃用の在籍牛', earTag: '0902',
      lifecycle: { version: 1, culling: { date: '2026-10-01', reason: '検証', note: '', route: 'fattening', recordedAt: '2026-10-01T00:00:00Z' } } };
    const animals = [{ ...cow }, dead, culled];
    const original = JSON.stringify(animals);
    vi.mocked(cattleApi.getCattleList).mockResolvedValue(animals as any);
    const user = userEvent.setup();
    render(<MemoryRouter><CattleList /></MemoryRouter>);
    await screen.findByText('表示：2件 / 全2件');
    expect(screen.queryByText('死亡履歴の牛')).not.toBeInTheDocument();
    expect(screen.getAllByText('廃用・肥育中').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('combobox', { name: '表示対象' }));
    await user.click(screen.getByRole('option', { name: '死亡履歴' }));
    await screen.findByText('表示：1件 / 全1件');
    expect(screen.getAllByText('死亡履歴の牛').length).toBeGreaterThan(0);
    expect(screen.queryByText('廃用の在籍牛')).not.toBeInTheDocument();
    expect(screen.getByRole('table').querySelector('[data-plan-kind]')).toBeNull();
    expect(JSON.stringify(animals)).toBe(original);
  });

  it('retains culling history and treatment/shipping links while hiding breeding actions in the chart', async () => {
    vi.mocked(cattleApi.getCattle).mockResolvedValue({ ...cow,
      lifecycle: { version: 1, culling: { date: '2026-10-01', reason: '繁殖終了の検証', note: '継続飼養', route: 'sale', recordedAt: '2026-10-01T00:00:00Z' } } } as any);
    breedingRows = [ai];
    vi.mocked(scheduleApi.getScheduleList).mockResolvedValue([
      { id: 501, targetNumber: cow.earTag, targetName: cow.name, scheduleType: 'その他', title: '人工授精', dueDate: '2026-10-04', status: '未完了' },
      { id: 502, targetNumber: cow.earTag, targetName: cow.name, scheduleType: 'その他', title: '削蹄', dueDate: '2026-10-04', status: '未完了' },
    ] as any);
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValue([
      { id: 601, targetNumber: cow.earTag, targetName: cow.name, recordType: '治療', treatmentDate: '2026-10-01', progress: '要再診', nextScheduledDate: '2026-10-03', symptom: '一般治療の再診を継続' },
      { id: 602, targetNumber: cow.earTag, targetName: cow.name, recordType: '繁殖治療', treatmentDate: '2026-10-01', progress: '要再診', nextScheduledDate: '2026-10-05', symptom: '繁殖治療の次回確認' },
    ] as any);
    const detail = await openDetail();
    expect(within(detail.block).queryByText('人工授精')).not.toBeInTheDocument();
    expect(within(detail.block).getByText('削蹄')).toBeInTheDocument();
    expect(within(detail.block).getByText('一般治療の再診を継続')).toBeInTheDocument();
    expect(within(detail.block).queryByText('繁殖治療の次回確認')).not.toBeInTheDocument();
    expect(screen.getByText('理由：繁殖終了の検証')).toBeInTheDocument();
    expect(screen.getByText('種付履歴')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '活動を登録' }));
    expect(screen.queryByRole('link', { name: '発情・種付・移植' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '繁殖検診' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '治療' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '出荷・販売' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '死亡・廃用' })).toHaveAttribute('href', expect.stringContaining('/animal-lifecycle/new?'));
  });

  it('shows a deceased cow historical chart and correction entry without presenting current activity controls', async () => {
    vi.mocked(cattleApi.getCattle).mockResolvedValue({ ...cow,
      lifecycle: { version: 1, death: { date: '2026-10-01', reason: '死亡の検証', note: '過去の履歴を保持', recordedAt: '2026-10-01T00:00:00Z' } } } as any);
    breedingRows = [ai];
    render(<MemoryRouter initialEntries={['/cattle/123']}><Routes><Route path="/cattle/:id" element={<CattleDetail />} /></Routes></MemoryRouter>);
    await screen.findByText('個体カルテ：テスト母牛');
    expect(screen.getByText('死亡日：2026-10-01')).toBeInTheDocument();
    expect(screen.getByText('種付履歴')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '活動を登録' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '記録を追加' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '死亡履歴へ戻る' })).toHaveAttribute('href', '/cattle?state=deceased');
    expect(screen.getByRole('link', { name: '内容を確認・修正' })).toHaveAttribute('href', expect.stringContaining('/animal-lifecycle/new?'));
  });

  it('shows a growing cow age and heat record consistently in the ledger and chart', async () => {
    vi.setSystemTime(new Date(2026, 10, 4, 12));
    const growingCow = { ...cow, stage: '育成牛', birthday: '2026-01-04' };
    vi.mocked(cattleApi.getCattleList).mockResolvedValue([growingCow] as any);
    vi.mocked(cattleApi.getCattle).mockResolvedValue(growingCow as any);
    calvingRows = [];
    breedingRows = [{ id: 'heat-only', cowEarTag: cow.earTag, heatDate: '2026-11-01' }];

    const list = await openList('育成牛');
    expect(within(list.block).getByText('10か月齢（304日齢）')).toBeInTheDocument();
    expect(within(list.block).getByText('発情記録あり')).toBeInTheDocument();
    expect(within(list.block).getByText('発情日：2026-11-01')).toBeInTheDocument();
    expect(within(list.block).queryByText('種付方法の確認')).not.toBeInTheDocument();
    expect(planValues(list.block)).toEqual([['breeding-choice', '']]);
    const listTarget = new URL(within(list.block).getByRole('link', { name: '繁殖記録を確認' }).getAttribute('href')!, 'https://example.test');
    expect(listTarget.pathname).toBe('/breedings/heat-only/edit');
    expect(listTarget.searchParams.get('returnTo')).toBe('/cattle/growing');
    list.unmount();

    const detail = await openDetail();
    expect(screen.getAllByText('10か月齢（304日齢）')).toHaveLength(2);
    expect(within(detail.block).getByText('発情記録あり')).toBeInTheDocument();
    expect(within(detail.block).getByText('発情日：2026-11-01')).toBeInTheDocument();
    expect(within(detail.block).queryByText(/予定日：/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '個体一覧へ戻る' })).toHaveAttribute('href', '/cattle/growing');
    const detailTarget = new URL(within(detail.block).getByRole('link', { name: '繁殖記録を確認' }).getAttribute('href')!, 'https://example.test');
    expect(detailTarget.pathname).toBe('/breedings/heat-only/edit');
    expect(detailTarget.searchParams.get('returnTo')).toBe('/cattle/123');
  });

  it('keeps a deceased growing cow age at death and returns to its growing history', async () => {
    vi.setSystemTime(new Date(2026, 10, 4, 12));
    vi.mocked(cattleApi.getCattle).mockResolvedValue({ ...cow, stage: '育成牛', birthday: '2026-01-04',
      lifecycle: { version: 1, death: { date: '2026-10-04', reason: '死亡の検証', note: '', recordedAt: '2026-10-04T00:00:00Z' } } } as any);
    calvingRows = [];
    render(<MemoryRouter initialEntries={['/cattle/123']}><Routes><Route path="/cattle/:id" element={<CattleDetail />} /></Routes></MemoryRouter>);
    await screen.findByText('個体カルテ：テスト母牛');
    expect(screen.getAllByText('9か月齢（273日齢・死亡時）')).toHaveLength(2);
    expect(screen.getByRole('link', { name: '死亡履歴へ戻る' })).toHaveAttribute('href', '/cattle/growing?state=deceased');
    expect(screen.queryByText('次の予定')).not.toBeInTheDocument();
  });

  it.each([
    { name: 'postpartum', rows: [], expected: [['post-calving-heat', '2026-10-03']] },
    { name: 'heat only', rows: [{ id: 'heat', cowEarTag: '0254', heatDate: '2026-09-17' }], expected: [['breeding-choice', '']] },
    { name: 'AI performed', rows: [ai], expected: [['next-heat', '2026-10-11'], ['pregnancy-check', '2026-11-01']] },
    { name: 'ET planned', rows: [{ ...et, transferDate: '', breedingStatus: '移植予定' }], expected: [['transfer', '2026-09-24']] },
    { name: 'ET performed', rows: [et], expected: [['next-heat', '2026-10-08'], ['pregnancy-check', '2026-10-29']] },
    { name: 'pregnant ET', rows: [{ ...et, pregnancyResult: '受胎' }], expected: [['calving', '2027-06-29']] },
    { name: 'empty', rows: [{ ...ai, pregnancyResult: '空胎' }], expected: [['next-heat', '2026-10-11']] },
    { name: 'recheck', rows: [{ ...ai, pregnancyResult: '再鑑定予定', recheckExpectedDate: '2026-10-15' }], expected: [['recheck', '2026-10-15']] },
    { name: 'recheck missing date', rows: [{ ...ai, pregnancyResult: '再鑑定予定' }], expected: [['recheck', '']] },
  ])('shows the same kinds and dates in both screens: $name', async ({ rows, expected }) => {
    breedingRows = rows;
    await compareBoth(expected);
  });

  it('retains distant calving in both views and treats feed review as undated ongoing work', async () => {
    breedingRows = [{ ...ai, pregnancyResult: '受胎', expectedCalvingDate: '2026-11-01' }];
    const view = await compareBoth([['calving', '2026-11-01'], ['feed-review', '']]);
    const card = within(view.block);
    expect(card.getByText('分娩予定日：2026-11-01（継続中の確認）')).toBeInTheDocument();
    expect(view.block.querySelector('[data-plan-kind="feed-review"]')!.textContent).not.toContain('予定日：未登録');
  });

  it('keeps an unresolved task beyond the old seven-day overdue cutoff', async () => {
    vi.setSystemTime(new Date(2026, 11, 1, 12));
    breedingRows = [ai];
    await compareBoth([['next-heat', '2026-10-11'], ['pregnancy-check', '2026-11-01']]);
  });

  it('re-evaluates corrected heat and cancelled diagnosis snapshots on page reopen', async () => {
    breedingRows = [{ ...et, heatDate: '2026-09-18' }];
    (await compareBoth([['next-heat', '2026-10-09'], ['pregnancy-check', '2026-10-30']])).unmount();
    breedingRows = [{ ...et, pregnancyResult: '再鑑定予定', recheckExpectedDate: '2026-10-15', pregnancyCheckDate: '2026-10-01' }];
    (await compareBoth([['recheck', '2026-10-15']])).unmount();
    breedingRows = [{ ...et, pregnancyResult: '未鑑定', pregnancyCheckDate: '', recheckExpectedDate: '' }];
    await compareBoth([['next-heat', '2026-10-08'], ['pregnancy-check', '2026-10-29']]);
  }, 15000);

  it('re-evaluates deletion snapshots without retaining the removed cycle or calving', async () => {
    breedingRows = [ai];
    (await compareBoth([['next-heat', '2026-10-11'], ['pregnancy-check', '2026-11-01']])).unmount();
    breedingRows = [];
    (await compareBoth([['post-calving-heat', '2026-10-03']])).unmount();
    calvingRows = [];
    const detail = await compareBoth([]);
    expect(within(detail.block).getByText('現在、次の予定はありません。')).toBeInTheDocument();
  }, 15000);

  it('does not combine the records of two cows with identical names', async () => {
    breedingRows = [{ ...ai, cowEarTag: '9999' }];
    await compareBoth([['post-calving-heat', '2026-10-03']]);
  });

  it('shows a record-identity warning in both views instead of guessing from names', async () => {
    breedingRows = [{ ...ai, cowEarTag: '' }];
    const list = await openList();
    expect(within(list.block).getByText(/牛名だけでは/)).toBeInTheDocument();
    expect(within(list.block).queryByText('予定なし')).not.toBeInTheDocument();
    list.unmount();
    const detail = await openDetail();
    expect(within(detail.block).getByText(/牛名だけでは/)).toBeInTheDocument();
    expect(within(detail.block).queryByText('現在、次の予定はありません。')).not.toBeInTheDocument();
  });

  it('does not manufacture a new cycle from undated pregnancy evidence after calving', async () => {
    breedingRows = [{ id: 'unknown', cowEarTag: '0254', pregnancyResult: '受胎', expectedCalvingDate: '2027-06-29' }];
    const detail = await compareBoth([]);
    expect(within(detail.block).getByText(/現在の繁殖周期を判定できません/)).toBeInTheDocument();
    expect(within(detail.block).queryByText('発情予定日')).not.toBeInTheDocument();
  });

  it.each(['breeding', 'calving', 'sales', 'settings'])('shows a warning instead of no plans when %s cannot be loaded', async (source) => {
    if (source === 'breeding') vi.mocked(breedingApi.getBreedingList).mockRejectedValue(new Error('read failed'));
    if (source === 'calving') vi.mocked(repository.getAllRecords).mockImplementation(async (store) => { if (store === 'calvings') throw new Error('read failed'); return [] as any; });
    if (source === 'sales') vi.mocked(salesApi.getSalesList).mockRejectedValue(new Error('read failed'));
    if (source === 'settings') vi.mocked(settingsApi.getFarmSettingsForPageOpen).mockRejectedValue(new Error('read failed'));
    const list = await openList();
    expect(within(list.block).getByText(/読み込めませんでした/)).toBeInTheDocument();
    expect(within(list.block).queryByText('予定なし')).not.toBeInTheDocument();
    list.unmount();
    const detail = await openDetail();
    expect(within(detail.block).getByText(/読み込めませんでした/)).toBeInTheDocument();
    expect(within(detail.block).queryByText('現在、次の予定はありません。')).not.toBeInTheDocument();
  });

  it('keeps manual care and shipping tasks and production costs alongside breeding plans', async () => {
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValue([{ id: 't1', cattleId: cow.id, progress: '要再診', nextScheduledDate: '2026-10-03' }] as any);
    vi.mocked(scheduleApi.getScheduleList).mockResolvedValue([{ id: 's1', cattleId: cow.id, title: '体重確認', dueDate: '2026-10-04', status: '未完了' }] as any);
    vi.mocked(salesApi.getSalesList).mockResolvedValue([{ id: 'sale1', cattleId: cow.id, targetType: '成牛', status: '出荷予定', shippingPlanDate: '2026-10-05' }] as any);
    const detail = await openDetail();
    const card = within(detail.block);
    expect(card.getByText('発情予定日')).toBeInTheDocument();
    expect(card.getByText('再診')).toBeInTheDocument();
    expect(card.getByText('体重確認')).toBeInTheDocument();
    expect(card.getByText('出荷予定')).toBeInTheDocument();
    expect(screen.getAllByText('23,175円')).toHaveLength(2);
  });

  it('loads each breeding source once per screen and never saves merely by displaying plans', async () => {
    const save = vi.spyOn(repository, 'saveRecord');
    const remove = vi.spyOn(repository, 'deleteRecord');
    const create = vi.spyOn(breedingApi, 'createBreeding');
    const update = vi.spyOn(breedingApi, 'updateBreeding');
    breedingRows = [et];
    const before = JSON.stringify({ breedingRows, calvingRows });
    await compareBoth([['next-heat', '2026-10-08'], ['pregnancy-check', '2026-10-29']]);
    expect(breedingApi.getBreedingList).toHaveBeenCalledTimes(2);
    expect(salesApi.getSalesList).toHaveBeenCalledTimes(2);
    expect(settingsApi.getFarmSettingsForPageOpen).toHaveBeenCalledTimes(2);
    expect(vi.mocked(repository.getAllRecords).mock.calls.filter(([store]) => store === 'calvings')).toHaveLength(2);
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(JSON.stringify({ breedingRows, calvingRows })).toBe(before);
  });

  it('prefills the cow and return destination for the postpartum entry', async () => {
    const detail = await openDetail();
    const link = within(detail.block).getByRole('link', { name: '発情を登録' });
    const url = new URL(link.getAttribute('href')!, 'https://example.test');
    expect(url.pathname).toBe('/breedings/new');
    expect(url.searchParams.get('targetNumber')).toBe('0254');
    expect(url.searchParams.get('targetName')).toBe(cow.name);
    expect(url.searchParams.get('returnTo')).toBe('/cattle/123');
  });
});
