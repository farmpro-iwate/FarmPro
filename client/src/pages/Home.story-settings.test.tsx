import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from './Home';
import * as authClient from '../services/authClient';
import type { AuthUser } from '../services/authClient';
import * as cattleApi from '../services/api';
import * as calfApi from '../services/calfApi';
import * as breedingApi from '../services/breedingApi';
import * as calvingsApi from '../services/calvingsApi';
import * as calvingSync from '../services/calvingRecordSync';
import * as treatmentApi from '../services/treatmentApi';
import * as vaccineApi from '../services/vaccineApi';
import * as salesApi from '../services/salesApi';
import * as monthlyBalanceApi from '../services/monthlyBalanceApi';
import * as settingsApi from '../services/settingsApi';
import * as cattlePlanSnapshotService from '../services/cattlePlanSnapshot';
import * as additionalRecords from '../services/farmStoryAdditionalRecords';
import * as activityRecords from '../services/activityRecordsApi';
import * as repository from '../storage/repository';
import type { FarmStoryItem } from '../utils/farmStoryTypes';

// The story, settings dialog, and preference persistence stay real. Today's
// unrelated task panel must not start additional business-service operations.
vi.mock('../components/TodayTasks', () => ({
  TodayTasks: ({ renderItems }: ComponentProps<typeof import('../components/TodayTasks').TodayTasks>) => (
    <>{renderItems?.([], false, [])}</>
  ),
}));

const originalUser: AuthUser = {
  id: 'story-user', farmId: 'story-farm', farmName: '表示設定の検証農場', name: '表示設定の利用者',
  role: 'owner', active: true, plan: 'standard',
};
const originalLabels = ['牛の登録', '子牛の登録', '繁殖', '分娩', '治療・投薬', 'ワクチン', '出荷・販売'];
const additionalLabels = ['医薬品の入出庫', '受精卵の入出庫', '飼料の入出庫', '飼料給与', '経費', 'BLV検査', '給与アラート対応', '肥育移行', '農場作業', '個体の記録'];
let currentUser: AuthUser;
let baseRows: ReturnType<typeof defaultRows>;
let extraRows: FarmStoryItem[];
let originalRows: string;
let user: ReturnType<typeof userEvent.setup>;
let fetchMock: ReturnType<typeof vi.fn>;
let writeSpies: ReturnType<typeof vi.spyOn>[];

function defaultRows() {
  return {
    cattle: [{ id: 101, earTag: 'STORY-COW', name: '既存の母牛', stage: '繁殖牛', createdAt: '2026-10-01T00:00:00.000Z' }],
    calves: [{ id: 201, calfNumber: 'STORY-CALF', name: '既存の子牛', createdAt: '2026-10-02T00:00:00.000Z', birthday: '2026-10-01', motherName: '母牛' }],
    breedings: [{ id: 'breeding-1', cowEarTag: 'BREED-COW', cowName: '繁殖の対象', breedingMethod: '種付', breedingStatus: '種付実施', pregnancyResult: '未鑑定', inseminationDate: '2026-10-03' }],
    calvings: [{ id: 'calving-1', cowEarTag: 'CALVING-COW', cowName: '分娩の対象', actualCalvingDate: '2026-10-04', calfName: '分娩の子牛', calvingResult: '自然分娩' }],
    treatments: [{ id: 301, targetNumber: 'TREAT-COW', targetName: '治療の対象', treatmentDate: '2026-10-05', progress: '回復', diagnosis: '検証用の記録' }],
    vaccines: [{ id: 401, targetNumber: 'VACCINE-COW', targetName: 'ワクチンの対象', vaccinationDate: '2026-10-06', status: '接種済み', vaccineName: '既存ワクチン' }],
    sales: [{ id: 'sale-1', targetNumber: 'SALE-COW', targetName: '販売の対象', saleDate: '2026-10-07', status: '販売済み', marketName: '既存市場' }],
  };
}

