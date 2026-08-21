import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_DB_OWNER_KEY, reconcileLegacyDbOwner } from './legacyDbOwnership';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function createLegacyFarm(farmName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('farmpro-local', 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('metadata', 'readwrite');
      tx.objectStore('metadata').put({ id: 'farm-settings', farmName });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

describe('legacy DB ownership reconciliation', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    await deleteDatabase('farmpro-local');
  });

  it('assigns the legacy DB to the account whose farm name matches', async () => {
    await createLegacyFarm('関口農場');
    window.localStorage.setItem(LEGACY_DB_OWNER_KEY, 'wrong-farm');

    await reconcileLegacyDbOwner({ farmId: 'sekiguchi-farm', farmName: '関口農場' });

    expect(window.localStorage.getItem(LEGACY_DB_OWNER_KEY)).toBe('sekiguchi-farm');
  });

  it('removes a wrong owner when the logged-in farm name does not match', async () => {
    await createLegacyFarm('関口農場');
    window.localStorage.setItem(LEGACY_DB_OWNER_KEY, 'new-farm');

    await reconcileLegacyDbOwner({ farmId: 'new-farm', farmName: '別農場' });

    expect(window.localStorage.getItem(LEGACY_DB_OWNER_KEY)).toBeNull();
  });
});
