import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceSyncPage } from './DeviceSyncPage';
import {
  applyCloudRecovery,
  cancelCloudRecovery,
  canUseCloudRecovery,
  getPendingCloudRecovery,
  prepareCloudRecovery,
  verifyAndResumeCloudRecovery,
  type CloudRecoveryPreview,
} from '../services/cloudDeviceRecovery';
import { getDeviceSyncPreview, isDeviceSyncInitialized, pullCloudToLocal, pushLocalToCloud } from '../services/deviceSync';
import { getStoredAuthUser, hasAuthToken } from '../services/authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';

vi.mock('../services/cloudDeviceRecovery', () => ({
  applyCloudRecovery: vi.fn(),
  cancelCloudRecovery: vi.fn(),
  canUseCloudRecovery: vi.fn(),
  getPendingCloudRecovery: vi.fn(),
  prepareCloudRecovery: vi.fn(),
  verifyAndResumeCloudRecovery: vi.fn(),
}));
vi.mock('../services/deviceSync', () => ({
  getDeviceSyncPreview: vi.fn(),
  isDeviceSyncInitialized: vi.fn(),
  pullCloudToLocal: vi.fn(),
  pushLocalToCloud: vi.fn(),
  markLocalChangePending: vi.fn(),
}));
vi.mock('../services/authClient', () => ({ getStoredAuthUser: vi.fn(), hasAuthToken: vi.fn() }));
vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: vi.fn() }));
vi.mock('../storage/backup', () => ({ createFarmProBackup: vi.fn() }));
vi.mock('../services/syncRecoveryBreeding', () => ({ planCloudOnlyBreedingAdditions: vi.fn(), addReviewedBreedingWithoutOverwrite: vi.fn() }));
vi.mock('../services/syncLosslessMerge', () => ({ proposeLosslessSyncMerge: vi.fn() }));
vi.mock('../services/syncMergeReadiness', () => ({ inspectSyncMergeReadiness: vi.fn() }));

function recovery(overrides: Partial<CloudRecoveryPreview> = {}): CloudRecoveryPreview {
  return {
    id: 'recovery-1',
    farmName: '関口農場',
    farmId: 'farm-046e695e-c5a6-4fd5-8d36-1d9732da5e5f',
    cloudRevision: 37,
    cloudSavedAt: '2026-10-31T08:10:00.000Z',
    sourceExportedAt: '2026-10-31T05:40:45.308Z',
    sourceDigest: 'a'.repeat(64),
    localRecordCount: 180,
    cloudRecordCount: 185,
    localTotalCount: 184,
    cloudTotalCount: 189,
    counts: [
      { storeName: 'cattle', local: 12, cloud: 12 },
      { storeName: 'calves', local: 11, cloud: 10 },
      { storeName: 'supplyInventory', local: 0, cloud: 6 },
      { storeName: 'metadata', local: 4, cloud: 4 },
    ],
    beforeSavedAt: '2026-10-31T09:40:00.000Z',
    status: 'prepared',
    alreadyMatches: false,
    ...overrides,
  };
}

const result = { id: 'recovery-1', revision: 37, recordCount: 185, totalCount: 189, verified: false };

async function openRecovery() {
  const user = userEvent.setup();
  render(<DeviceSyncPage />);
  const prepareButton = await screen.findByRole('button', { name: '変更前データを退避して受信内容を確認' });
  await waitFor(() => expect(prepareButton).toBeEnabled());
  return { user, prepareButton };
}

async function prepare() {
  const opened = await openRecovery();
  await opened.user.click(opened.prepareButton);
  const checkbox = await screen.findByRole('checkbox', { name: 'この端末の他のFarmPro画面を閉じ、最新版で開き、農場と受信内容を確認しました' });
  await waitFor(() => expect(checkbox).toBeEnabled());
  return { ...opened, checkbox };
}

