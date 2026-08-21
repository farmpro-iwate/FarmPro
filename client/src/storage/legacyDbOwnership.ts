export const LEGACY_DB_OWNER_KEY = 'farmpro.legacyDbOwnerFarmId';
const LEGACY_DB_NAME = 'farmpro-local';
const METADATA_STORE = 'metadata';
const FARM_SETTINGS_ID = 'farm-settings';

type LegacyFarmSettings = {
  id?: string;
  farmName?: string;
};

function normalizeName(value: unknown) {
  return String(value || '').trim();
}

function openLegacyDatabase(): Promise<IDBDatabase | null> {
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
        deleteRequest.onsuccess = () => resolve(null);
        deleteRequest.onerror = () => resolve(null);
        deleteRequest.onblocked = () => resolve(null);
        return;
      }
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readLegacyFarmName(): Promise<string> {
  if (!('indexedDB' in window)) return '';
  const db = await openLegacyDatabase();
  if (!db) return '';

  try {
    if (!db.objectStoreNames.contains(METADATA_STORE)) return '';
    return await new Promise<string>((resolve) => {
      const tx = db.transaction(METADATA_STORE, 'readonly');
      const request = tx.objectStore(METADATA_STORE).get(FARM_SETTINGS_ID);
      request.onsuccess = () => {
        const record = request.result as LegacyFarmSettings | undefined;
        resolve(normalizeName(record?.farmName));
      };
      request.onerror = () => resolve('');
    });
  } finally {
    db.close();
  }
}

export async function reconcileLegacyDbOwner(user: { farmId?: string; farmName?: string }): Promise<void> {
  const farmId = normalizeName(user.farmId);
  const farmName = normalizeName(user.farmName);
  if (!farmId) return;

  const legacyFarmName = await readLegacyFarmName();
  const currentOwner = normalizeName(window.localStorage.getItem(LEGACY_DB_OWNER_KEY));

  if (legacyFarmName && farmName && legacyFarmName === farmName) {
    window.localStorage.setItem(LEGACY_DB_OWNER_KEY, farmId);
    return;
  }

  if (currentOwner === farmId) {
    window.localStorage.removeItem(LEGACY_DB_OWNER_KEY);
  }
}
