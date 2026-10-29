import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FARM_PRO_STORE_NAMES } from '../storage/db';
import type { FarmProBackup } from '../storage/backup';
import { createFarmProBackup } from '../storage/backup';
import { hasAuthToken } from './authClient';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { uploadCloudSnapshot } from './cloudClient';
import { getDeviceSyncPreview, isDeviceSyncInitialized, pullCloudToLocal, pushLocalToCloud } from './deviceSync';
import { runStartupDeviceSync } from './automaticDeviceSync';

vi.mock('../plans/current-plan', () => ({ getCurrentFarmProPlanId: vi.fn() }));
vi.mock('./authClient', () => ({ hasAuthToken: vi.fn() }));
vi.mock('../storage/backup', () => ({ createFarmProBackup: vi.fn() }));
vi.mock('./cloudClient', () => ({
  CloudSnapshotConflictError: class CloudSnapshotConflictError extends Error {},
  uploadCloudSnapshot: vi.fn(),
}));
vi.mock('./deviceSync', () => ({
  getDeviceSyncPreview: vi.fn(),
  isDeviceSyncInitialized: vi.fn(),
  pullCloudToLocal: vi.fn(),
  pushLocalToCloud: vi.fn(),
}));

function backup(inventory = 0, cattle = 0): FarmProBackup {
  const stores = Object.fromEntries(FARM_PRO_STORE_NAMES.map(name => [name, []])) as unknown as FarmProBackup['stores'];
  stores.supplyInventory = Array.from({ length: inventory }, (_, i) => ({
    id: 'inventory-' + i, kind: '医薬品', action: '購入', quantity: 1,
    updatedAt: '2026-10-29T00:00:00.000Z',
  }));
  stores.cattle = Array.from({ length: cattle }, (_, i) => ({ id: 'cow-' + i, name: 'テスト牛' }));
  return {
    format: 'farmpro-backup', schemaVersion: 4, appVersion: 'test',
    exportedAt: '2026-10-29T00:00:00.000Z', stores,
  };
}

function preview(cloudBackup: FarmProBackup, direction: 'cloud-newer' | 'local-newer' | 'conflict') {
  vi.mocked(getDeviceSyncPreview).mockResolvedValue({
    direction, cloudBackup, cloudRevision: 5, localRecordCount: 1,
    cloudRecordCount: 1, localUpdatedAt: null, cloudUpdatedAt: null,
    cloudSavedAt: null, differences: [],
  });
}

describe('startup sync keeps medicine and embryo inventory', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('__APP_VERSION__', 'test');
    vi.mocked(getCurrentFarmProPlanId).mockReturnValue('standard');
    vi.mocked(hasAuthToken).mockReturnValue(true);
    vi.mocked(isDeviceSyncInitialized).mockReturnValue(false);
    vi.mocked(pullCloudToLocal).mockResolvedValue();
    vi.mocked(pushLocalToCloud).mockResolvedValue({ savedAt: '', revision: 5, exportedAt: '', appVersion: '' });
    vi.mocked(uploadCloudSnapshot).mockResolvedValue({ savedAt: '', revision: 6, exportedAt: '', appVersion: '' });
  });

  it('does not overwrite inventory-only local data with cloud cattle before first sync choice', async () => {
    vi.mocked(createFarmProBackup).mockResolvedValue(backup(1, 0));
    preview(backup(0, 1), 'cloud-newer');
    expect(await runStartupDeviceSync()).toBe('needs-review');
    expect(pullCloudToLocal).not.toHaveBeenCalled();
    expect(uploadCloudSnapshot).not.toHaveBeenCalled();
  });

  it('pushes inventory-only local data when the cloud has no farm records', async () => {
    const local = backup(2, 0);
    vi.mocked(createFarmProBackup).mockResolvedValue(local);
    preview(backup(), 'local-newer');
    expect(await runStartupDeviceSync()).toBe('pushed-empty-cloud');
    expect(uploadCloudSnapshot).toHaveBeenCalledWith(local, 5);
    expect(pullCloudToLocal).toHaveBeenCalledWith(local, 6);
  });

  it('pulls inventory-only cloud data to a truly empty new device', async () => {
    const cloud = backup(1, 0);
    vi.mocked(createFarmProBackup).mockResolvedValue(backup());
    preview(cloud, 'cloud-newer');
    expect(await runStartupDeviceSync()).toBe('pulled-empty-local');
    expect(pullCloudToLocal).toHaveBeenCalledWith(cloud, 5);
    expect(uploadCloudSnapshot).not.toHaveBeenCalled();
  });

  it('never automatically resolves conflicts by overwriting either side', async () => {
    vi.mocked(createFarmProBackup).mockResolvedValue(backup(1, 0));
    vi.mocked(isDeviceSyncInitialized).mockReturnValue(true);
    preview(backup(0, 1), 'conflict');
    expect(await runStartupDeviceSync()).toBe('needs-review');
    expect(pullCloudToLocal).not.toHaveBeenCalled();
    expect(uploadCloudSnapshot).not.toHaveBeenCalled();
  });

  it('skips cloud sync for Free plan', async () => {
    vi.mocked(getCurrentFarmProPlanId).mockReturnValue('free');
    expect(await runStartupDeviceSync()).toBe('skipped');
    expect(getDeviceSyncPreview).not.toHaveBeenCalled();
  });
});
