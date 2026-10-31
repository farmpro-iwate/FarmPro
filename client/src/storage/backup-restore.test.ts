import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { FARM_PRO_STORE_NAMES, openFarmProDatabase } from './db';
import type { FarmProBackup } from './backup';
import { restoreFarmProBackup } from './backup-restore';
import { getAllRecords } from './repository';
import { captureRecoveryBackup } from './sync-recovery';

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
    format: 'farmpro-backup', schemaVersion: 4, appVersion: 'test',
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

  it('checks the confirmed local data inside the replacement transaction, including metadata', async () => {
    const identity = { farmId: 'atomic-restore-test-farm', userId: 'test-user' };
    const input = backup();
    input.farm = { id: identity.farmId, name: 'test farm' };
    for (const rows of Object.values(input.stores)) for (const row of rows) {
      row.createdAt = '2026-10-29T00:00:00.000Z';
      row.updatedAt = '2026-10-29T00:00:00.000Z';
    }
    await restoreFarmProBackup(input);
    const confirmed = await captureRecoveryBackup(identity);
    const db = await openFarmProDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('metadata', 'readwrite');
      tx.objectStore('metadata').put({ id: 'farm-settings', postCalvingHeatDays: 40 });
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    const target = structuredClone(input);
    target.stores.cattle[0].name = 'replacement';
    await expect(restoreFarmProBackup(target, {
      expectedFarmId: identity.farmId, expectedUserId: identity.userId, expectedLocalBackup: confirmed,
    })).rejects.toThrow('確認後にこの端末の記録が変わりました');
    expect((await getAllRecords('cattle'))[0].name).toBe('new');
    expect((await getAllRecords('metadata'))[0].postCalvingHeatDays).toBe(40);
  });

  it('preserves exact content on guarded restore and rejects a different account before replacement', async () => {
    const identity = { farmId: 'atomic-restore-test-farm', userId: 'test-user' };
    const input = backup();
    input.farm = { id: identity.farmId, name: 'test farm' };
    for (const rows of Object.values(input.stores)) for (const row of rows) {
      row.createdAt = '2026-10-29T00:00:00.000Z';
      row.updatedAt = '2026-10-29T00:00:00.000Z';
    }
    await restoreFarmProBackup(input);
    const before = await captureRecoveryBackup(identity);
    const target = structuredClone(input);
    target.stores.cattle[0].id = 42;
    target.stores.metadata = [{ id: 'farm-settings', postCalvingHeatDays: 40, createdAt: input.exportedAt, updatedAt: input.exportedAt }];
    await expect(restoreFarmProBackup(target, {
      expectedFarmId: identity.farmId, expectedUserId: 'another-user', expectedLocalBackup: before,
    })).rejects.toThrow('農場または利用者');
    await restoreFarmProBackup(target, {
      expectedFarmId: identity.farmId, expectedUserId: identity.userId, expectedLocalBackup: before,
    });
    for (const name of FARM_PRO_STORE_NAMES) expect(await getAllRecords(name)).toEqual(target.stores[name]);
  });
});
