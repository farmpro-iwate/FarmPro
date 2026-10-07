// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountExitGuide } from './AccountExitGuide';
import { SettingsPage } from '../pages/SettingsPage';

const mocks = vi.hoisted(() => ({
  user: vi.fn(), readSettings: vi.fn(), saveSettings: vi.fn(), readAlerts: vi.fn(), saveAlerts: vi.fn(),
  notificationStatus: vi.fn(), requestPermission: vi.fn(), registerPush: vi.fn(), sendPush: vi.fn(),
}));
vi.mock('../services/authClient', () => ({ getStoredAuthUser: mocks.user }));
vi.mock('../services/settingsApi', () => ({ getFarmSettingsForPageOpen: mocks.readSettings, updateFarmSettings: mocks.saveSettings }));
vi.mock('../services/alertSettings', () => ({
  defaultAlertSettings: { scheduleDays: 3, pregnancyCheckDays: 3, nextHeatDays: 3, recheckDays: 3, calvingDays: 7, vaccineDays: 3 },
  getAlertSettings: mocks.readAlerts, saveAlertSettings: mocks.saveAlerts,
}));
vi.mock('../services/deviceNotifications', () => ({
  getDeviceNotificationStatus: mocks.notificationStatus, requestDeviceNotificationPermission: mocks.requestPermission,
  registerServerPushSubscription: mocks.registerPush, sendServerPushTest: mocks.sendPush,
}));
// Keep the existing settings/guide regression checks isolated from intake I/O.
// WithdrawalRequests.test.tsx covers the real guide with the real intake child.
vi.mock('./WithdrawalRequests', () => ({ WithdrawalRequestForm: () => <div data-testid="withdrawal-intake-fixture" /> }));
vi.mock('./AccountSecurityCard', () => ({ AccountSecurityCard: () => <div data-testid="account-security-fixture" /> }));

const account = { id: 'fixture-owner', farmId: 'fixture-farm', farmName: 'Fixture Farm', name: 'Fixture Owner',
  email: 'owner@example.invalid', role: 'owner', active: true, plan: 'standard' };
const settings = { farmName: 'Fixture Farm', ownerName: 'Fixture Owner', productionCostSettingsConfirmed: true, memo: 'Saved fixture memo' };
const alerts = { scheduleDays: 3, pregnancyCheckDays: 3, nextHeatDays: 3, recheckDays: 3, calvingDays: 7, vaccineDays: 3 };
const fetchMock = vi.fn();
const databaseOpen = vi.fn();
const databaseDelete = vi.fn();
let writes: ReturnType<typeof vi.spyOn>;
let removals: ReturnType<typeof vi.spyOn>;
let clears: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem('farmpro.authToken', 'fixture-token');
  localStorage.setItem('farmpro.authUser', JSON.stringify(account));
  localStorage.setItem('farmpro.operatorListVisibility.v1.fixture-owner', '{"version":1,"hiddenUserIds":["fixture-hidden"]}');
  writes = vi.spyOn(Storage.prototype, 'setItem');
  removals = vi.spyOn(Storage.prototype, 'removeItem');
  clears = vi.spyOn(Storage.prototype, 'clear');
  vi.stubGlobal('fetch', fetchMock.mockImplementation(() => { throw new Error('Unexpected network request in exit guide test'); }));
  vi.stubGlobal('indexedDB', { open: databaseOpen, deleteDatabase: databaseDelete });
  mocks.user.mockReturnValue(account);
  mocks.readSettings.mockResolvedValue(settings);
  mocks.saveSettings.mockImplementation(async (value: unknown) => value);
  mocks.readAlerts.mockResolvedValue(alerts);
  mocks.notificationStatus.mockReturnValue('unsupported');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function expectReadOnly() {
  for (const fn of [fetchMock, writes, removals, clears, databaseOpen, databaseDelete,
    mocks.saveSettings, mocks.saveAlerts, mocks.requestPermission, mocks.registerPush, mocks.sendPush]) {
    expect(fn).not.toHaveBeenCalled();
  }
  expect(localStorage.getItem('farmpro.authToken')).toBe('fixture-token');
  expect(localStorage.getItem('farmpro.authUser')).toBe(JSON.stringify(account));
  expect(localStorage.getItem('farmpro.operatorListVisibility.v1.fixture-owner')).toContain('fixture-hidden');
}
async function openGuide() {
  const clicker = userEvent.setup();
  await clicker.click(await screen.findByRole('button', { name: '解約・退会について' }));
  return { clicker, dialog: within(screen.getByRole('dialog', { name: '解約・退会のご案内' })) };
}

