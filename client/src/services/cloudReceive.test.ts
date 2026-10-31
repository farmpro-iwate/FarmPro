import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import type { FarmProBackup } from '../storage/backup';

const mocks = vi.hoisted(() => ({
  user: { id: 'owner-test', farmId: 'farm-test', farmName: 'Test farm', plan: 'pro' },
  token: 'test-token', download: vi.fn(), upload: vi.fn(), gate: vi.fn(),
}));
vi.mock('./authClient', () => ({ getStoredAuthUser: () => mocks.user, getAuthToken: () => mocks.token }));
vi.mock('./cloudClient', () => ({ downloadLatestCloudSnapshot: mocks.download, uploadCloudSnapshot: mocks.upload }));
vi.mock('../plans/feature-gate', () => ({ requirePaidFeature: mocks.gate }));

let receiver: typeof import('./cloudReceive');
let storage: typeof import('../storage/db');
let database: IDBDatabase;
let local: FarmProBackup;
let cloud: FarmProBackup;

async function seed(backup: FarmProBackup) {
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(storage.FARM_PRO_STORE_NAMES, 'readwrite');
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    for (const name of storage.FARM_PRO_STORE_NAMES) {
      tx.objectStore(name).clear();
      backup.stores[name].forEach(row => tx.objectStore(name).put(row));
    }
  });
}
async function read() {
  const stores = {} as FarmProBackup['stores'];
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(storage.FARM_PRO_STORE_NAMES, 'readonly');
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    for (const name of storage.FARM_PRO_STORE_NAMES) {
      const req = tx.objectStore(name).getAll();
      req.onsuccess = () => { stores[name] = req.result; };
    }
  });
  return stores;
}
function response(snapshot = cloud, revision = 35) {
  return { savedAt: '2026-10-31T06:00:00Z', revision, snapshot: structuredClone(snapshot) };
}
function backupKeys() {
  return Object.keys(localStorage).filter(key => key.startsWith('farmpro.beforeCloudReceive.') && !key.endsWith('.latest'));
}
async function unchanged() {
  expect(receiver.exactBackupStores(await read())).toBe(receiver.exactBackupStores(local.stores));
  expect(mocks.upload).not.toHaveBeenCalled();
}

beforeEach(async () => {
  vi.resetModules(); vi.restoreAllMocks();
  vi.stubGlobal('indexedDB', new IDBFactory());
  localStorage.clear();
  mocks.user = { id: 'owner-test', farmId: 'farm-test', farmName: 'Test farm', plan: 'pro' };
  mocks.token = 'test-token';
  mocks.download.mockReset(); mocks.upload.mockReset(); mocks.gate.mockReset();
  storage = await import('../storage/db');
  receiver = await import('./cloudReceive');
  database = await storage.openFarmProDatabase();
  const stores = Object.fromEntries(storage.FARM_PRO_STORE_NAMES.map(name => [name, []])) as FarmProBackup['stores'];
  local = {
    format: 'farmpro-backup', schemaVersion: 4, appVersion: '1.6.0',
    exportedAt: '2026-10-31T05:40:45Z', farm: { id: 'farm-test', name: 'Test farm' }, stores,
  };
  local.stores.calves = [{ id: 11, name: 'old', updatedAt: '2026-10-30T00:00:00Z' }];
  local.stores.metadata = [{ id: 'farm-settings', farmName: 'Test farm', value: 'old' }];
  cloud = structuredClone(local);
  cloud.stores.calves = [{ id: 1, name: 'authoritative', updatedAt: '2026-10-31T00:00:00Z' }];
  cloud.stores.supplyInventory = [{ id: 'purchase-1', quantity: 6 }];
  cloud.stores.metadata = [{ id: 'farm-settings', farmName: 'Test farm', value: 'authoritative' }];
  await seed(local);
  mocks.download.mockImplementation(async () => response());
});
afterEach(() => { database.close(); vi.unstubAllGlobals(); });

