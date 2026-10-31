import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVED_CLOUD_RECOVERY } from './services/approvedCloudRecovery';

const mocks = vi.hoisted(() => ({
  render: vi.fn(), initialize: vi.fn(), refresh: vi.fn(), currentUser: vi.fn(), hasToken: vi.fn(),
  syncAccount: vi.fn(), paused: vi.fn(), recovered: vi.fn(), startSync: vi.fn(),
}));
vi.mock('react-dom/client', () => ({ default: { createRoot: () => ({ render: mocks.render }) } }));
vi.mock('./App', () => ({ default: () => null }));
vi.mock('./pages/DeviceSyncPage', () => ({ DeviceSyncPage: () => null }));
vi.mock('./components/PwaInstallPrompt', () => ({ PwaInstallPrompt: () => null }));
vi.mock('./components/PwaUpdatePrompt', () => ({ PwaUpdatePrompt: () => null }));
vi.mock('./storage/initialize', () => ({ initializeFarmProStorage: mocks.initialize }));
vi.mock('./services/authClient', () => ({ refreshAuthUser: mocks.refresh, getStoredAuthUser: mocks.currentUser, hasAuthToken: mocks.hasToken }));
vi.mock('./services/settingsApi', () => ({ syncAccountToFarmSettings: mocks.syncAccount }));
vi.mock('./services/syncRecoveryGuard', () => ({ isCloudRecoveryPaused: mocks.paused }));
vi.mock('./services/deviceSync', () => ({ isRecoveredDeviceSyncEnabled: mocks.recovered }));
vi.mock('./services/recoveredDeviceSync', () => ({ startRecoveredDeviceSync: mocks.startSync }));
vi.mock('./services/deviceNotifications', () => ({ getDeviceNotificationStatus: () => 'denied', registerServerPushSubscription: vi.fn() }));

const user = { id: 'owner', farmId: APPROVED_CLOUD_RECOVERY.farmId, farmName: '関口農場', name: '利用者', role: 'owner', active: true, plan: 'pro' };

async function start() {
  await import('./main');
  await waitFor(() => expect(mocks.startSync).toHaveBeenCalledTimes(1));
}

describe('first recovery startup preserves the original local records', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    document.body.innerHTML = '<div id="root"></div>';
    window.history.replaceState(null, '', '/');
    mocks.currentUser.mockReturnValue(user);
    mocks.hasToken.mockReturnValue(true);
    mocks.refresh.mockResolvedValue(user);
    mocks.initialize.mockResolvedValue({});
    mocks.syncAccount.mockResolvedValue({});
    mocks.paused.mockReturnValue(false);
    mocks.recovered.mockReturnValue(false);
    mocks.startSync.mockReturnValue(() => {});
  });

  it('初回はinitializeとmetadata保存を一切実行せず同期画面へ進む', async () => {
    await start();
    expect(window.location.pathname).toBe('/device-sync');
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.syncAccount).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.render).toHaveBeenCalledTimes(2);
  });

  it('停止中の再起動でもinitializeを経由しない', async () => {
    mocks.recovered.mockReturnValue(true);
    mocks.paused.mockReturnValue(true);
    await start();
    expect(window.location.pathname).toBe('/device-sync');
    expect(mocks.initialize).not.toHaveBeenCalled();
    expect(mocks.syncAccount).not.toHaveBeenCalled();
  });

  it('明示的なログインURLを復旧画面への誘導で妨げない', async () => {
    window.history.replaceState(null, '', '/login?line=complete');
    await start();
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toBe('?line=complete');
    expect(mocks.initialize).not.toHaveBeenCalled();
  });

  it('対象外農場の起動と設定連携を維持する', async () => {
    const other = { ...user, farmId: 'other-farm' };
    mocks.currentUser.mockReturnValue(other);
    mocks.refresh.mockResolvedValue(other);
    await start();
    expect(mocks.initialize).toHaveBeenCalledExactlyOnceWith('1.6.0');
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.syncAccount).toHaveBeenCalledExactlyOnceWith(other);
    expect(window.location.pathname).toBe('/');
  });

  it('対象農場の復旧確認後は通常起動し、account情報でmetadataを書き直さない', async () => {
    mocks.recovered.mockReturnValue(true);
    await start();
    expect(mocks.initialize).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.syncAccount).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/');
  });
});