function expenseItem(id = 'expense-1', title = '修繕費の記録'): FarmStoryItem {
  return {
    id: `story:expense:${id}`, date: '2026-11-01', categoryId: 'expense', category: '経費',
    title, detail: '設備の修理 / 1,200 円', sourcePath: `/expenses/${id}/edit`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function renderHome() {
  return render(<MemoryRouter><Home /></MemoryRouter>);
}

function story() {
  return within(screen.getByRole('region', { name: '農場ストーリー' }));
}

async function loaded() {
  await screen.findByRole('region', { name: '農場ストーリー' });
  await waitFor(() => expect(screen.queryByText('ホームを読み込み中です...')).not.toBeInTheDocument());
}

async function openSettings() {
  await user.click(story().getByRole('button', { name: '表示設定' }));
  return within(await screen.findByRole('dialog', { name: '農場ストーリーの表示設定' }));
}

async function saveSettings() {
  const dialog = within(screen.getByRole('dialog', { name: '農場ストーリーの表示設定' }));
  await user.click(dialog.getByRole('button', { name: '保存' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '農場ストーリーの表示設定' })).not.toBeInTheDocument());
}

async function selectOnly(...labels: string[]) {
  const dialog = await openSettings();
  await user.click(dialog.getByRole('button', { name: '全解除' }));
  for (const label of labels) await user.click(dialog.getByRole('checkbox', { name: label }));
  await saveSettings();
}

function expectInitialChecks(dialog: ReturnType<typeof within>) {
  expect(dialog.getAllByRole('checkbox')).toHaveLength(17);
  for (const label of originalLabels) expect(dialog.getByRole('checkbox', { name: label })).toBeChecked();
  for (const label of additionalLabels) expect(dialog.getByRole('checkbox', { name: label })).not.toBeChecked();
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-02T12:00:00.000Z'));
  currentUser = { ...originalUser };
  baseRows = defaultRows();
  extraRows = [expenseItem()];
  originalRows = JSON.stringify({ baseRows, extraRows });
  user = userEvent.setup();
  vi.spyOn(authClient, 'getStoredAuthUser').mockImplementation(() => currentUser);
  vi.spyOn(authClient, 'getAuthToken').mockReturnValue('story-fixture-token');
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(cattleApi, 'pullNewerCattleRecordsFromCloud').mockResolvedValue(0);
  vi.spyOn(cattleApi, 'getCattleList').mockImplementation(async () => baseRows.cattle as never);
  vi.spyOn(calfApi, 'getCalfList').mockImplementation(async () => baseRows.calves as never);
  vi.spyOn(calfApi, 'getCalfListForHomeSummary').mockImplementation(async () => baseRows.calves as never);
  vi.spyOn(breedingApi, 'getBreedingList').mockImplementation(async () => baseRows.breedings as never);
  vi.spyOn(breedingApi, 'getBreedingListForHomeSummary').mockImplementation(async () => baseRows.breedings as never);
  vi.spyOn(calvingSync, 'pullNewerCalvingRecordsFromCloud').mockResolvedValue({ applied: 0 });
  vi.spyOn(calvingsApi, 'fetchCalvings').mockImplementation(async () => baseRows.calvings as never);
  vi.spyOn(calvingsApi, 'fetchCalvingsReadOnly').mockImplementation(async () => baseRows.calvings as never);
  vi.spyOn(treatmentApi, 'getTreatmentList').mockImplementation(async () => baseRows.treatments as never);
  vi.spyOn(vaccineApi, 'getVaccineList').mockImplementation(async () => baseRows.vaccines as never);
  vi.spyOn(salesApi, 'getSalesList').mockImplementation(async () => baseRows.sales as never);
  vi.spyOn(monthlyBalanceApi, 'getMonthlyBalance').mockResolvedValue({ rows: [], totals: null } as never);
  vi.spyOn(settingsApi, 'getFarmSettings').mockResolvedValue({ estrousCycleDays: 21 } as never);
  vi.spyOn(cattlePlanSnapshotService, 'getCattlePlanSnapshot').mockResolvedValue({
    breedings: [], calvings: [], sales: [], cycleDays: 21, unavailable: [],
  });
  vi.spyOn(additionalRecords, 'loadFarmStoryAdditionalRecords').mockImplementation(async categories => ({
    items: extraRows.filter(row => categories.includes(row.categoryId)), failedCategories: [],
  }));
  vi.spyOn(activityRecords, 'getActivityRecords').mockResolvedValue([]);
  fetchMock = vi.fn(async () => { throw new Error('Story preferences must not issue an HTTP write'); });
  vi.stubGlobal('fetch', fetchMock);
  writeSpies = [
    vi.spyOn(repository, 'saveRecord'), vi.spyOn(repository, 'saveRecordPreservingTimestamps'),
    vi.spyOn(repository, 'saveManyRecords'), vi.spyOn(repository, 'deleteRecord'), vi.spyOn(repository, 'replaceAllRecords'),
  ];
});

