import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';
import { getAuthToken, getStoredAuthUser } from '../services/authClient';
import { getRecoveredDeviceSyncNotice, RECOVERED_DEVICE_SYNC_STATUS_EVENT } from '../services/recoveredDeviceSync';

vi.mock('../services/authClient', () => ({ getAuthToken: vi.fn(), getStoredAuthUser: vi.fn() }));
vi.mock('../services/recoveredDeviceSync', () => ({
  getRecoveredDeviceSyncNotice: vi.fn(),
  RECOVERED_DEVICE_SYNC_STATUS_EVENT: 'farmpro:recovered-device-sync-status',
}));
vi.mock('./GlobalAnimalSearch', () => ({ GlobalAnimalSearch: () => null }));

describe('AppLayout recovered sync notice', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getAuthToken).mockReturnValue(null);
    vi.mocked(getStoredAuthUser).mockReturnValue({ id: 'owner', farmId: 'farm-recovered', farmName: '農場', name: '利用者', role: 'owner', active: true, plan: 'pro' });
    vi.mocked(getRecoveredDeviceSyncNotice).mockReturnValue({ farmId: 'farm-recovered', userId: 'owner', message: '同期を確認してください。' });
  });
  afterEach(cleanup);

  it('同期の要確認を同期画面へ案内し、成功通知で消す', () => {
    render(<MemoryRouter><AppLayout><div>記録一覧</div></AppLayout></MemoryRouter>);
    expect(screen.getByRole('alert')).toHaveTextContent('同期を確認してください。');
    expect(screen.getByRole('link', { name: '同期画面' })).toHaveAttribute('href', '/device-sync');
    vi.mocked(getRecoveredDeviceSyncNotice).mockReturnValue(null);
    act(() => { window.dispatchEvent(new Event(RECOVERED_DEVICE_SYNC_STATUS_EVENT)); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('記録一覧')).toBeInTheDocument();
  });

  it('別農場・別利用者の同期通知を表示しない', () => {
    vi.mocked(getRecoveredDeviceSyncNotice).mockReturnValue({ farmId: 'other-farm', userId: 'other-owner', message: '同期を確認してください。' });
    render(<MemoryRouter><AppLayout><div>記録一覧</div></AppLayout></MemoryRouter>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
