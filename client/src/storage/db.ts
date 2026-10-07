import { getStoredAuthUser } from '../services/authClient';
import { isLegacyDbClaimValidForFarm, LEGACY_DB_OWNER_KEY } from './legacyDbOwnership';
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

  if (farmId && window.localStorage.getItem(`farmpro.withdrawnFarm.${encodeURIComponent(farmId)}`)) throw new Error('この農場は退会済みです。');

  if (!farmId) {
    return `${SCOPED_DB_PREFIX}anonymous`;
  }

  if (isLegacyDbClaimValidForFarm(farmId)) {
    return FARM_PRO_DB_NAME;
  }

  // 旧DBは明示的に現在の農場へ引き継いだ場合だけ使用する。
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

// Invoked only after the server confirms actual withdrawal. A durable local
// marker prevents another tab from reopening this farm while deletion waits.
export async function deleteWithdrawnFarmDatabase(userId: string, farmId: string): Promise<void> {
  const marker = `farmpro.withdrawnFarm.${encodeURIComponent(farmId)}`;
  const current = getStoredAuthUser();
  if (current && (current.id !== userId || current.farmId !== farmId)) throw new Error('ログイン情報が変わったため、端末データは削除していません。');
  if (!current && window.localStorage.getItem(marker) !== userId) throw new Error('端末データの所有者を確認できません。');
  window.localStorage.setItem(marker, userId);
  const names = [`${SCOPED_DB_PREFIX}${safeDatabasePart(farmId)}`];
  if (isLegacyDbClaimValidForFarm(farmId)) names.push(FARM_PRO_DB_NAME);
  // Close only this farm's open connection, including a pending open operation.
  if (openedDatabaseName && names.includes(openedDatabaseName)) {
    await databasePromise?.catch(() => undefined);
    resetOpenDatabase();
  }
  if (!('indexedDB' in window)) throw new Error('この端末のデータ削除を確認できません。');
  for (const name of names) {
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase(name);
      const timer = setTimeout(() => reject(new Error('別のFarmPro画面を閉じて、端末データ削除を再確認してください。')), 10000);
      request.onsuccess = () => { clearTimeout(timer); resolve(); };
      request.onerror = () => { clearTimeout(timer); reject(new Error('端末データを削除できませんでした。再確認してください。')); };
      request.onblocked = () => { clearTimeout(timer); reject(new Error('別のFarmPro画面を閉じて、端末データ削除を再確認してください。')); };
    });
  }
  if (names.includes(FARM_PRO_DB_NAME) && isLegacyDbClaimValidForFarm(farmId)) {
    window.localStorage.removeItem(LEGACY_DB_OWNER_KEY);
    window.localStorage.removeItem('farmpro.legacyDbClaimVersion');
  }
  for (const key of ['farmpro.syncBaseFingerprint', 'farmpro.cloudRevision', 'farmpro.localChangePending']) {
    window.localStorage.removeItem(`${key}.${encodeURIComponent(farmId)}`);
  }
}
