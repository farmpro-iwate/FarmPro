import { getStoredAuthUser } from '../services/authClient';
import { LEGACY_DB_OWNER_KEY } from './legacyDbOwnership';
import type { StoreName } from './types';

export const FARM_PRO_DB_NAME = 'farmpro-local';
export const FARM_PRO_DB_VERSION = 3;
export { LEGACY_DB_OWNER_KEY } from './legacyDbOwnership';
const SCOPED_DB_PREFIX = `${FARM_PRO_DB_NAME}-farm-`;

export const FARM_PRO_STORE_NAMES: StoreName[] = [
  'settings',
  'masters',
  'cattle',
  'calves',
  'breedings',
  'calvings',
  'treatments',
  'vaccines',
  'blvTests',
  'schedules',
  'feedings',
  'feedingGuide',
  'feedingAlertActions',
  'feedInventory',
  'fatteningTransitions',
  'sales',
  'expenses',
  'photos',
  'metadata',
];

let databasePromise: Promise<IDBDatabase> | null = null;
let openedDatabaseName: string | null = null;
let openedDatabase: IDBDatabase | null = null;

function safeDatabasePart(value: string) {
  return encodeURIComponent(value.trim());
}

function resolveDatabaseName(): string {
  const authUser = getStoredAuthUser();
  const farmId = String(authUser?.farmId || '').trim();

  if (!farmId) {
    return `${SCOPED_DB_PREFIX}anonymous`;
  }

  const legacyOwnerFarmId = window.localStorage.getItem(LEGACY_DB_OWNER_KEY)?.trim() || '';
  if (legacyOwnerFarmId && legacyOwnerFarmId === farmId) {
    return FARM_PRO_DB_NAME;
  }

  // 旧DBの所有農場が確認できた場合だけ旧DBを使う。
  // それ以外は必ずfarmId専用DBへ分離し、別農場のデータを見せない。
  return `${SCOPED_DB_PREFIX}${safeDatabasePart(farmId)}`;
}

function resetOpenDatabase() {
  if (openedDatabase) {
    openedDatabase.close();
  }
  openedDatabase = null;
  openedDatabaseName = null;
  databasePromise = null;
}

export function openFarmProDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(
      new Error('このブラウザはIndexedDBに対応していません。'),
    );
  }

  const databaseName = resolveDatabaseName();

  if (openedDatabaseName && openedDatabaseName !== databaseName) {
    resetOpenDatabase();
  }

  if (databasePromise) {
    return databasePromise;
  }

  openedDatabaseName = databaseName;
  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(
      databaseName,
      FARM_PRO_DB_VERSION,
    );

    request.onupgradeneeded = () => {
      const database = request.result;

      for (const storeName of FARM_PRO_STORE_NAMES) {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'id' });
        }
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      openedDatabase = database;

      database.onversionchange = () => {
        database.close();
        if (openedDatabase === database) {
          openedDatabase = null;
          openedDatabaseName = null;
          databasePromise = null;
        }
      };

      resolve(database);
    };

    request.onerror = () => {
      openedDatabase = null;
      openedDatabaseName = null;
      databasePromise = null;
      reject(request.error ?? new Error('IndexedDBを開けませんでした。'));
    };

    request.onblocked = () => {
      openedDatabase = null;
      openedDatabaseName = null;
      databasePromise = null;
      reject(
        new Error(
          '別のFarmPro画面がデータベースを使用中です。画面を閉じて再試行してください。',
        ),
      );
    };
  });

  return databasePromise;
}
