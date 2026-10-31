import { useEffect } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecoveryStartupGate } from './RecoveryStartupGate';
import { getStoredAuthUser, hasAuthToken } from '../services/authClient';
import { isRecoveredDeviceSyncEnabled } from '../services/deviceSync';
import { isCloudRecoveryPaused } from '../services/syncRecoveryGuard';
import { APPROVED_CLOUD_RECOVERY } from '../services/approvedCloudRecovery';

vi.mock('../services/authClient', () => ({ getStoredAuthUser: vi.fn(), hasAuthToken: vi.fn() }));
vi.mock('../services/deviceSync', () => ({ isRecoveredDeviceSyncEnabled: vi.fn() }));
vi.mock('../services/syncRecoveryGuard', () => ({ isCloudRecoveryPaused: vi.fn() }));
vi.mock('../pages/DeviceSyncPage', () => ({ DeviceSyncPage: () => <div>復旧専用画面</div> }));

const ordinaryPageMounted = vi.fn();
const user = { id: 'owner', farmId: APPROVED_CLOUD_RECOVERY.farmId, farmName: '関口農場', name: '利用者', role: 'owner' as const, active: true, plan: 'pro' as const };

function OrdinaryApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const authenticating = location.pathname === '/login' || location.pathname === '/logout';
  useEffect(() => { if (!authenticating) ordinaryPageMounted(); }, [authenticating]);
  return authenticating ? <button onClick={() => {
    vi.mocked(getStoredAuthUser).mockReturnValue(user);
    vi.mocked(hasAuthToken).mockReturnValue(true);
    navigate('/');
  }}>ログインする</button> : <div>通常画面</div>;
}

function open(path = '/') {
  render(<MemoryRouter initialEntries={[path]}><RecoveryStartupGate><OrdinaryApp /></RecoveryStartupGate></MemoryRouter>);
}

describe('RecoveryStartupGate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getStoredAuthUser).mockReturnValue(user);
    vi.mocked(hasAuthToken).mockReturnValue(true);
    vi.mocked(isRecoveredDeviceSyncEnabled).mockReturnValue(false);
    vi.mocked(isCloudRecoveryPaused).mockReturnValue(false);
  });
  afterEach(cleanup);

  it('対象農場の初回はHome・検索・通常レイアウトをmountせず復旧画面へ進む', async () => {
    open('/');
    await screen.findByText('復旧専用画面');
    expect(ordinaryPageMounted).not.toHaveBeenCalled();
    expect(screen.queryByText('通常画面')).not.toBeInTheDocument();
  });

  it('記録画面のURLを直接開いても未復旧なら通常画面をmountしない', async () => {
    open('/cattle');
    await screen.findByText('復旧専用画面');
    expect(ordinaryPageMounted).not.toHaveBeenCalled();
  });

  it('復旧済みでも停止markerが残れば復旧画面に限定する', async () => {
    vi.mocked(isRecoveredDeviceSyncEnabled).mockReturnValue(true);
    vi.mocked(isCloudRecoveryPaused).mockReturnValue(true);
    open('/');
    await screen.findByText('復旧専用画面');
    expect(ordinaryPageMounted).not.toHaveBeenCalled();
  });

  it('同じ画面でログインした直後も対象農場の通常画面を先に開かない', async () => {
    vi.mocked(getStoredAuthUser).mockReturnValue(null);
    vi.mocked(hasAuthToken).mockReturnValue(false);
    open('/login');
    fireEvent.click(screen.getByRole('button', { name: 'ログインする' }));
    await screen.findByText('復旧専用画面');
    expect(ordinaryPageMounted).not.toHaveBeenCalled();
  });

  it('対象外農場の通常画面と復旧済み端末を維持する', () => {
    vi.mocked(getStoredAuthUser).mockReturnValue({ ...user, farmId: 'other-farm' });
    open('/');
    expect(screen.getByText('通常画面')).toBeInTheDocument();
    expect(ordinaryPageMounted).toHaveBeenCalledTimes(1);
    cleanup();
    vi.mocked(getStoredAuthUser).mockReturnValue(user);
    vi.mocked(isRecoveredDeviceSyncEnabled).mockReturnValue(true);
    open('/');
    expect(screen.getByText('通常画面')).toBeInTheDocument();
    expect(ordinaryPageMounted).toHaveBeenCalledTimes(2);
  });

  it('認証が必要なら通常の記録画面を経由せずログインを表示する', async () => {
    vi.mocked(hasAuthToken).mockReturnValue(false);
    open('/');
    await screen.findByRole('button', { name: 'ログインする' });
    expect(ordinaryPageMounted).not.toHaveBeenCalled();
  });

  it.each([
    { label: '管理者以外', change: { role: 'member' as const } },
    { label: '無効な利用者', change: { active: false } },
    { label: 'Freeプラン', change: { plan: 'free' as const } },
  ])('$labelには読み取り専用案内だけを表示し旧自動同期画面をmountしない', ({ change }) => {
    vi.mocked(getStoredAuthUser).mockReturnValue({ ...user, ...change });
    open('/device-sync');
    expect(screen.getByRole('alert')).toHaveTextContent('この農場の管理者（Standard / Pro）でログインして復旧を確認してください。');
    expect(screen.getByRole('link', { name: 'ログインし直す' })).toHaveAttribute('href', '/logout');
    expect(screen.queryByText('復旧専用画面')).not.toBeInTheDocument();
    expect(ordinaryPageMounted).not.toHaveBeenCalled();
  });
});
