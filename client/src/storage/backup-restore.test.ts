import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { FARM_PRO_DB_VERSION, FARM_PRO_STORE_NAMES, openFarmProDatabase } from './db';
import type { FarmProBackup } from './backup';
import { restoreFarmProBackup } from './backup-restore';
import { getAllRecords, saveRecordPreservingTimestamps } from './repository';

vi.mock('../services/authClient', () => ({
  getStoredAuthUser: () => ({ id: 'test-user', farmId: 'atomic-restore-test-farm' }),
}));

function backup(): FarmProBackup {
  const stores = Object.fromEntries(
    FARM_PRO_STORE_NAMES.map((name) => [name, []]),
  ) as unknown as FarmProBackup['stores'];
  stores.cattle = [{ id: 'new-cow', name: 'new' }];
  stores.supplyInventory = [{ id: 'new-medicine', action: '購入' }];
  return {
    format: 'farmpro-backup', schemaVersion: FARM_PRO_DB_VERSION, appVersion: 'test',
    exportedAt: '2026-10-29T00:00:00.000Z', stores,
  };
}

async function seedExistingData() {
  const db = await openFarmProDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FARM_PRO_STORE_NAMES, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    for (const name of FARM_PRO_STORE_NAMES) tx.objectStore(name).clear();
    tx.objectStore('cattle').put({ id: 'old-cow', name: 'preserve me' });
    tx.objectStore('supplyInventory').put({ id: 'old-medicine', action: '購入' });
  });
}

describe('atomic backup restore', () => {
  it('replaces all stores together on success', async () => {
    await seedExistingData();
    await restoreFarmProBackup(backup());
    expect((await getAllRecords('cattle')).map(row => row.id)).toEqual(['new-cow']);
    expect((await getAllRecords('supplyInventory')).map(row => row.id)).toEqual(['new-medicine']);
  });

  it.each([
    ['treatments', 'treatmentSyncOrigin', 'treatmentSyncBase'],
    ['breedings', 'breedingSyncOrigin', 'breedingSyncBase'],
    ['blvTests', 'blvSyncOrigin', 'blvSyncBase'],
    ['feedingAlertActions', 'feedingAlertActionSyncOrigin', 'feedingAlertActionSyncBase'],
    ['fatteningTransitions', 'fatteningTransitionSyncOrigin', 'fatteningTransitionSyncBase'],
    ['activityRecords', 'activityRecordSyncOrigin', 'activityRecordSyncBase'],
  ] as const)('restores %s content without adopting its old automatic retry permission', async (storeName, originKey, baseKey) => {
    await seedExistingData();
    const input = backup();
    const record = {
      id: 'pending-record', cloudSyncPending: true, medicineCost: '1200', medicalFee: '3400',
      unknownBusinessField: { note: 'keep this field' },
      createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:01:00.000Z',
      [originKey]: { version: 1, farmId: 'atomic-restore-test-farm', userId: 'test-user', ownerId: 'same-browser' },
      [baseKey]: { version: 1, record: null },
    };
    input.stores[storeName] = [record];
    const { [originKey]: _origin, ...expected } = record;

    await restoreFarmProBackup(input);

    expect(await getAllRecords(storeName)).toEqual([expected]);
    expect(input.stores[storeName]).toEqual([record]);
    expect(record[originKey]).toBeDefined();
  });

  it('rolls back every store if a later store fails to write', async () => {
    await seedExistingData();
    const input = backup();
    // IndexedDB cannot clone functions: this forces a failure after cattle has been cleared.
    input.stores.supplyInventory = [{ id: 'uncloneable', callback: () => true }] as never;
    await expect(restoreFarmProBackup(input)).rejects.toThrow();
    expect((await getAllRecords('cattle')).map(row => row.id)).toEqual(['old-cow']);
    expect((await getAllRecords('supplyInventory')).map(row => row.id)).toEqual(['old-medicine']);
  });

  it('rejects v3 backup without touching existing inventory or cattle', async () => {
    await seedExistingData();
    const input = backup();
    input.schemaVersion = 3;
    input.stores.supplyInventory = [];
    await expect(restoreFarmProBackup(input)).rejects.toThrow('在庫を消さない');
    expect((await getAllRecords('cattle')).map(row => row.id)).toEqual(['old-cow']);
    expect((await getAllRecords('supplyInventory')).map(row => row.id)).toEqual(['old-medicine']);
  });

  it('rejects malformed stores before any modification', async () => {
    await seedExistingData();
    const input = backup();
    input.stores.expenses = undefined as never;
    await expect(restoreFarmProBackup(input)).rejects.toThrow('expenses');
    expect((await getAllRecords('cattle')).map(row => row.id)).toEqual(['old-cow']);
  });

  it.each([3, 4])('rejects an old v%s backup without erasing newer activity records or other ledgers', async schemaVersion => {
    await seedExistingData();
    const activity = await saveRecordPreservingTimestamps('activityRecords', {
      id: 'existing-activity', activityType: 'farm', title: '作業を記録', recordDate: '2026-11-03',
    });
    const input = { ...backup(), schemaVersion };
    await expect(restoreFarmProBackup(input)).rejects.toThrow('農場作業・個体の記録を消さない');
    expect(await getAllRecords('activityRecords')).toEqual([activity]);
    expect((await getAllRecords('cattle')).map(row => row.id)).toEqual(['old-cow']);
    expect((await getAllRecords('supplyInventory')).map(row => row.id)).toEqual(['old-medicine']);
  });
});
