import type { StoreName } from './types';

export const FARM_PRO_DB_NAME = 'farmpro-local';
export const FARM_PRO_DB_VERSION = 2;

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
  'sales',
  'expenses',
  'photos',
  'metadata',
];

let databasePromise: Promise<IDBDatabase> | null = null;

export function openFarmProDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) {
    return Promise.reject(
      new Error('このブラウザはIndexedDBに対応していません。'),
    );
  }

  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(
      FARM_PRO_DB_NAME,
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

      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };

      resolve(database);
    };

    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('IndexedDBを開けませんでした。'));
    };

    request.onblocked = () => {
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