describe('DeviceSyncPage: reviewed cloud recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(canUseCloudRecovery).mockReturnValue(true);
    vi.mocked(getCurrentFarmProPlanId).mockReturnValue('pro');
    vi.mocked(getStoredAuthUser).mockReturnValue({
      id: 'owner', farmId: recovery().farmId, farmName: '関口農場', name: '利用者', role: 'owner', active: true, plan: 'pro',
    });
    vi.mocked(hasAuthToken).mockReturnValue(true);
    vi.mocked(isDeviceSyncInitialized).mockReturnValue(true);
    vi.mocked(getDeviceSyncPreview).mockResolvedValue({
      direction: 'local-newer', localRecordCount: 180, cloudRecordCount: 185,
      localUpdatedAt: null, cloudUpdatedAt: null, cloudSavedAt: null,
      cloudRevision: 37, cloudBackup: null, differences: [],
    });
    vi.mocked(getPendingCloudRecovery).mockResolvedValue(null);
    vi.mocked(prepareCloudRecovery).mockResolvedValue(recovery());
    vi.mocked(applyCloudRecovery).mockResolvedValue(result);
    vi.mocked(verifyAndResumeCloudRecovery).mockResolvedValue({ ...result, verified: true });
    vi.mocked(cancelCloudRecovery).mockResolvedValue();
    vi.mocked(pushLocalToCloud).mockResolvedValue(undefined as never);
  });

  afterEach(cleanup);

  it('対象農場ではページ表示と再確認だけで送受信や復旧準備を実行しない', async () => {
    const { user } = await openRecovery();
    await user.click(screen.getByRole('button', { name: 'もう一度確認する' }));
    await waitFor(() => expect(getDeviceSyncPreview).toHaveBeenCalledTimes(2));
    expect(pullCloudToLocal).not.toHaveBeenCalled();
    expect(pushLocalToCloud).not.toHaveBeenCalled();
    expect(prepareCloudRecovery).not.toHaveBeenCalled();
    expect(applyCloudRecovery).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /バックアップを保存|同期復旧データを保存|記録の違いを確認/ })).not.toBeInTheDocument();
  });

  it('現在の世代と子牛・在庫件数を確認し、取消なら受信を確定しない', async () => {
    const { user } = await prepare();
    const sourceInfo = screen.getByRole('table', { name: '正本の受信情報' });
    expect(within(sourceInfo).getByText('37')).toBeInTheDocument();
    expect(within(sourceInfo).getByText(recovery().farmId)).toBeInTheDocument();
    expect(within(sourceInfo).getByText(/退避済み/)).toBeInTheDocument();
    const counts = screen.getByRole('table', { name: '受信前と正本の件数' });
    expect(within(counts).getByRole('row', { name: '子牛 11件 10件' })).toBeInTheDocument();
    expect(within(counts).getByRole('row', { name: '医薬品・受精卵在庫 0件 6件' })).toBeInTheDocument();
    expect(within(counts).getByRole('row', { name: '業務データ合計 180件 185件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'この内容を受信して確定' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'もう一度確認する' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: '受信を取り消す' }));
    await screen.findByText('受信を取り消しました。この端末の記録は変更していません。');
    expect(cancelCloudRecovery).toHaveBeenCalledWith('recovery-1');
    expect(applyCloudRecovery).not.toHaveBeenCalled();
    expect(verifyAndResumeCloudRecovery).not.toHaveBeenCalled();
  });

  it('利用者の確認後に受信し、通常同期の検証成功まで完了扱いにしない', async () => {
    const { user, checkbox } = await prepare();
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'この内容を受信して確定' }));
    await screen.findByText('受信済みです。正本との全内容の一致を確認しました。通常同期の検証が残っています。');
    expect(applyCloudRecovery).toHaveBeenCalledExactlyOnceWith('recovery-1');
    expect(verifyAndResumeCloudRecovery).not.toHaveBeenCalled();
    expect(screen.queryByText(/通常同期を再開しました/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '通常同期を検証して再開' }));
    await screen.findByText(/この端末の通常同期を再開しました/);
    expect(verifyAndResumeCloudRecovery).toHaveBeenCalledExactlyOnceWith('recovery-1');
    expect(pullCloudToLocal).not.toHaveBeenCalled();
    expect(pushLocalToCloud).not.toHaveBeenCalled();
  });

  it('再読込後の受信済み状態から通常同期検証を再開し、受信を繰り返さない', async () => {
    vi.mocked(getPendingCloudRecovery).mockResolvedValue(recovery({ status: 'applied' }));
    const user = userEvent.setup();
    render(<DeviceSyncPage />);
    const verifyButton = await screen.findByRole('button', { name: '通常同期を検証して再開' });
    await waitFor(() => expect(verifyButton).toBeEnabled());
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '受信を取り消す' })).not.toBeInTheDocument();
    await user.click(verifyButton);
    await screen.findByText(/この端末の通常同期を再開しました/);
    expect(prepareCloudRecovery).not.toHaveBeenCalled();
    expect(applyCloudRecovery).not.toHaveBeenCalled();
  });

  it('受信応答が失われても保存済み状態を再取得し、未確認の再受信をしない', async () => {
    vi.mocked(getPendingCloudRecovery).mockResolvedValueOnce(null).mockResolvedValue(recovery({ status: 'applied' }));
    vi.mocked(applyCloudRecovery).mockRejectedValue(new Error('受信結果の応答を確認できません。'));
    const { user, checkbox } = await prepare();
    await user.click(checkbox);
    await user.click(screen.getByRole('button', { name: 'この内容を受信して確定' }));
    await screen.findByRole('button', { name: '通常同期を検証して再開' });
    expect(screen.queryByRole('button', { name: 'この内容を受信して確定' })).not.toBeInTheDocument();
    expect(screen.queryByText(/通常同期を再開しました/)).not.toBeInTheDocument();
    expect(applyCloudRecovery).toHaveBeenCalledTimes(1);
  });

  it('通常同期検証が失敗したら受信済みのまま停止し、完了表示をしない', async () => {
    vi.mocked(getPendingCloudRecovery).mockResolvedValue(recovery({ status: 'applied' }));
    vi.mocked(verifyAndResumeCloudRecovery).mockRejectedValue(new Error('通常同期後の内容が一致しません。'));
    const user = userEvent.setup();
    render(<DeviceSyncPage />);
    const button = await screen.findByRole('button', { name: '通常同期を検証して再開' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await screen.findByText('通常同期後の内容が一致しません。');
    expect(screen.queryByText(/通常同期を再開しました/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'もう一度確認する' })).toBeDisabled();
    expect(pushLocalToCloud).not.toHaveBeenCalled();
  });

  it('退避に失敗したら受信の確定操作を出さない', async () => {
    vi.mocked(prepareCloudRecovery).mockRejectedValue(new Error('変更前データを退避できませんでした。'));
    const { user, prepareButton } = await openRecovery();
    await user.click(prepareButton);
    await screen.findByText('変更前データを退避できませんでした。');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'この内容を受信して確定' })).not.toBeInTheDocument();
    expect(applyCloudRecovery).not.toHaveBeenCalled();
  });

  it('正本と一致している端末でも確認してから同期再開の準備を行う', async () => {
    vi.mocked(prepareCloudRecovery).mockResolvedValue(recovery({ alreadyMatches: true, localRecordCount: 185, localTotalCount: 189 }));
    const { user, checkbox } = await prepare();
    await screen.findByText('この端末は正本と一致しています。置換は行わず、同期の再開を確認します。');
    const applyButton = screen.getByRole('button', { name: 'この内容で同期の再開準備を確定' });
    expect(applyButton).toBeDisabled();
    await user.click(checkbox);
    await user.click(applyButton);
    await screen.findByRole('button', { name: '通常同期を検証して再開' });
    expect(applyCloudRecovery).toHaveBeenCalledExactlyOnceWith('recovery-1');
  });

  it('対象外の農場では復旧機能を呼ばず、既存の通常同期を維持する', async () => {
    vi.mocked(canUseCloudRecovery).mockReturnValue(false);
    render(<DeviceSyncPage />);
    await waitFor(() => expect(pushLocalToCloud).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('heading', { name: 'クラウドの正本をこの端末へ受信' })).not.toBeInTheDocument();
    expect(getPendingCloudRecovery).not.toHaveBeenCalled();
    expect(prepareCloudRecovery).not.toHaveBeenCalled();
  });
});
