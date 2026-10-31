import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStoredAuthUser } from './authClient';
import { isRecoveredDeviceSyncEnabled, runRecoveredDeviceSync } from './deviceSync';
import { isCloudRecoveryPaused } from './syncRecoveryGuard';
import { getRecoveredDeviceSyncNotice, startRecoveredDeviceSync } from './recoveredDeviceSync';

vi.mock('./authClient', () => ({ getStoredAuthUser: vi.fn() }));
vi.mock('./deviceSync', () => ({ isRecoveredDeviceSyncEnabled: vi.fn(), runRecoveredDeviceSync: vi.fn() }));
vi.mock('./syncRecoveryGuard', () => ({ isCloudRecoveryPaused: vi.fn() }));

const disposers: Array<() => void> = [];
const begin = () => { const stop = startRecoveredDeviceSync(); disposers.push(stop); return stop; };
const flush = async () => { await vi.advanceTimersByTimeAsync(0); };

describe('recovered device snapshot sync scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.mocked(isCloudRecoveryPaused).mockReturnValue(false);
    vi.mocked(isRecoveredDeviceSyncEnabled).mockReturnValue(true);
    vi.mocked(runRecoveredDeviceSync).mockResolvedValue('same');
    vi.mocked(getStoredAuthUser).mockReturnValue({ id: 'owner', farmId: 'farm-recovered', farmName: '復旧済農場', name: '利用者', role: 'owner', active: true, plan: 'pro' });
  });

  afterEach(async () => {
    disposers.splice(0).forEach(stop => stop());
    await flush();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('復旧未完了・対象外端末では起動や各イベントから同期しない', async () => {
    vi.mocked(isRecoveredDeviceSyncEnabled).mockReturnValue(false);
    begin();
    window.dispatchEvent(new Event('farmpro:data-changed'));
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(65000);
    expect(runRecoveredDeviceSync).not.toHaveBeenCalled();
    expect(getRecoveredDeviceSyncNotice()).toBeNull();
  });

  it('編集イベントを最後の変更から5秒待ってまとめる', async () => {
    begin();
    await flush();
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('farmpro:data-changed'));
    await vi.advanceTimersByTimeAsync(3000);
    window.dispatchEvent(new Event('farmpro:data-changed'));
    await vi.advanceTimersByTimeAsync(4999);
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(2);
  });

  it('通信・表示の復帰と60秒周期で確認する', async () => {
    begin();
    await flush();
    window.dispatchEvent(new Event('online'));
    await flush();
    window.dispatchEvent(new Event('focus'));
    await flush();
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(60000);
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(5);
  });

  it('offline・非表示・復旧停止中はpollせず、復帰後に続ける', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    begin();
    await vi.advanceTimersByTimeAsync(60000);
    expect(runRecoveredDeviceSync).not.toHaveBeenCalled();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(runRecoveredDeviceSync).not.toHaveBeenCalled();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.mocked(isCloudRecoveryPaused).mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(runRecoveredDeviceSync).not.toHaveBeenCalled();
    vi.mocked(isCloudRecoveryPaused).mockReturnValue(false);
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(1);
  });

  it('実行中の編集を失わず、並列送信せずに完了後再実行する', async () => {
    let resolve!: (result: 'same') => void;
    vi.mocked(runRecoveredDeviceSync).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    begin();
    window.dispatchEvent(new Event('farmpro:data-changed'));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(1);
    resolve('same');
    await flush();
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(2);
  });

  it('二重起動でも1系統を共有し、最後のdisposeでイベントとタイマーを停止する', async () => {
    const first = begin();
    const second = begin();
    await flush();
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(1);
    first();
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('farmpro:data-changed'));
    second();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(65000);
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(2);
  });

  it('dispose中の応答では警告や再実行を行わず、新規起動とも並列にならない', async () => {
    let resolve!: (result: 'needs-review') => void;
    vi.mocked(runRecoveredDeviceSync).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const stop = begin();
    stop();
    begin();
    await flush();
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(1);
    resolve('needs-review');
    await flush();
    expect(runRecoveredDeviceSync).toHaveBeenCalledTimes(2);
    expect(getRecoveredDeviceSyncNotice()).toBeNull();
  });

  it('要確認・通信失敗を表示し、成功で消し、別農場には表示しない', async () => {
    vi.mocked(runRecoveredDeviceSync).mockResolvedValueOnce('needs-review');
    begin();
    await flush();
    expect(getRecoveredDeviceSyncNotice()?.message).toBe('同期を確認してください。');
    window.dispatchEvent(new Event('focus'));
    await flush();
    expect(getRecoveredDeviceSyncNotice()).toBeNull();
    vi.mocked(runRecoveredDeviceSync).mockRejectedValueOnce(new Error('network unavailable'));
    window.dispatchEvent(new Event('online'));
    await flush();
    expect(getRecoveredDeviceSyncNotice()?.farmId).toBe('farm-recovered');
    vi.mocked(getStoredAuthUser).mockReturnValue({ id: 'other-owner', farmId: 'other-farm', farmName: '別農場', name: '別利用者', role: 'owner', active: true, plan: 'pro' });
    expect(getRecoveredDeviceSyncNotice()).toBeNull();
    window.dispatchEvent(new Event('focus'));
    await flush();
  });
});
