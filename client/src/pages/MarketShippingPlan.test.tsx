import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketShippingPlan from './MarketShippingPlan';
import * as calfApi from '../services/calfApi';
import * as salesApi from '../services/salesApi';
import * as repo from '../storage/repository';
import * as plan from '../plans/current-plan';
import * as policy from '../plans/policy';
import type { Calf } from '../types/calf';

const fixtureMarket = { id: 'fixture-market-a', marketName: '検証市場A', marketDate: '2026-10-15' };

function calfFixture(overrides: Partial<Calf> = {}): Calf {
  return {
    id: 101, calfNumber: 'FIXTURE-RESIDENT-A', identificationNumber: '', name: '検証用在籍子牛A',
    birthday: '2026-01-10', sex: '雌', motherName: '検証用母牛',
    startWeight: 30, currentWeight: 280, elapsedDays: 0, milkAmount: 0, starterAmount: 0,
    feedingMethod: '人工哺育', weaningPlannedDate: '', weaningDate: '', weaningStatus: '離乳済み',
    weaningWeight: 0, weaningStarterAmount: 0, milkEndDate: '', managementStatus: '育成中', note: '',
    ...overrides,
  };
}

function saleFixture(overrides: Partial<salesApi.SaleRecord> = {}): salesApi.SaleRecord {
  return {
    ...salesApi.emptySaleInput, id: 'fixture-sale', targetType: '子牛', targetNumber: 'FIXTURE-RESIDENT-A',
    targetName: '検証用在籍子牛A', marketName: fixtureMarket.marketName, shippingPlanDate: fixtureMarket.marketDate,
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

function setFixtureMarkets(schedules = [fixtureMarket]) {
  vi.mocked(repo.getRecordById).mockResolvedValue({
    id: 'market-shipping-plan-settings', fiscalYear: '2026', minAgeDays: 260, maxAgeDays: 310, schedules,
  });
}

function candidateGroup(marketName: string, displayedDate: string) {
  const card = screen.getAllByText(marketName, { exact: true })
    .map(label => label.closest('.MuiCard-root'))
    .find(element => element && within(element as HTMLElement).queryByRole('heading', { name: new RegExp(displayedDate) }));
  if (!card) throw new Error(`候補の市場枠が見つかりません: ${marketName} ${displayedDate}`);
  return within(card as HTMLElement);
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

describe('MarketShippingPlan', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(plan, 'getCurrentFarmProPlanId').mockReturnValue('free' as any);
    vi.spyOn(policy, 'getFarmProPlan').mockReturnValue({ multiDeviceSync: false } as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);
    vi.spyOn(salesApi, 'getSalesList').mockResolvedValue([] as any);
    vi.spyOn(repo, 'getRecordById').mockResolvedValue(null as any);
    vi.spyOn(repo, 'saveRecord').mockImplementation(async (_store, value: any) => value);
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Market fixtures must not access record APIs'));
  });

  afterEach(() => {
    expect(fetchSpy).not.toHaveBeenCalled();
    cleanup();
    vi.restoreAllMocks();
  });

  it('removes deceased and legacy deceased calves from shipping candidates without removing a resident culled calf', async () => {
    const event = { date: '2026-09-01', reason: '検証', note: '', recordedAt: '2026-09-01T00:00:00Z' };
    const alive = { id: 'alive', calfNumber: 'LIVE-CALF', name: '在籍子牛', birthday: '2026-01-10', sex: '雌', managementStatus: '育成中' };
    vi.mocked(calfApi.getCalfList).mockResolvedValue([alive,
      { ...alive, id: 'dead', calfNumber: 'DEAD-CALF', name: '死亡子牛', lifecycle: { version: 1, death: event } },
      { ...alive, id: 'legacy', calfNumber: 'OLD-CALF', name: '旧死亡子牛', managementStatus: '死亡・その他' },
      { ...alive, id: 'culled', calfNumber: 'CULLED-CALF', name: '廃用在籍子牛', lifecycle: { version: 1, culling: { ...event, route: 'sale' } } },
    ] as any);
    vi.mocked(repo.getRecordById).mockResolvedValue({ id: 'market-shipping-plan-settings', fiscalYear: '2026', minAgeDays: 260,
      maxAgeDays: 310, schedules: [{ id: 'fixture-market', marketName: '検証市場', marketDate: '2026-10-15' }] } as any);
    render(<MemoryRouter><MarketShippingPlan /></MemoryRouter>);
    await screen.findByRole('heading', { name: '市場出荷予定' });
    expect(screen.getByText(/LIVE-CALF/)).toBeInTheDocument();
    expect(screen.getByText(/CULLED-CALF/)).toBeInTheDocument();
    expect(screen.queryByText(/DEAD-CALF/)).not.toBeInTheDocument();
    expect(screen.queryByText(/OLD-CALF/)).not.toBeInTheDocument();
  });

  it('販売記録がなくても台帳で販売済みの仮番号子牛を一覧・頭数・出荷決定から除き、在籍2頭を残す', async () => {
    const residentA = calfFixture();
    const residentB = calfFixture({ id: 102, calfNumber: 'FIXTURE-RESIDENT-B', name: '検証用在籍子牛B', birthday: '2026-01-12' });
    const sold = calfFixture({ id: 103, calfNumber: 'TEMP-FIXTURE-SOLD', name: '耳標未装着', managementStatus: '販売済み' });
    vi.mocked(calfApi.getCalfList).mockResolvedValue([residentA, sold, residentB]);
    vi.mocked(salesApi.getSalesList).mockResolvedValue([]);
    setFixtureMarkets();

    render(<MemoryRouter><MarketShippingPlan /></MemoryRouter>);
    await screen.findByRole('heading', { name: '市場出荷予定' });

    expect(screen.getByText(/FIXTURE-RESIDENT-A/)).toBeInTheDocument();
    expect(screen.getByText(/FIXTURE-RESIDENT-B/)).toBeInTheDocument();
    expect(screen.queryByText(/仮-0110/)).not.toBeInTheDocument();
    expect(screen.getByText('該当候補 2頭')).toBeInTheDocument();
    expect(screen.queryByText('該当候補 3頭')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'この市場へ出荷決定' })).toHaveLength(2);
    expect(screen.queryByText('出荷決定済み')).not.toBeInTheDocument();
  });

  it.each(['出荷済み', '販売済み'] as const)('先頭の販売が出荷予定でも、後方に同じ子牛の%sがあれば候補から除外する', async status => {
    const completed = calfFixture({
      calfNumber: 'FIXTURE-COMPLETED', identificationNumber: 'FIXTURE-COMPLETED-ID', name: '検証用完了子牛',
    });
    const resident = calfFixture({ id: 102, calfNumber: 'FIXTURE-REMAINING', name: '検証用在籍子牛' });
    vi.mocked(calfApi.getCalfList).mockResolvedValue([completed, resident]);
    vi.mocked(salesApi.getSalesList).mockResolvedValue([
      saleFixture({ id: 'fixture-planned-first', targetNumber: completed.calfNumber, status: '出荷予定' }),
      saleFixture({ id: 'fixture-completed-later', targetNumber: completed.identificationNumber,
        status, shippingDate: '2026-10-01', saleDate: status === '販売済み' ? '2026-10-01' : '' }),
    ]);
    setFixtureMarkets();

    render(<MemoryRouter><MarketShippingPlan /></MemoryRouter>);
    await screen.findByRole('heading', { name: '市場出荷予定' });

    expect(screen.queryByText(/FIXTURE-COMPLETED/)).not.toBeInTheDocument();
    expect(screen.getByText(/FIXTURE-REMAINING/)).toBeInTheDocument();
    expect(screen.getByText('該当候補 1頭')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'この市場へ出荷決定' })).toHaveLength(1);
    expect(screen.queryByText('出荷決定済み')).not.toBeInTheDocument();
  });

  it('取消された子牛の販売や同番号の成牛の販売済み記録では、在籍子牛を候補から除外しない', async () => {
    const cancelled = calfFixture({ calfNumber: 'FIXTURE-CANCELLED', name: '検証用取消後在籍子牛' });
    const sharedNumber = calfFixture({ id: 102, calfNumber: 'FIXTURE-SHARED-NUMBER', name: '検証用同番号子牛' });
    vi.mocked(calfApi.getCalfList).mockResolvedValue([cancelled, sharedNumber]);
    vi.mocked(salesApi.getSalesList).mockResolvedValue([
      saleFixture({ id: 'fixture-cancelled-sale', targetNumber: cancelled.calfNumber, status: '取消' }),
      saleFixture({ id: 'fixture-adult-sale', targetType: '成牛', targetNumber: sharedNumber.calfNumber,
        targetName: '検証用成牛', status: '販売済み', saleDate: '2026-10-01' }),
    ]);
    setFixtureMarkets();

    render(<MemoryRouter><MarketShippingPlan /></MemoryRouter>);
    await screen.findByRole('heading', { name: '市場出荷予定' });

    expect(screen.getByText(/FIXTURE-CANCELLED/)).toBeInTheDocument();
    expect(screen.getByText(/FIXTURE-SHARED-NUMBER/)).toBeInTheDocument();
    expect(screen.getByText('該当候補 2頭')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'この市場へ出荷決定' })).toHaveLength(2);
    expect(screen.queryByText('出荷決定済み')).not.toBeInTheDocument();
  });

  it('出荷予定の子牛は選択した市場と開催日だけに決定済みで表示し、未決定の子牛は各市場に残す', async () => {
    const planned = calfFixture({ calfNumber: 'FIXTURE-PLANNED', name: '検証用予定子牛' });
    const unplanned = calfFixture({ id: 102, calfNumber: 'FIXTURE-UNPLANNED', name: '検証用未決定子牛' });
    vi.mocked(calfApi.getCalfList).mockResolvedValue([planned, unplanned]);
    vi.mocked(salesApi.getSalesList).mockResolvedValue([
      saleFixture({ targetNumber: planned.calfNumber, status: '出荷予定' }),
    ]);
    setFixtureMarkets([
      fixtureMarket,
      { id: 'fixture-market-b', marketName: '検証市場B', marketDate: fixtureMarket.marketDate },
      { id: 'fixture-market-a-next', marketName: fixtureMarket.marketName, marketDate: '2026-10-22' },
    ]);

    render(<MemoryRouter><MarketShippingPlan /></MemoryRouter>);
    await screen.findByRole('heading', { name: '市場出荷予定' });

    const chosen = candidateGroup('検証市場A', '2026年10月15日');
    const anotherMarket = candidateGroup('検証市場B', '2026年10月15日');
    const anotherDate = candidateGroup('検証市場A', '2026年10月22日');
    expect(chosen.getByText(/FIXTURE-PLANNED/)).toBeInTheDocument();
    expect(chosen.getByText('出荷決定済み')).toBeInTheDocument();
    expect(chosen.getByText('該当候補 2頭')).toBeInTheDocument();
    expect(chosen.getByRole('link', { name: '出荷・販売管理で確認' })).toHaveAttribute('href', '/sales');
    for (const group of [anotherMarket, anotherDate]) {
      expect(group.queryByText(/FIXTURE-PLANNED/)).not.toBeInTheDocument();
      expect(group.queryByText('出荷決定済み')).not.toBeInTheDocument();
      expect(group.getByText('該当候補 1頭')).toBeInTheDocument();
    }
    for (const group of [chosen, anotherMarket, anotherDate]) {
      expect(group.getByText(/FIXTURE-UNPLANNED/)).toBeInTheDocument();
      expect(group.getAllByRole('button', { name: 'この市場へ出荷決定' })).toHaveLength(1);
    }
    expect(screen.getAllByText('出荷決定済み')).toHaveLength(1);
  });

  it('出荷候補基準の開始日齢が終了日齢を超える場合は保存しない', async () => {
    const save = vi.spyOn(repo, 'saveRecord');
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <MarketShippingPlan />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '市場出荷予定' });

    const min = screen.getByLabelText(/候補開始日齢/);
    const max = screen.getByLabelText(/候補終了日齢/);
    await user.clear(min);
    await user.type(min, '320');
    await user.clear(max);
    await user.type(max, '300');

    await user.click(screen.getByRole('button', { name: '基準を保存' }));

    expect(screen.getByText('開始日齢は終了日齢以下で入力してください。')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it('市場開催日を追加して端末内へ保存できる', async () => {
    const save = vi.spyOn(repo, 'saveRecord').mockImplementation(async (_store, value: any) => value);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <MarketShippingPlan />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '市場出荷予定' });
    await user.type(screen.getByLabelText('市場名'), '岩手県南市場');
    await user.type(screen.getByLabelText('開催日'), '2026-10-15');

    await user.click(screen.getByRole('button', { name: '開催日を追加' }));

    expect(save).toHaveBeenCalledWith('metadata', expect.objectContaining({
      id: 'market-shipping-plan-settings',
      minAgeDays: 260,
      maxAgeDays: 310,
      schedules: expect.arrayContaining([
        expect.objectContaining({
          marketName: '岩手県南市場',
          marketDate: '2026-10-15',
        }),
      ]),
    }));

    expect(screen.getByText('市場開催日を追加しました。')).toBeInTheDocument();
  });

  it('候補子牛を市場の出荷予定へ登録できる', async () => {
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([{
      id: 'c1',
      calfNumber: '9131',
      identificationNumber: '1234567890',
      name: 'さくら',
      birthday: '2026-01-10',
      sex: '雌',
      motherName: '母A',
      currentWeight: 300,
      managementStatus: '育成中',
      recipientCowId: '',
      motherCowId: '100',
      calvingId: 'cv1',
    }] as any);
    vi.spyOn(repo, 'getRecordById').mockResolvedValue({
      id: 'market-shipping-plan-settings',
      fiscalYear: '2026',
      minAgeDays: 260,
      maxAgeDays: 310,
      schedules: [{ id: 'm1', marketName: '岩手県南市場', marketDate: '2026-10-15' }],
    } as any);
    const createSale = vi.spyOn(salesApi, 'createSale').mockResolvedValue({
      id: 's1',
      targetType: '子牛',
      targetNumber: '9131',
      targetName: 'さくら',
      status: '出荷予定',
      shippingPlanDate: '2026-10-15',
      marketName: '岩手県南市場',
    } as any);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <MarketShippingPlan />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '市場出荷予定' });
    expect(screen.getByText(/さくら/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'この市場へ出荷決定' }));

    expect(createSale).toHaveBeenCalledWith(expect.objectContaining({
      targetType: '子牛',
      targetNumber: '9131',
      targetName: 'さくら',
      calfId: 'c1',
      calvingId: 'cv1',
      motherCowId: '100',
      shippingPlanDate: '2026-10-15',
      marketName: '岩手県南市場',
      status: '出荷予定',
      memo: '市場出荷予定から登録',
    }));

    expect(screen.getByText('9131を岩手県南市場の出荷予定へ登録しました。')).toBeInTheDocument();
  });
});
