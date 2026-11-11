import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CattleDetail } from '../pages/CattleDetail';
import { CalfDetail } from '../pages/CalfDetail';
import { Home } from '../pages/Home';
import { getTreatmentList } from '../services/treatmentApi';
import { getAllRecords, saveRecord } from '../storage/repository';

const state = vi.hoisted(() => ({ cattle: [] as any[], calves: [] as any[], treatments: [] as any[] }));
vi.mock('../services/api', () => ({ getCattle: vi.fn(async () => state.cattle[0]), getCattleList: vi.fn(async () => state.cattle), pullNewerCattleRecordsFromCloud: vi.fn(async () => 0) }));
vi.mock('../services/calfApi', () => ({ getCalfList: vi.fn(async () => state.calves), getCalfListForHomeSummary: vi.fn(async () => state.calves) }));
vi.mock('../services/treatmentApi', () => ({ getTreatmentList: vi.fn(async () => state.treatments) }));
vi.mock('../storage/repository', () => ({ getAllRecords: vi.fn(), getRecordById: vi.fn(async () => state.calves[0]), saveRecord: vi.fn() }));
vi.mock('../services/breedingApi', () => ({ getBreedingList: vi.fn(async () => []), getBreedingListForHomeSummary: vi.fn(async () => []) }));
vi.mock('../services/calvingsApi', () => ({ fetchCalvings: vi.fn(async () => []) }));
vi.mock('../services/calvingRecordSync', () => ({ pullNewerCalvingRecordsFromCloud: vi.fn(async () => ({ applied: 0 })) }));
vi.mock('../services/vaccineApi', () => ({ getVaccineList: vi.fn(async () => []) }));
vi.mock('../services/scheduleApi', () => ({ getScheduleList: vi.fn(async () => []) }));
vi.mock('../services/salesApi', () => ({ getSalesList: vi.fn(async () => []) }));
vi.mock('../services/feedInventoryApi', () => ({ getAnimalFeedCostTotal: vi.fn(async () => 0) }));
vi.mock('../services/expensesApi', () => ({ getAnimalExpenseTotals: vi.fn(async () => ({ medical: 0, breeding: 0, other: 0, nonFeedTotal: 0 })) }));
vi.mock('../services/breedingCattleUnallocatedAcquisitionCost', () => ({ getBreedingCattleUnallocatedAcquisitionCost: vi.fn(async () => null) }));
vi.mock('../services/cattleFarmExpenseAllocation', () => ({ getCattleFarmExpenseAllocation: vi.fn(async () => 0) }));
vi.mock('../services/allFarmExpenseAllocation', () => ({ getAllFarmExpenseAllocation: vi.fn(async () => 0) }));
vi.mock('../services/farmExpenseAllocation', () => ({ getCalfYearlyFarmExpenseAllocation: vi.fn(async () => 0) }));
vi.mock('../services/breedingCattleAcquisitionAllocation', () => ({ getBreedingCattleAcquisitionAllocationForCalf: vi.fn(async () => ({ amount: 0, allocationParity: 7 })) }));
vi.mock('../services/monthlyBalanceApi', () => ({ getMonthlyBalance: vi.fn(async () => ({ rows: [], totals: null })) }));
vi.mock('../services/settingsApi', () => ({ getFarmSettings: vi.fn(async () => ({ estrousCycleDays: 21 })) }));
vi.mock('../services/cattlePlanSnapshot', () => ({ getCattlePlanSnapshot: vi.fn(async () => ({ breedings: [], calvings: [], sales: [], cycleDays: 21, unavailable: [] })) }));
vi.mock('../services/farmStoryAdditionalRecords', () => ({ loadFarmStoryAdditionalRecords: vi.fn(async () => ({ items: [], failedCategories: [] })) }));
vi.mock('../services/activityRecordsApi', () => ({ getActivityRecords: vi.fn(async () => []), ACTIVITY_RECORD_SYNC_STATUS_EVENT: 'fixture:activity-sync' }));
vi.mock('../services/authClient', () => ({ getStoredAuthUser: () => ({ id: 'fixture-user', farmId: 'fixture-farm' }), getAuthToken: () => 'fixture-token' }));
vi.mock('../services/feedingAlertActionsApi', () => ({ fetchFeedingAlertActions: vi.fn(async () => []), getFeedingAlertActionSyncContext: () => ({ farmId: 'fixture-farm', userId: 'fixture-user', token: 'fixture-token', planId: 'free', cloudEnabled: false }), assertFeedingAlertActionSyncContext: () => {} }));
vi.mock('./AnimalActivityRecords', () => ({ AnimalActivityRecords: () => null }));
vi.mock('./TodayTasks', () => ({ TodayTasks: ({ renderItems }: any) => <>{renderItems?.([], false, [])}</> }));

