import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CattleDetail } from './CattleDetail';
import * as cattleApi from '../services/api';
import * as breedingApi from '../services/breedingApi';
import * as vaccineApi from '../services/vaccineApi';
import * as scheduleApi from '../services/scheduleApi';
import * as treatmentApi from '../services/treatmentApi';
import * as salesApi from '../services/salesApi';
import * as repository from '../storage/repository';
import * as feedInventoryApi from '../services/feedInventoryApi';
import * as expensesApi from '../services/expensesApi';
import * as acquisitionApi from '../services/breedingCattleUnallocatedAcquisitionCost';
import * as cattleFarmExpenseApi from '../services/cattleFarmExpenseAllocation';
import * as allFarmExpenseApi from '../services/allFarmExpenseAllocation';
import * as settingsApi from '../services/settingsApi';

const cow = { id: '123', earTag: '7358', name: 'テスト母牛', birthday: '2020-01-01' };
const calving = { id: 'calving-1', cowEarTag: cow.earTag, cowName: cow.name, actualCalvingDate: '2026-08-29', calvingResult: '自然分娩' };
const breeding = { id: 'breeding-1', cowEarTag: cow.earTag, cowName: cow.name, pregnancyResult: '未鑑定' };

function setCalvings(rows: Record<string, unknown>[]) {
  vi.mocked(repository.getAllRecords).mockImplementation(async (store) => (store === 'calvings' ? rows : []) as any);
}

async function openDetail() {
  render(
    <MemoryRouter initialEntries={['/cattle/123']}>
      <Routes><Route path="/cattle/:id" element={<CattleDetail />} /></Routes>
    </MemoryRouter>,
  );
  await screen.findByText('個体カルテ：テスト母牛');
}

function nextCard() {
  return within(screen.getByText('次の予定').parentElement!);
}

