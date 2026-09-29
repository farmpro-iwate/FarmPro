import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';
import * as settingsApi from '../services/settingsApi';
import * as alertSettingsApi from '../services/alertSettings';
import * as authClient from '../services/authClient';
import * as notifications from '../services/deviceNotifications';

vi.mock('../components/AccountSecurityCard', () => ({
  AccountSecurityCard: () => <div>アカウントセキュリティ</div>,
}));

const baseSettings = {
  farmName: '関口農場',
  ownerName: '関口',
  staffName: '',
  phone: '',
  address: '岩手県',
  estrousCycleDays: 21,
  defaultTaxRate: '10',
  farmExpenseAllocation: 'none',
  farmExpenseAllocationTarget: 'calf',
  farmExpenseAllocationPeriod: 'monthly',
  farmExpenseAllocationMethod: 'headcount',
  breedingCattleAcquisitionAllocationParity: 7,
  productionCostSettingsConfirmed: true,
  bullMasters: [],
  supplierMasters: [],
  memo: '',
};

const baseAlerts = {
  scheduleDays: 3,
  pregnancyCheckDays: 7,
  nextHeatDays: 3,
  recheckDays: 3,
  calvingDays: 7,
  vaccineDays: 7,
};

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(settingsApi, 'getFarmSettingsForPageOpen').mockResolvedValue(baseSettings as any);
    vi.spyOn(alertSettingsApi, 'getAlertSettings').mockResolvedValue(baseAlerts as any);
    vi.spyOn(authClient, 'getStoredAuthUser').mockReturnValue({
      id: 'u1',
      email: 'test@example.com',
      name: '関口',
      farmName: '関口農場',
      plan: 'standard',
    } as any);
    vi.spyOn(notifications, 'getDeviceNotificationStatus').mockReturnValue('unsupported');
  });

  afterEach(() => cleanup());

  it('農場名と発情周期を編集して保存できる', async () => {
    const update = vi.spyOn(settingsApi, 'updateFarmSettings').mockImplementation(async (value: any) => value);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '農場設定' });

    const farmName = screen.getByLabelText('農場名');
    await user.clear(farmName);
    await user.type(farmName, '新・関口農場');

    const cycle = screen.getByLabelText(/発情周期/);
    await user.clear(cycle);
    await user.type(cycle, '22');

    await user.click(screen.getByRole('button', { name: '設定を保存' }));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      farmName: '新・関口農場',
      estrousCycleDays: 22,
      productionCostSettingsConfirmed: true,
    }));
    expect(await screen.findByText('農場設定を保存しました。')).toBeInTheDocument();
  });

  it('生産費設定未確認では設定保存ボタンを押せない', async () => {
    vi.spyOn(settingsApi, 'getFarmSettingsForPageOpen').mockResolvedValue({
      ...baseSettings,
      productionCostSettingsConfirmed: false,
    } as any);

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '農場設定' });

    expect(screen.getByRole('button', { name: '設定を保存' })).toBeDisabled();
    expect(screen.getByText('初回のみ確認が必要です。チェックすると「設定を保存」できるようになります。')).toBeInTheDocument();
  });

  it('確認チェック後に生産費設定を保存できる', async () => {
    vi.spyOn(settingsApi, 'getFarmSettingsForPageOpen').mockResolvedValue({
      ...baseSettings,
      productionCostSettingsConfirmed: false,
    } as any);
    const update = vi.spyOn(settingsApi, 'updateFarmSettings').mockImplementation(async (value: any) => value);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '農場設定' });

    await user.click(screen.getByRole('checkbox', { name: '上記の生産費・経費設定を確認しました' }));
    await user.click(screen.getByRole('button', { name: '設定を保存' }));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      productionCostSettingsConfirmed: true,
    }));
  });

  it('アラート通知日数を変更して保存できる', async () => {
    const saveAlerts = vi.spyOn(alertSettingsApi, 'saveAlertSettings').mockImplementation(async (value: any) => value);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: '農場設定' });

    const pregnancy = screen.getByLabelText(/妊娠鑑定（日前）/);
    await user.clear(pregnancy);
    await user.type(pregnancy, '10');

    const calving = screen.getByLabelText(/分娩予定（日前）/);
    await user.clear(calving);
    await user.type(calving, '14');

    await user.click(screen.getByRole('button', { name: 'アラート設定を保存' }));

    expect(saveAlerts).toHaveBeenCalledWith(expect.objectContaining({
      pregnancyCheckDays: 10,
      calvingDays: 14,
    }));
    expect(await screen.findByText('アラート通知日数を保存しました。')).toBeInTheDocument();
  });
});