const medication = { id: 101, recordType: '投薬', treatmentDate: '2026-11-02', targetNumber: '0123', targetName: '確認牛',
  medicine: '画面確認用薬品', dosage: '3 mL', withdrawalEndDate: '2026-11-09', progress: '', symptom: '', diagnosis: '' };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
  state.cattle = [{ id: 'cow-fixture', earTag: '0123', identificationNumber: '0000000123', name: '確認牛', birthday: '2022-04-01', stage: '繁殖牛' }];
  state.calves = [{ id: 21, calfNumber: '0456', identificationNumber: '0000000456', name: '確認子牛', birthday: '2026-07-01', sex: '雌', note: '' }];
  state.treatments = [medication];
  vi.mocked(getAllRecords).mockImplementation(async store => (store === 'cattle' ? state.cattle : store === 'calves' ? state.calves : []) as never);
  vi.mocked(getTreatmentList).mockImplementation(async () => state.treatments as never);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('投薬を個体カルテと農場ストーリーへ表示', () => {
  it('成牛カルテは投薬の個体違いを除き、既存の治療の同名照合を維持する', async () => {
    state.treatments = [medication,
      { ...medication, id: 102, targetNumber: '0456', medicine: '別個体の投薬' },
      { ...medication, id: 103, recordType: '治療', targetNumber: 'OLD-NUMBER', symptom: '既存の治療症状', medicine: '既存治療薬', progress: '経過観察' }];
    const before = JSON.stringify(state.treatments);
    render(<MemoryRouter initialEntries={['/cattle/cow-fixture']}><Routes><Route path="/cattle/:id" element={<CattleDetail />} /></Routes></MemoryRouter>);
    const table = await screen.findByRole('table', { name: '治療・投薬の履歴' });
    expect(within(table).getByText('投薬')).toBeInTheDocument();
    expect(within(table).getByText('薬品：画面確認用薬品')).toBeInTheDocument();
    const medicationRow = within(table).getByText('薬品：画面確認用薬品').closest('tr')!;
    expect(within(medicationRow).getByText('投薬量：3 mL')).toBeInTheDocument();
    expect(within(table).getByText('既存の治療症状')).toBeInTheDocument();
    expect(screen.queryByText(/別個体の投薬/)).not.toBeInTheDocument();
    expect(within(table).getAllByRole('link', { name: '確認・編集' })[0])
      .toHaveAttribute('href', '/treatments/101/edit?returnTo=%2Fcattle%2Fcow-fixture');
    expect(JSON.stringify(state.treatments)).toBe(before);
    expect(saveRecord).not.toHaveBeenCalled();
  });

  it('子牛カルテは治療受信後に台帳を照合し、治療と投薬を表示する', async () => {
    let resolve!: (rows: any[]) => void;
    const pending = new Promise<any[]>(done => { resolve = done; });
    vi.mocked(getTreatmentList).mockReturnValueOnce(pending);
    state.treatments = [{ ...medication, targetNumber: '0456', targetName: '確認子牛' },
      { ...medication, id: 102, recordType: '治療', targetNumber: '0456', targetName: '確認子牛', symptom: '子牛の治療症状', medicine: '', progress: '経過観察' },
      { ...medication, id: 103, targetNumber: '21', targetName: '確認子牛', medicine: '内部IDを番号と誤解した記録' }];
    render(<MemoryRouter initialEntries={['/calves/21']}><Routes><Route path="/calves/:id" element={<CalfDetail />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(getTreatmentList).toHaveBeenCalledOnce());
    expect(getAllRecords).not.toHaveBeenCalledWith('calves');
    expect(getAllRecords).not.toHaveBeenCalledWith('cattle');
    await act(async () => { resolve(state.treatments); });
    const table = await screen.findByRole('table', { name: '治療・投薬の履歴' });
    expect(within(table).getByText('投薬')).toBeInTheDocument();
    expect(within(table).getByText('子牛の治療症状')).toBeInTheDocument();
    expect(screen.queryByText(/内部IDを番号と誤解した記録/)).not.toBeInTheDocument();
    expect(within(table).getAllByRole('link', { name: '確認・編集' })[0])
      .toHaveAttribute('href', '/treatments/101/edit?returnTo=%2Fcalves%2F21');
    expect(screen.getByRole('link', { name: '投薬を記録' })).toHaveAttribute('href', expect.stringContaining('recordType=%E6%8A%95%E8%96%AC'));
    expect(saveRecord).not.toHaveBeenCalled();
  });

  it('Homeの投薬ストーリーから正しい個体カルテへ直接開ける', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cattle/:id" element={<div>投薬対象の個体カルテ</div>} />
        </Routes>
      </MemoryRouter>
    );
    const story = await screen.findByRole('region', { name: '農場ストーリー' });
    fireEvent.click(await within(story).findByText('0123 確認牛：投薬'));
    expect(await screen.findByText('投薬対象の個体カルテ')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '元の記録を開く' })).not.toBeInTheDocument();
    expect(saveRecord).not.toHaveBeenCalled();
  });
});
