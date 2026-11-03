import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FarmProBackup } from '../storage/backup';
import type { StoredRecord } from '../storage/types';
import { FARM_PRO_STORE_NAMES } from '../storage/db';
import { parseFarmProBackupJson } from '../storage/backup-import';
import { getDeviceSyncPreview, pullCloudToLocal, pushLocalChangesToCloudSafely, pushLocalToCloud } from './deviceSync';

const mocks = vi.hoisted(() => ({ create: vi.fn(), restore: vi.fn(), download: vi.fn(), upload: vi.fn() }));
vi.mock('../storage/backup', async importOriginal => ({
  ...await importOriginal<typeof import('../storage/backup')>(), createFarmProBackup: mocks.create,
}));
vi.mock('../storage/backup-restore', () => ({ restoreFarmProBackup: mocks.restore }));
vi.mock('./cloudClient', () => ({ downloadLatestCloudSnapshot: mocks.download, uploadCloudSnapshot: mocks.upload }));
vi.mock('./authClient', () => ({ getStoredAuthUser: () => ({ id: 'compat-user', farmId: 'compat-farm' }) }));
vi.mock('../plans/feature-gate', () => ({ requirePaidFeature: vi.fn() }));

const baseKey = 'farmpro.syncBaseFingerprint.compat-farm';
// Persisted fingerprints from the version-4 serializer, before activityRecords existed.
const oldSha256 = 'afa7a9ed1d68a67b9ac7b4e93ff8ccfabf84973c10beb2b1af900540da1bd8c0';
const oldFallback = '64cbd681d8a48e0d';
let local: FarmProBackup;
let cloud: FarmProBackup;

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  const stores = Object.fromEntries(FARM_PRO_STORE_NAMES.map(name => [name, [] as StoredRecord[]])) as FarmProBackup['stores'];
  local = { format: 'farmpro-backup', schemaVersion: 5, appVersion: 'test', exportedAt: '2026-11-03T00:00:00.000Z',
    farm: { id: 'compat-farm', name: '試験農場' }, stores };
  local.stores.cattle = [{ id: 1, name: '元の牛', updatedAt: '2026-11-01T00:00:00.000Z' }];
  cloud = structuredClone(local);
  cloud.schemaVersion = 4;
  delete (cloud.stores as Partial<FarmProBackup['stores']>).activityRecords;
  mocks.create.mockReset().mockImplementation(async () => structuredClone(local));
  mocks.restore.mockReset().mockResolvedValue(undefined);
  mocks.download.mockReset().mockImplementation(async () => ({ revision: 35, savedAt: '2026-11-01T00:00:00.000Z', snapshot: structuredClone(cloud) }));
  mocks.upload.mockReset().mockResolvedValue({ revision: 36, savedAt: '2026-11-03T00:00:00.000Z', exportedAt: '', appVersion: 'test' });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('activity store version-4 compatibility', () => {
  it.each(['sha256', 'fallback'])('%s: 空の新storeだけでは変更扱いせず、既存の確認済みハッシュを保つ', async algorithm => {
    const expected = algorithm === 'sha256' ? oldSha256 : oldFallback;
    if (algorithm === 'fallback') vi.stubGlobal('crypto', {});
    localStorage.setItem(baseKey, expected);
    const preview = await getDeviceSyncPreview();
    expect(preview.direction).toBe('same');
    expect(preview.differences).toEqual([]);
    expect(preview.cloudBackup?.schemaVersion).toBe(4);
    expect(localStorage.getItem(baseKey)).toBe(expected);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('旧版の確認済み状態からの端末だけの変更を、世代条件付きで送信できる', async () => {
    localStorage.setItem(baseKey, oldSha256);
    local.stores.feedInventory = [{ id: 'new-feed-entry', quantity: 2, updatedAt: '2026-11-03T00:00:00.000Z' }];
    expect((await getDeviceSyncPreview()).direction).toBe('local-newer');
    await pushLocalChangesToCloudSafely();
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledWith(local, 35);
    expect(cloud.schemaVersion).toBe(4);
    expect(cloud.stores.activityRecords).toBeUndefined();
  });

  it('初めて登録した活動は実際の変更として扱い、既存台帳と一緒に保持して送信する', async () => {
    localStorage.setItem(baseKey, oldSha256);
    local.stores.activityRecords = [{ id: 'activity-new', activityType: 'farm', recordDate: '2026-11-03', title: '試験作業' }];
    expect((await getDeviceSyncPreview()).direction).toBe('local-newer');
    await pushLocalToCloud();
    expect(mocks.upload).toHaveBeenCalledWith(local, 35);
    expect(localStorage.getItem(baseKey)).not.toBe(oldSha256);
    expect(local.stores.cattle).toEqual(cloud.stores.cattle);
  });

  it('空端末へ旧snapshotを受信した後は、DB版だけで再送や確認待ちにならない', async () => {
    local.stores.cattle = [];
    await pullCloudToLocal(cloud, 35);
    expect(mocks.restore).toHaveBeenCalledWith(expect.objectContaining({ schemaVersion: 4,
      stores: expect.objectContaining({ activityRecords: [] }) }));
    local = { ...parseFarmProBackupJson(JSON.stringify(cloud)), schemaVersion: 5 };
    expect((await getDeviceSyncPreview()).direction).toBe('same');
    expect(localStorage.getItem(baseKey)).toBe(oldSha256);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it.each(['changed', 'cloud-only'])('版互換があっても %s の業務差分を自動上書きしない', async difference => {
    if (difference === 'changed') cloud.stores.cattle[0].name = '別端末の修正';
    else cloud.stores.cattle.push({ id: 2, name: '別端末の追加牛' });
    await expect(pushLocalToCloud()).rejects.toThrow('全件上書きせず');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it.each(['version3', 'reverse', 'invalid-legacy-activity'])('%s は互換対象に広げない', async scenario => {
    if (scenario === 'version3') cloud.schemaVersion = 3;
    if (scenario === 'reverse') { cloud = structuredClone(local); local.schemaVersion = 4; }
    if (scenario === 'invalid-legacy-activity') cloud.stores.activityRecords = [{ id: 'unexpected-activity' }];
    await expect(pushLocalToCloud()).rejects.toThrow('データ形式が一致しません');
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