describe('confirmed receive', () => {
  it('requires explicit confirmation', async () => {
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, false)).rejects.toThrow();
    expect(mocks.download).not.toHaveBeenCalled(); await unchanged();
  });
  it('requires a paid plan', async () => {
    mocks.gate.mockImplementation(() => { throw new Error('PAID_REQUIRED'); });
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow('PAID_REQUIRED'); await unchanged();
  });
  it('rejects a different farm before fetching or writing', async () => {
    cloud.farm!.id = 'other-farm';
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow();
    expect(mocks.download).not.toHaveBeenCalled(); await unchanged();
  });
  it('requires authentication', async () => {
    mocks.token = '';
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow(); await unchanged();
  });
  it.each([0, -1, 1.5, Number.NaN])('rejects invalid revision %s', async revision => {
    await expect(receiver.receiveConfirmedCloudBackup(cloud, revision, true)).rejects.toThrow(); await unchanged();
  });
  it('does not replace data with an empty cloud snapshot', async () => {
    for (const name of storage.FARM_PRO_STORE_NAMES) cloud.stores[name] = [];
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow(); await unchanged();
  });
  it('rejects older schema instead of losing inventory', async () => {
    cloud.schemaVersion = 3;
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow(); await unchanged();
  });
  it('rejects duplicate primary keys', async () => {
    cloud.stores.calves.push({ ...cloud.stores.calves[0], name: 'duplicate' });
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow(); await unchanged();
  });
  it('rejects a changed cloud revision', async () => {
    mocks.download.mockResolvedValue(response(cloud, 36));
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow();
    expect(backupKeys()).toHaveLength(0); await unchanged();
  });
  it('rejects changed cloud content even at the same revision', async () => {
    const changed = structuredClone(cloud); changed.stores.metadata[0].value = 'changed';
    mocks.download.mockResolvedValue(response(changed));
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow(); await unchanged();
  });
  it('does not write on a network failure', async () => {
    mocks.download.mockRejectedValue(new Error('offline'));
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow('offline'); await unchanged();
  });
  it('stops if the cloud changes after the backup is retained', async () => {
    mocks.download.mockResolvedValueOnce(response()).mockResolvedValueOnce(response(cloud, 36));
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow();
    expect(backupKeys()).toHaveLength(1); await unchanged();
  });
  it('stops if backup storage is full', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow(); await unchanged();
  });
  it('stops if backup read-back fails', async () => {
    const original = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function(this: Storage, key: string) {
      return key.startsWith('farmpro.beforeCloudReceive.') ? null : original.call(this, key);
    });
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow(); await unchanged();
  });
  it('keeps a concurrent local change instead of overwriting it', async () => {
    mocks.download.mockImplementationOnce(async () => response()).mockImplementationOnce(async () => {
      local.stores.calves.push({ id: 12, name: 'concurrent' }); await seed(local); return response();
    });
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow(); await unchanged();
  });
  it('rejects an account switch while fetching', async () => {
    mocks.download.mockImplementation(async () => { mocks.user = { ...mocks.user, farmId: 'other-farm' }; return response(); });
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow(); await unchanged();
  });
  it('replaces every store exactly and retains a readable backup', async () => {
    await receiver.receiveConfirmedCloudBackup(cloud, 35, true);
    expect(receiver.exactBackupStores(await read())).toBe(receiver.exactBackupStores(cloud.stores));
    expect(receiver.exactBackupStores(receiver.getBeforeCloudReceiveBackup()!.stores)).toBe(receiver.exactBackupStores(local.stores));
    expect(mocks.download).toHaveBeenCalledTimes(2); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it('does not touch records or backup history if already exactly equal', async () => {
    await seed(cloud); await receiver.receiveConfirmedCloudBackup(cloud, 35, true);
    expect(backupKeys()).toHaveLength(0);
    expect(receiver.exactBackupStores(await read())).toBe(receiver.exactBackupStores(cloud.stores));
  });
  it('rolls every store back if a put fails', async () => {
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (this.name === 'supplyInventory') throw new Error('write failed');
      return original.call(this, value, key);
    });
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow('write failed');
    expect(backupKeys()).toHaveLength(1); await unchanged();
  });
  it('rolls back when read-back differs despite successful puts', async () => {
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const item = this.name === 'supplyInventory' ? { ...(value as object), quantity: 99 } : value;
      return original.call(this, item, key);
    });
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow(); await unchanged();
  });
  it('preserves older backup generations', async () => {
    await receiver.receiveConfirmedCloudBackup(cloud, 35, true);
    const previousKey = backupKeys()[0]; const previous = localStorage.getItem(previousKey);
    cloud.stores.supplyInventory[0].quantity = 7;
    await receiver.receiveConfirmedCloudBackup(cloud, 35, true);
    expect(backupKeys()).toHaveLength(2); expect(localStorage.getItem(previousKey)).toBe(previous);
  });
  it('prevents overlapping receives', async () => {
    let release!: () => void;
    mocks.download.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(response()); }));
    const first = receiver.receiveConfirmedCloudBackup(cloud, 35, true);
    await expect(receiver.receiveConfirmedCloudBackup(cloud, 35, true)).rejects.toThrow();
    release(); await first; expect(backupKeys()).toHaveLength(1);
  });
  it('keeps numeric and string IDs distinct and ignores only ordering', () => {
    const a = structuredClone(cloud.stores);
    a.calves = [{ id: 1, a: 'x', b: 'y' }, { id: '1', b: 'z' }];
    const b = structuredClone(a); b.calves.reverse();
    expect(receiver.exactBackupStores(a)).toBe(receiver.exactBackupStores(b));
    b.metadata[0].value = 'different';
    expect(receiver.exactBackupStores(a)).not.toBe(receiver.exactBackupStores(b));
  });
});
