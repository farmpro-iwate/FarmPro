import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openFarmProDatabase } from './db';

function useFarm(farmId: string) {
  window.localStorage.setItem('farmpro.authUser', JSON.stringify({
    id: 'owner-' + farmId, farmId, farmName: farmId, name: 'LINE Test',
    role: 'owner', active: true, plan: 'free',
  }));
}

async function saveCattle(id: string, label: string) {
  const db = await openFarmProDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('cattle', 'readwrite');
    tx.objectStore('cattle').put({ id, name: label });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function cattleNames(): Promise<string[]> {
  const db = await openFarmProDatabase();
  return new Promise((resolve, reject) => {
    const req = db.transaction('cattle', 'readonly').objectStore('cattle').getAll();
    req.onsuccess = () => resolve((req.result as {name:string}[]).map(row => row.name));
    req.onerror = () => reject(req.error);
  });
}

describe('LINE farms keep local cattle records isolated by farmId', () => {
  it('switching between two LINE farms never reads the other farm cattle', async () => {
    const farmA = 'line-isolation-farm-a';
    const farmB = 'line-isolation-farm-b';
    try {
      window.localStorage.removeItem('farmpro.authUser');
      useFarm(farmA);
      await saveCattle('cow-a', 'Farm A cattle');
      expect(await cattleNames()).toContain('Farm A cattle');

      useFarm(farmB);
      expect(await cattleNames()).not.toContain('Farm A cattle');
      await saveCattle('cow-b', 'Farm B cattle');
      expect(await cattleNames()).toContain('Farm B cattle');

      useFarm(farmA);
      expect(await cattleNames()).toContain('Farm A cattle');
      expect(await cattleNames()).not.toContain('Farm B cattle');

      useFarm(farmB);
      expect(await cattleNames()).toContain('Farm B cattle');
      expect(await cattleNames()).not.toContain('Farm A cattle');
    } finally {
      window.localStorage.removeItem('farmpro.authUser');
    }
  });
});
