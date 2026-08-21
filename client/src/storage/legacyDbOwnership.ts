export const LEGACY_DB_OWNER_KEY = 'farmpro.legacyDbOwnerFarmId';
export const LEGACY_DB_CLAIM_VERSION_KEY = 'farmpro.legacyDbClaimVersion';
export const LEGACY_DB_CLAIM_VERSION = '2';

const LEGACY_DB_NAME = 'farmpro-local';

function normalize(value: unknown) {
  return String(value || '').trim();
}

export function isLegacyDbClaimValidForFarm(farmIdInput: string): boolean {
  const farmId = normalize(farmIdInput);
  if (!farmId) return false;

  const owner = normalize(window.localStorage.getItem(LEGACY_DB_OWNER_KEY));
  const version = normalize(window.localStorage.getItem(LEGACY_DB_CLAIM_VERSION_KEY));
  return owner === farmId && version === LEGACY_DB_CLAIM_VERSION;
}

export function claimLegacyDbForFarm(farmIdInput: string): void {
  const farmId = normalize(farmIdInput);
  if (!farmId) throw new Error('農場IDを確認できません。');

  window.localStorage.setItem(LEGACY_DB_OWNER_KEY, farmId);
  window.localStorage.setItem(LEGACY_DB_CLAIM_VERSION_KEY, LEGACY_DB_CLAIM_VERSION);
}

export function clearInvalidLegacyDbClaim(): void {
  const version = normalize(window.localStorage.getItem(LEGACY_DB_CLAIM_VERSION_KEY));
  if (version === LEGACY_DB_CLAIM_VERSION) return;

  // 旧方式で誤って別農場へ割り当てられたowner情報は無効化する。
  // IndexedDB本体は削除しない。
  window.localStorage.removeItem(LEGACY_DB_OWNER_KEY);
  window.localStorage.removeItem(LEGACY_DB_CLAIM_VERSION_KEY);
}

export async function hasLegacyFarmProData(): Promise<boolean> {
  if (!('indexedDB' in window)) return false;

  const databases = typeof window.indexedDB.databases === 'function'
    ? await window.indexedDB.databases().catch(() => [])
    : [];

  if (databases.length > 0 && !databases.some((db) => db.name === LEGACY_DB_NAME)) {
    return false;
  }

  return new Promise((resolve) => {
    const request = window.indexedDB.open(LEGACY_DB_NAME);
    let created = false;

    request.onupgradeneeded = () => {
      created = true;
    };

    request.onsuccess = () => {
      const db = request.result;
      if (created) {
        db.close();
        const deleteRequest = window.indexedDB.deleteDatabase(LEGACY_DB_NAME);
        deleteRequest.onsuccess = () => resolve(false);
        deleteRequest.onerror = () => resolve(false);
        deleteRequest.onblocked = () => resolve(false);
        return;
      }

      const candidateStores = ['cattle', 'calves', 'breedings', 'calvings', 'treatments', 'schedules', 'sales', 'expenses']
        .filter((name) => db.objectStoreNames.contains(name));

      if (candidateStores.length === 0) {
        db.close();
        resolve(false);
        return;
      }

      const tx = db.transaction(candidateStores, 'readonly');
      let pending = candidateStores.length;
      let found = false;

      for (const storeName of candidateStores) {
        const countRequest = tx.objectStore(storeName).count();
        countRequest.onsuccess = () => {
          if ((countRequest.result || 0) > 0) found = true;
          pending -= 1;
          if (pending === 0) {
            db.close();
            resolve(found);
          }
        };
        countRequest.onerror = () => {
          pending -= 1;
          if (pending === 0) {
            db.close();
            resolve(found);
          }
        };
      }
    };

    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  });
}
