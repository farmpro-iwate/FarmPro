import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { FARM_PRO_STORE_NAMES, openFarmProDatabase } from './db';
import type { FarmProBackup } from './backup';
import { restoreFarmProBackup } from './backup-restore';
import { getAllRecords } from './repository';

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
});