describe('read-only exit guidance', () => {
  it('starts closed and loads neither a request nor an external form', () => {
    render(<AccountExitGuide />);
    expect(screen.getByRole('button', { name: '解約・退会について' })).toHaveAttribute('type', 'button');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expectReadOnly();
  });

  it('distinguishes cancellation, withdrawal, paid periods and contact from completed operations', async () => {
    render(<AccountExitGuide />);
    const { dialog } = await openGuide();
    expect(dialog.getByRole('heading', { name: '解約：有料プランの更新をやめる' })).toBeInTheDocument();
    expect(dialog.getByRole('heading', { name: '退会：アカウントと対象データの削除を希望する' })).toBeInTheDocument();
    expect(dialog.getByText(/カード月払いは.*Stripeで更新停止を行えます/)).toBeInTheDocument();
    expect(dialog.getByText(/銀行振込の年払いには、自動更新・自動決済はありません.*支払済みの契約期間の終了までは利用できます/)).toBeInTheDocument();
    expect(dialog.getByText(/途中解約の日割り返金は原則ありません.*個別に確認/)).toBeInTheDocument();
    expect(dialog.getByText(/退会は、下の「実際の退会手続きへ」から対象・契約状態・削除範囲を確認/)).toBeInTheDocument();
    expect(dialog.getByText(/必要な牛の記録は事前にバックアップ/)).toBeInTheDocument();
    expect(dialog.getByText(/パスワード・確認コード・カード番号は記入しないでください/)).toBeInTheDocument();
    expect(dialog.queryByRole('textbox')).not.toBeInTheDocument();
    expectReadOnly();
  });

  it('closes, restores focus and reopens without submitting anything', async () => {
    render(<AccountExitGuide />);
    const { clicker, dialog } = await openGuide();
    await clicker.click(dialog.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '解約・退会について' })).toHaveFocus();
    await clicker.click(screen.getByRole('button', { name: '解約・退会について' }));
    await clicker.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expectReadOnly();
  });

  it('uses only the existing public contact URL, with no account autofill or success claim', async () => {
    render(<AccountExitGuide />);
    const { dialog } = await openGuide();
    const link = dialog.getByRole('link', { name: 'お問い合わせフォームを開く（別タブ）' });
    expect(link).toHaveAttribute('href', 'https://docs.google.com/forms/d/e/1FAIpQLSfnVbG6EPMSQDvdKe7K1wac4K_58nOxm9KlvoAIsaj_jm-HEA/viewform?usp=header');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
    // Do not navigate or send a real form in automated tests.
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
    expect(dialog.getByText(/フォームでの送信後も、この画面では受付・更新停止・退会の完了は確認できません/)).toBeInTheDocument();
    expect(dialog.queryByText(/^(解約|退会|受付)が完了しました/)).not.toBeInTheDocument();
    expectReadOnly();
  });

  it('opens existing terms in separate tabs instead of discarding the settings page', async () => {
    render(<AccountExitGuide />);
    const { dialog } = await openGuide();
    const terms = dialog.getByRole('link', { name: '利用規約を確認（別タブ）' });
    const commerce = dialog.getByRole('link', { name: '特商法表記を確認（別タブ）' });
    expect(terms).toHaveAttribute('href', '/terms');
    expect(commerce).toHaveAttribute('href', '/commerce');
    for (const link of [terms, commerce]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expectReadOnly();
  });

  it.each(['free', 'standard', 'pro'])('connects the guide once in the real settings page for %s', async (plan) => {
    mocks.user.mockReturnValue({ ...account, plan });
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(await screen.findByText('アカウント情報')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '解約・退会について' })).toHaveLength(1);
    const { clicker, dialog } = await openGuide();
    expect(dialog.getByText(/Freeをご利用の場合は/)).toBeInTheDocument();
    await clicker.click(dialog.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('spinbutton', { name: '次回発情確認（日前）' })).toHaveValue(3);
    expect(mocks.readSettings).toHaveBeenCalledTimes(1);
    expect(mocks.readAlerts).toHaveBeenCalledTimes(1);
    expectReadOnly();
  });

  it('preserves unsaved farm input and does not hijack the existing save button', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    const memo = await screen.findByRole('textbox', { name: 'メモ' });
    fireEvent.change(memo, { target: { value: 'Unsaved fixture memo' } });
    const { clicker, dialog } = await openGuide();
    await clicker.click(dialog.getByRole('button', { name: '閉じる' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(memo).toHaveValue('Unsaved fixture memo');
    expectReadOnly();
    await clicker.click(screen.getByRole('button', { name: '設定を保存' }));
    await waitFor(() => expect(mocks.saveSettings).toHaveBeenCalledTimes(1));
    expect(mocks.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ memo: 'Unsaved fixture memo' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not invent an account or show an account action when no account is stored', async () => {
    mocks.user.mockReturnValue(null);
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(await screen.findByRole('textbox', { name: 'メモ' })).toBeInTheDocument();
    expect(screen.queryByText('アカウント情報')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '解約・退会について' })).not.toBeInTheDocument();
    expectReadOnly();
  });
});