afterEach(() => {
  cleanup();
  expect(fetchMock).not.toHaveBeenCalled();
  for (const write of writeSpies) expect(write).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('farm story display settings through the real Home', () => {
  it('counts deceased animals out of residency and retains culled cattle in their own resident count', async () => {
    const event = { date: '2026-11-01', reason: '検証', note: '', recordedAt: '2026-11-01T00:00:00Z' };
    baseRows.cattle = [baseRows.cattle[0],
      { ...baseRows.cattle[0], id: 102, earTag: 'DECEASED-COW', name: '死亡牛', lifecycle: { version: 1, death: event } },
      { ...baseRows.cattle[0], id: 103, earTag: 'CULLED-COW', name: '廃用牛', lifecycle: { version: 1, culling: { ...event, route: 'fattening' } } },
      { ...baseRows.cattle[0], id: 104, earTag: 'FUTURE-COW', name: '未来日記録の牛', lifecycle: { version: 1, death: { ...event, date: '2099-01-01' } } },
    ] as typeof baseRows.cattle;
    baseRows.calves = [baseRows.calves[0],
      { ...baseRows.calves[0], id: 202, calfNumber: 'DECEASED-CALF', lifecycle: { version: 1, death: event } },
      { ...baseRows.calves[0], id: 203, calfNumber: 'LEGACY-CALF', managementStatus: '死亡・その他' },
    ] as typeof baseRows.calves;
    baseRows.breedings = ['STORY-COW', 'DECEASED-COW', 'CULLED-COW'].map((tag, index) => ({
      ...baseRows.breedings[0], id: `pregnancy-${index}`, cowEarTag: tag, pregnancyResult: '受胎',
    }));
    const original = JSON.stringify(baseRows);
    renderHome(); await loaded();
    expect(screen.getByRole('link', { name: '繁殖牛一覧を開く' })).toHaveTextContent('2 頭');
    expect(screen.getByRole('link', { name: '廃用の在籍牛を開く' })).toHaveTextContent('1 頭');
    expect(screen.getByRole('link', { name: '子牛台帳を開く' })).toHaveTextContent('1 頭');
    expect(screen.getByRole('link', { name: '繁殖管理を開く' })).toHaveTextContent('1 頭');
    expect(JSON.stringify(baseRows)).toBe(original);
  });

  it('pulls activities only when selected, before reading the story, and refreshes after sync', async () => {
    extraRows = [{ id: 'farm-work', date: '2026-11-01', categoryId: 'farmWork', category: '農場作業',
      title: '敷料交換の記録', detail: '検証記録', sourcePath: '/activities/farm-work/edit' }];
    renderHome(); await loaded();
    expect(activityRecords.getActivityRecords).not.toHaveBeenCalled();
    const pulling = deferred<Awaited<ReturnType<typeof activityRecords.getActivityRecords>>>();
    vi.mocked(activityRecords.getActivityRecords).mockReturnValueOnce(pulling.promise);
    await selectOnly('農場作業');
    expect(activityRecords.getActivityRecords).toHaveBeenCalledOnce();
    expect(vi.mocked(additionalRecords.loadFarmStoryAdditionalRecords).mock.calls.every(([categories]) => !categories.includes('farmWork'))).toBe(true);
    await act(async () => { pulling.resolve([]); });
    expect(await story().findByText('敷料交換の記録')).toBeInTheDocument();
    fireEvent(window, new Event(activityRecords.ACTIVITY_RECORD_SYNC_STATUS_EVENT));
    await waitFor(() => expect(activityRecords.getActivityRecords).toHaveBeenCalledTimes(2));
    await story().findByText('敷料交換の記録');
  });

  it('uses confirmed animal identity for direct chart links and does not guess reused or unknown ear tags', async () => {
    const identity = { activityType: 'animal', animalKind: 'calf' as const, animalId: '999', animalEarTag: 'STORY-CALF',
      animalName: '既存の子牛', animalBirthday: '2026-10-01' };
    const matching: FarmStoryItem = { id: 'animal-note', date: '2026-11-01', categoryId: 'animalRecord', category: '個体の記録',
      title: '対象子牛の観察', detail: '元のメモ', animalKind: 'calf', earTag: 'STORY-CALF', sourcePath: '/activities/animal-note/edit', activityAnimal: identity };
    extraRows = [matching, { ...matching, id: 'another-note', title: '同じ耳標の別個体の記録',
      activityAnimal: { ...identity, animalBirthday: '2025-10-01' } },
      { ...matching, id: 'unmatched-temporary-calf', title: '仮-1101：未登録子牛の観察',
        earTag: 'TEMP-hidden-identity', birthday: '2026-11-01', sourcePath: '/activities/unmatched-temporary-calf/edit',
        activityAnimal: { ...identity, animalEarTag: 'TEMP-hidden-identity', animalBirthday: '2026-11-01', animalName: '' } }];
    renderHome(); await loaded(); await selectOnly('個体の記録');

    const matched = story().getByRole('button', { name: /対象子牛の観察/ });
    expect(matched).toHaveTextContent('個体カルテを開く');
    await user.click(matched);
    await waitFor(() => expect(window.location.pathname).toBe('/calves/201'));

    cleanup(); renderHome(); await loaded(); await selectOnly('個体の記録');
    const reused = story().getByRole('button', { name: /同じ耳標の別個体の記録/ });
    expect(reused).not.toHaveTextContent('個体カルテを開く');

    const temporary = story().getByRole('button', { name: /未登録子牛の観察/ });
    expect(temporary).not.toHaveTextContent('個体カルテを開く');
  });

  it('discards a delayed activity pull if the farm changes before the story read', async () => {
    renderHome(); await loaded();
    const pulling = deferred<Awaited<ReturnType<typeof activityRecords.getActivityRecords>>>();
    vi.mocked(activityRecords.getActivityRecords).mockReturnValueOnce(pulling.promise);
    await selectOnly('農場作業');
    currentUser = { ...originalUser, farmId: 'changed-during-pull' };
    fireEvent(window, new Event('storage'));
    await loaded();
    await act(async () => { pulling.resolve([]); });
    expect(vi.mocked(additionalRecords.loadFarmStoryAdditionalRecords).mock.calls.every(([categories]) => !categories.includes('farmWork'))).toBe(true);
    expectInitialChecks(await openSettings());
  });

  it('preserves the seven existing categories, cancels draft changes, and applies only saved choices', async () => {
    renderHome(); await loaded();
    expect(story().getByText('STORY-COW 既存の母牛を登録')).toBeInTheDocument();
    expect(story().getByText('TREAT-COW 治療の対象：治療')).toBeInTheDocument();
    expect(story().queryByText('修繕費の記録')).not.toBeInTheDocument();

    let dialog = await openSettings(); expectInitialChecks(dialog);
    await user.click(dialog.getByRole('checkbox', { name: '治療・投薬' }));
    await user.click(dialog.getByRole('checkbox', { name: '経費' }));
    await user.click(dialog.getByRole('button', { name: 'キャンセル' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(story().getByText('TREAT-COW 治療の対象：治療')).toBeInTheDocument();
    expect(story().queryByText('修繕費の記録')).not.toBeInTheDocument();

    dialog = await openSettings(); expectInitialChecks(dialog);
    await user.click(dialog.getByRole('checkbox', { name: '治療・投薬' }));
    await user.click(dialog.getByRole('checkbox', { name: '経費' }));
    await saveSettings();
    expect(await story().findByText('修繕費の記録')).toBeInTheDocument();
    expect(story().queryByText('TREAT-COW 治療の対象：治療')).not.toBeInTheDocument();
    expect(story().getByText('STORY-COW 既存の母牛を登録')).toBeInTheDocument();
    expect(JSON.stringify({ baseRows, extraRows })).toBe(originalRows);
  });

  it('restores an explicitly empty selection after reopening without sharing it with another farm or user', async () => {
    renderHome(); await loaded(); await selectOnly();
    expect(story().getByText('表示する項目を選んでください。')).toBeInTheDocument();
    cleanup(); renderHome(); await loaded();
    expect(story().getByText('表示する項目を選んでください。')).toBeInTheDocument();
    let dialog = await openSettings();
    dialog.getAllByRole('checkbox').forEach(checkbox => expect(checkbox).not.toBeChecked());

    for (const changedUser of [
      { ...originalUser, farmId: 'another-farm' }, { ...originalUser, id: 'another-user' },
    ]) {
      cleanup(); currentUser = changedUser; renderHome(); await loaded();
      dialog = await openSettings(); expectInitialChecks(dialog);
    }
    cleanup(); currentUser = { ...originalUser }; renderHome(); await loaded();
    expect(story().getByText('表示する項目を選んでください。')).toBeInTheDocument();
  });

  it('keeps a failed preference save editable and persists only once on a successful double click', async () => {
    renderHome(); await loaded();
    const visibleStory = story();
    const dialog = await openSettings();
    await user.click(dialog.getByRole('button', { name: '全解除' }));
    await user.click(dialog.getByRole('checkbox', { name: '経費' }));
    const persist = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Fixture storage full', 'QuotaExceededError');
    });
    await user.click(dialog.getByRole('button', { name: '保存' }));
    expect(await dialog.findByRole('alert')).toHaveTextContent('表示設定を保存できませんでした');
    expect(dialog.getByRole('checkbox', { name: '経費' })).toBeChecked();
    expect(dialog.getByRole('checkbox', { name: '牛の登録' })).not.toBeChecked();
    expect(visibleStory.getByText('STORY-COW 既存の母牛を登録')).toBeInTheDocument();

    persist.mockClear();
    await user.dblClick(dialog.getByRole('button', { name: '保存' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(persist).toHaveBeenCalledOnce();
    expect(await story().findByText('修繕費の記録')).toBeInTheDocument();
    cleanup(); renderHome(); await loaded();
    expect(await story().findByText('修繕費の記録')).toBeInTheDocument();
    expect(story().queryByText('STORY-COW 既存の母牛を登録')).not.toBeInTheDocument();
  });

  // Rendering 85 MUI cards and reopening the dialog can exceed 5s under the full-suite worker load.
  it('filters before the 40-item page and keeps the existing next-40 interaction', async () => {
    baseRows.cattle = Array.from({ length: 60 }, (_, index) => ({
      ...baseRows.cattle[0], id: index + 1000, earTag: `PAGE-COW-${index}`, name: `母牛${index}`,
      createdAt: '2026-11-01T00:00:00.000Z',
    }));
    baseRows.treatments = Array.from({ length: 85 }, (_, index) => ({
      ...baseRows.treatments[0], id: index + 2000, targetName: `PAGE-TREATMENT-${String(index).padStart(3, '0')}`,
      treatmentDate: '2026-10-01',
    }));
    renderHome(); await loaded(); await selectOnly('治療・投薬');
    expect(story().getAllByRole('button', { name: /PAGE-TREATMENT-/ })).toHaveLength(40);
    expect(story().queryByText(/PAGE-COW-/)).not.toBeInTheDocument();
    await user.click(story().getByRole('button', { name: '続きを表示（40 / 85件）' }));
    expect(story().getAllByRole('button', { name: /PAGE-TREATMENT-/ })).toHaveLength(80);
    await user.click(story().getByRole('button', { name: '続きを表示（80 / 85件）' }));
    expect(story().getAllByRole('button', { name: /PAGE-TREATMENT-/ })).toHaveLength(85);
    expect(story().queryByRole('button', { name: /続きを表示/ })).not.toBeInTheDocument();

    await selectOnly('牛の登録');
    expect(story().getAllByRole('button', { name: /PAGE-COW-/ })).toHaveLength(40);
    expect(story().getByRole('button', { name: '続きを表示（40 / 60件）' })).toBeInTheDocument();
  }, 15000);

  it('opens one non-animal record with its source link and preserves the existing animal drawer', async () => {
    extraRows = [expenseItem(), expenseItem('expense-2', '別の経費記録')];
    renderHome(); await loaded(); await selectOnly('経費');
    await user.click(await story().findByRole('button', { name: /修繕費の記録/ }));
    const heading = await screen.findByRole('heading', { name: '記録の詳細' });
    const drawer = within(heading.closest('.MuiDrawer-paper') as HTMLElement);
    expect(drawer.getByText('修繕費の記録')).toBeInTheDocument();
    expect(drawer.getByText('設備の修理 / 1,200 円')).toBeInTheDocument();
    expect(drawer.queryByText('別の経費記録')).not.toBeInTheDocument();
    expect(drawer.getByRole('link', { name: '元の記録を開く' })).toHaveAttribute('href', '/expenses/expense-1/edit');
    expect(drawer.queryByRole('link', { name: '個体カルテを開く' })).not.toBeInTheDocument();
    await user.click(drawer.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: '記録の詳細' })).not.toBeInTheDocument());

    await selectOnly('牛の登録');
    const cattleStory = story().getByRole('button', { name: /STORY-COW 既存の母牛を登録/ });
    expect(cattleStory).toHaveTextContent('個体カルテを開く');
    await user.click(cattleStory);
    await waitFor(() => expect(window.location.pathname).toBe('/cattle/101'));
  });

  it('shows an unread category as unavailable and lets the user retry its read', async () => {
    vi.mocked(additionalRecords.loadFarmStoryAdditionalRecords).mockImplementation(async categories => ({
      items: [], failedCategories: categories.includes('expense') ? ['expense'] : [],
    }));
    renderHome(); await loaded(); await selectOnly('経費');
    expect(await story().findByText('経費の記録を読み込めませんでした。')).toBeInTheDocument();
    expect(story().queryByText(/表示できる記録はまだありません/)).not.toBeInTheDocument();
    vi.mocked(additionalRecords.loadFarmStoryAdditionalRecords).mockResolvedValue({ items: [expenseItem()], failedCategories: [] });
    await user.click(story().getByRole('button', { name: '再読み込み' }));
    expect(await story().findByText('修繕費の記録')).toBeInTheDocument();
    expect(story().queryByText('経費の記録を読み込めませんでした。')).not.toBeInTheDocument();
  });

  it('resolves additional calf records by their known number or ID without guessing an unknown animal', async () => {
    baseRows.calves[0] = { ...baseRows.calves[0], id: 1 };
    baseRows.calves.push({ ...baseRows.calves[0], id: 2, calfNumber: 'TEMP-known-calf',
      name: '番号と異なる名号', birthday: '2026-10-02' });
    // Home-summary cloud rows receive positional IDs. Reversed cloud order
    // must not turn those display-only IDs into local calf-chart destinations.
    vi.mocked(calfApi.getCalfListForHomeSummary).mockResolvedValue([
      { ...baseRows.calves[1], id: 1 }, { ...baseRows.calves[0], id: 2 },
      { ...baseRows.calves[0], id: 3, calfNumber: 'UNKNOWN-ANIMAL', name: '集計にだけ存在する子牛' },
    ] as never);
    const inventoryPath = '/supply-inventory?kind=%E5%8C%BB%E8%96%AC%E5%93%81';
    extraRows = [
      { id: 'story:medicineInventory:usage-1', categoryId: 'medicineInventory', category: '医薬品の入出庫',
        date: '2026-11-01', title: '子牛の医薬品使用', detail: '数量：-1 個',
        earTag: 'STORY-CALF', sourcePath: inventoryPath },
      { id: 'story:feedingAction:action-1', categoryId: 'feedingAction', category: '給与アラート対応',
        date: '2026-11-01', title: '番号と異なる名号：給与の確認', detail: '状態：対応済み',
        animalKind: 'calf', animalId: '2', animalName: '番号と異なる名号',
        sourcePath: '/feeding-alert-actions/action-1/edit' },
      { id: 'story:medicineInventory:usage-unknown', categoryId: 'medicineInventory', category: '医薬品の入出庫',
        date: '2026-11-01', title: '紐付け先不明の医薬品使用', detail: '数量：-1 個',
        earTag: 'UNKNOWN-ANIMAL', sourcePath: inventoryPath },
    ];
    const original = JSON.stringify(extraRows);
    renderHome(); await loaded(); await selectOnly('医薬品の入出庫', '給与アラート対応');

    const knownByNumber = await story().findByRole('button', { name: /子牛の医薬品使用/ });
    expect(knownByNumber).toHaveTextContent('個体カルテを開く');
    await user.click(knownByNumber);
    await waitFor(() => expect(window.location.pathname).toBe('/calves/1'));

    cleanup(); renderHome(); await loaded(); await selectOnly('医薬品の入出庫', '給与アラート対応');
    const knownById = story().getByRole('button', { name: /番号と異なる名号：給与の確認/ });
    expect(knownById).toHaveTextContent('個体カルテを開く');
    await user.click(knownById);
    await waitFor(() => expect(window.location.pathname).toBe('/calves/2'));

    cleanup(); renderHome(); await loaded(); await selectOnly('医薬品の入出庫', '給与アラート対応');
    const unknown = story().getByRole('button', { name: /紐付け先不明の医薬品使用/ });
    expect(unknown).not.toHaveTextContent('個体カルテを開く');
    await user.click(unknown);
    const source = await screen.findByRole('link', { name: '元の記録を開く' });
    const drawer = within(source.closest('.MuiDrawer-paper') as HTMLElement);
    expect(drawer.queryByRole('link', { name: '個体カルテを開く' })).not.toBeInTheDocument();
    expect(source).toHaveAttribute('href', inventoryPath);
    expect(JSON.stringify(extraRows)).toBe(original);
  });

  it('discards a delayed read after switching farms and does not carry the previous selection into the new farm', async () => {
    renderHome(); await loaded(); await selectOnly('経費');
    await story().findByText('修繕費の記録');
    const reading = deferred<Awaited<ReturnType<typeof additionalRecords.loadFarmStoryAdditionalRecords>>>();
    vi.mocked(additionalRecords.loadFarmStoryAdditionalRecords).mockReturnValueOnce(reading.promise);
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(additionalRecords.loadFarmStoryAdditionalRecords).toHaveLastReturnedWith(reading.promise));

    baseRows.cattle = [{ ...baseRows.cattle[0], name: '切替後の農場の母牛' }];
    currentUser = { ...originalUser, farmId: 'new-farm' };
    fireEvent(window, new Event('storage'));
    expect(await screen.findByText('STORY-COW 切替後の農場の母牛を登録')).toBeInTheDocument();
    await act(async () => { reading.resolve({ items: [expenseItem('old-farm', '旧農場の遅い経費')], failedCategories: [] }); });
    expect(story().queryByText('旧農場の遅い経費')).not.toBeInTheDocument();
    expect(story().queryByText('修繕費の記録')).not.toBeInTheDocument();
    expectInitialChecks(await openSettings());
  });

  it('does not save an open dialog draft after the current account changes', async () => {
    renderHome(); await loaded();
    const dialog = await openSettings();
    await user.click(dialog.getByRole('button', { name: '全解除' }));
    await user.click(dialog.getByRole('checkbox', { name: '経費' }));
    currentUser = { ...originalUser, id: 'new-user' };
    // No focus/storage notification has run yet: Save itself must reject the
    // previous owner's draft, even when the dialog is still on screen.
    await user.click(dialog.getByRole('button', { name: '保存' }));
    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '農場ストーリーの表示設定' })).not.toBeInTheDocument());
    await loaded(); expectInitialChecks(await openSettings());

    cleanup(); currentUser = { ...originalUser }; renderHome(); await loaded();
    expectInitialChecks(await openSettings());
  });
});