describe('CattleDetail post-calving heat reminder', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Freeze only Date so asynchronous rendering and waitFor keep real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 12, 0, 0));
    vi.spyOn(cattleApi, 'getCattle').mockResolvedValue({ ...cow } as any);
    vi.spyOn(breedingApi, 'getBreedingList').mockResolvedValue([]);
    vi.spyOn(vaccineApi, 'getVaccineList').mockResolvedValue([]);
    vi.spyOn(scheduleApi, 'getScheduleList').mockResolvedValue([]);
    vi.spyOn(treatmentApi, 'getTreatmentList').mockResolvedValue([]);
    vi.spyOn(salesApi, 'getSalesList').mockResolvedValue([]);
    vi.spyOn(repository, 'getAllRecords').mockResolvedValue([]);
    vi.spyOn(feedInventoryApi, 'getAnimalFeedCostTotal').mockResolvedValue(23175);
    vi.spyOn(expensesApi, 'getAnimalExpenseTotals').mockResolvedValue({ medical: 0, breeding: 0, other: 0, nonFeedTotal: 0 });
    vi.spyOn(acquisitionApi, 'getBreedingCattleUnallocatedAcquisitionCost').mockResolvedValue(null as any);
    vi.spyOn(cattleFarmExpenseApi, 'getCattleFarmExpenseAllocation').mockResolvedValue(0);
    vi.spyOn(allFarmExpenseApi, 'getAllFarmExpenseAllocation').mockResolvedValue(0);
    vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ estrousCycleDays: 21 } as any);
    setCalvings([{ ...calving }]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows an undated reminder and prefilled heat-entry link without saving records', async () => {
    const save = vi.spyOn(repository, 'saveRecord');
    const createBreeding = vi.spyOn(breedingApi, 'createBreeding');
    const updateBreeding = vi.spyOn(breedingApi, 'updateBreeding');
    await openDetail();
    const card = nextCard();
    expect(card.getByText('分娩後の発情確認')).toBeInTheDocument();
    expect(card.getByText('分娩後34日。発情を確認したら登録してください。')).toBeInTheDocument();
    expect(card.queryByText('現在、次の予定はありません。')).not.toBeInTheDocument();
    expect(card.queryByText(/予定日：/)).not.toBeInTheDocument();
    const link = card.getByRole('link', { name: '発情を登録' });
    const url = new URL(link.getAttribute('href')!, 'https://example.test');
    expect(url.pathname).toBe('/breedings/new');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      targetNumber: cow.earTag, targetName: cow.name, cattleId: cow.id, returnTo: '/cattle/123',
    });
    expect(screen.getAllByText('23,175円')).toHaveLength(2);
    expect(save).not.toHaveBeenCalled();
    expect(createBreeding).not.toHaveBeenCalled();
    expect(updateBreeding).not.toHaveBeenCalled();
  });

  it('does not revive breeding plans from before the latest calving', async () => {
    vi.mocked(breedingApi.getBreedingList).mockResolvedValue([
      { ...breeding, inseminationDate: '2025-11-15', pregnancyResult: '受胎', breedingStatus: '分娩済み', expectedCalvingDate: '2026-08-29', pregnancyCheckExpectedDate: '2025-12-27' },
    ] as any);
    await openDetail();
    expect(nextCard().getByText('分娩後の発情確認')).toBeInTheDocument();
    expect(nextCard().queryByText('分娩予定')).not.toBeInTheDocument();
    expect(nextCard().queryByText('妊娠鑑定')).not.toBeInTheDocument();
  });

  it.each([
    'heatDate', 'inseminationDate', 'serviceDate', 'transferDate', 'actualTransferDate',
    'transferPlannedDate', 'pregnancyCheckDate', 'pregnancyDiagnosisDate',
  ])('hides the initial reminder when %s is recorded after calving', async (field) => {
    vi.mocked(breedingApi.getBreedingList).mockResolvedValue([{ ...breeding, [field]: '2026-09-20' }] as any);
    await openDetail();
    expect(nextCard().queryByText('分娩後の発情確認')).not.toBeInTheDocument();
  });

  it('checks every activity date rather than letting an older date hide a newer one', async () => {
    vi.mocked(breedingApi.getBreedingList).mockResolvedValue([
      { ...breeding, serviceDate: '2026-08-01', heatDate: '2026-09-20' },
    ] as any);
    await openDetail();
    expect(nextCard().queryByText('分娩後の発情確認')).not.toBeInTheDocument();
  });

  it('does not duplicate an activity already recorded on the calving date', async () => {
    vi.mocked(breedingApi.getBreedingList).mockResolvedValue([{ ...breeding, heatDate: '2026-08-29' }] as any);
    await openDetail();
    expect(nextCard().queryByText('分娩後の発情確認')).not.toBeInTheDocument();
  });

  it('keeps next heat and pregnancy-check dates and the pregnancy-entry link after insemination', async () => {
    vi.mocked(breedingApi.getBreedingList).mockResolvedValue([
      { ...breeding, heatDate: '2026-09-19', inseminationDate: '2026-09-20', nextHeatExpectedDate: '2026-10-11', pregnancyCheckExpectedDate: '2026-11-01' },
    ] as any);
    await openDetail();
    const card = nextCard();
    expect(card.queryByText('分娩後の発情確認')).not.toBeInTheDocument();
    expect(card.getByText('次回発情確認')).toBeInTheDocument();
    expect(card.getByText('予定日：2026-10-11')).toBeInTheDocument();
    expect(card.getByText('予定日：2026-11-01')).toBeInTheDocument();
    expect(card.getByRole('link', { name: '妊娠鑑定を登録' })).toHaveAttribute('href', '/pregnancy-checks/breeding-1/edit?returnTo=%2Fcattle%2F123');
  });

  it('keeps the ET execution link even when only the planned transfer date is available', async () => {
    vi.mocked(breedingApi.getBreedingList).mockResolvedValue([
      { ...breeding, breedingMethod: '受精卵移植', breedingStatus: '移植予定', transferPlannedDate: '2026-10-03' },
    ] as any);
    await openDetail();
    const card = nextCard();
    expect(card.queryByText('分娩後の発情確認')).not.toBeInTheDocument();
    expect(card.getByText('予定日：2026-10-03')).toBeInTheDocument();
    expect(card.getByRole('link', { name: '受精卵移植を実施' })).toHaveAttribute('href', '/breedings/breeding-1/transfer?returnTo=%2Fcattle%2F123');
  });

  it('does not suggest initial heat observation for a currently pregnant cow', async () => {
    vi.mocked(breedingApi.getBreedingList).mockResolvedValue([
      { ...breeding, pregnancyResult: '受胎', expectedCalvingDate: '2027-06-30' },
    ] as any);
    await openDetail();
    expect(screen.getByText('受胎中')).toBeInTheDocument();
    expect(nextCard().getByText('分娩予定')).toBeInTheDocument();
    expect(nextCard().queryByText('分娩後の発情確認')).not.toBeInTheDocument();
  });

  it('preserves all three existing dated care, manual, and shipping plans alongside the reminder', async () => {
    vi.mocked(treatmentApi.getTreatmentList).mockResolvedValue([
      { id: 't1', cattleId: cow.id, progress: '要再診', nextScheduledDate: '2026-10-03' },
    ] as any);
    vi.mocked(scheduleApi.getScheduleList).mockResolvedValue([
      { id: 's1', cattleId: cow.id, title: '体重確認', dueDate: '2026-10-04', status: '未完了' },
    ] as any);
    vi.mocked(salesApi.getSalesList).mockResolvedValue([
      { id: 'sale1', cattleId: cow.id, targetType: '成牛', status: '出荷予定', shippingPlanDate: '2026-10-05' },
    ] as any);
    await openDetail();
    const card = nextCard();
    expect(card.getByText('分娩後の発情確認')).toBeInTheDocument();
    expect(card.getByText('再診')).toBeInTheDocument();
    expect(card.getByText('体重確認')).toBeInTheDocument();
    expect(card.getByText('出荷予定')).toBeInTheDocument();
    expect(card.getAllByText(/予定日：/).map((node) => node.textContent)).toEqual([
      '予定日：2026-10-03', '予定日：2026-10-04', '予定日：2026-10-05',
    ]);
  });

  it('does not infer a postpartum reminder without a calving record', async () => {
    setCalvings([]);
    await openDetail();
    expect(nextCard().queryByText('分娩後の発情確認')).not.toBeInTheDocument();
    expect(nextCard().getByText('現在、次の予定はありません。')).toBeInTheDocument();
  });

  it.each(['2026-10-03', 'invalid'])('does not infer a postpartum reminder from a future or invalid calving date: %s', async (date) => {
    setCalvings([{ ...calving, actualCalvingDate: date }]);
    await openDetail();
    expect(nextCard().queryByText('分娩後の発情確認')).not.toBeInTheDocument();
  });

  it('uses the latest calving and ignores breeding history belonging to earlier calvings', async () => {
    setCalvings([{ ...calving, id: 'older', actualCalvingDate: '2025-08-01' }, { ...calving }]);
    vi.mocked(breedingApi.getBreedingList).mockResolvedValue([{ ...breeding, heatDate: '2025-10-01' }] as any);
    await openDetail();
    expect(nextCard().getByText('分娩後34日。発情を確認したら登録してください。')).toBeInTheDocument();
  });

  it('uses the local calendar day just after midnight', async () => {
    vi.setSystemTime(new Date(2026, 9, 2, 0, 30, 0));
    await openDetail();
    expect(nextCard().getByText('分娩後34日。発情を確認したら登録してください。')).toBeInTheDocument();
  });

  it('keeps the sold-cow screen free of new breeding guidance', async () => {
    vi.mocked(salesApi.getSalesList).mockResolvedValue([
      { id: 'sold', cattleId: cow.id, targetType: '成牛', status: '販売済み', saleDate: '2026-10-01', salePrice: '300000' },
    ] as any);
    await openDetail();
    expect(screen.getByText('販売結果')).toBeInTheDocument();
    expect(screen.queryByText('次の予定')).not.toBeInTheDocument();
    expect(screen.queryByText('分娩後の発情確認')).not.toBeInTheDocument();
  });
});
