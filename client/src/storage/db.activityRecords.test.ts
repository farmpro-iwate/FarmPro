import 'fake-indexeddb/auto';
import { expect, it, vi } from 'vitest';
import { FARM_PRO_DB_VERSION, FARM_PRO_STORE_NAMES, openFarmProDatabase } from './db';
import { getAllRecords } from './repository';

vi.mock('../services/authClient', () => ({ getStoredAuthUser: () => ({ id: 'upgrade-user', farmId: 'activity-upgrade-farm' }) }));

it('adds the activity store when opening a v4 database and preserves all existing farm records', async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('farmpro-local-farm-activity-upgrade-farm', 4);
    request.onupgradeneeded = () => {
      for (const name of FARM_PRO_STORE_NAMES.filter(name => name !== 'activityRecords')) {
        request.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const original = { id: 7, name: '既存牛', earTag: '0123', createdAt: '2026-11-01T00:00:00.000Z', future: { amount: '001.20', value: null } };
  const originalStock = { id: 'existing-stock', itemName: '試験薬', quantity: 3 };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['cattle', 'supplyInventory'], 'readwrite');
    tx.objectStore('cattle').put(original);
    tx.objectStore('supplyInventory').put(originalStock);
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
  });
  db.close();
  const upgraded = await openFarmProDatabase();
  expect(upgraded.version).toBe(FARM_PRO_DB_VERSION);
  expect(upgraded.objectStoreNames.contains('activityRecords')).toBe(true);
  expect(await getAllRecords('activityRecords')).toEqual([]);
  expect(await getAllRecords('cattle')).toEqual([original]);
  expect(await getAllRecords('supplyInventory')).toEqual([originalStock]);
});
