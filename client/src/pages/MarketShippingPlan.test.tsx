import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MarketShippingPlan from './MarketShippingPlan';
import * as calfApi from '../services/calfApi';
import * as salesApi from '../services/salesApi';
import * as repo from '../storage/repository';
import * as plan from '../plans/current-plan';
import * as policy from '../plans/policy';

describe('MarketShippingPlan', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(plan, 'getCurrentFarmProPlanId').mockReturnValue('free' as any);
    vi.spyOn(policy, 'getFarmProPlan').mockReturnValue({ multiDeviceSync: false } as any);
    vi.spyOn(calfApi, 'getCalfList').mockResolvedValue([] as any);
    vi.spyOn(salesApi, 'getSalesList').mockResolvedValue([] as any);
    vi.spyOn(repo, 'getRecordById').mockResolvedValue(null as any);
    vi.spyOn(repo, 'saveRecord').mockImplementation(async (_store, value: any) => value);
  });

  afterEach(() => cleanup());

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