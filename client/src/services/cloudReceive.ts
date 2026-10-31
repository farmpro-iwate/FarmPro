import { requirePaidFeature } from '../plans/feature-gate';
import { createFarmProBackup, type FarmProBackup } from '../storage/backup';
import { parseFarmProBackupJson } from '../storage/backup-import';
import { FARM_PRO_DB_VERSION, FARM_PRO_STORE_NAMES, openFarmProDatabase } from '../storage/db';
import type { StoredRecord } from '../storage/types';
import { getAuthToken, getStoredAuthUser } from './authClient';
import { downloadLatestCloudSnapshot } from './cloudClient';

const BACKUP_PREFIX = 'farmpro.beforeCloudReceive.';
let receiving = false;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
}

// Include metadata, transport fields and ID types. Ignore only object/record ordering.
export function exactBackupStores(stores: FarmProBackup['stores']): string {
  return JSON.stringify(stable(Object.fromEntries(Object.entries(stores).map(([name, rows]) =>
    [name, [...rows].sort((a, b) => JSON.stringify(a.id).localeCompare(JSON.stringify(b.id)))]))));
}

function exactSnapshot(backup: FarmProBackup): string {
  return JSON.stringify(stable({ ...backup, stores: exactBackupStores(backup.stores) }));
}

export function getBeforeCloudReceiveBackup(): FarmProBackup | null {
  const farmId = getStoredAuthUser()?.farmId;
  if (!farmId) return null;
  const prefix = `${BACKUP_PREFIX}${encodeURIComponent(farmId)}.`;
  const key = window.localStorage.getItem(`${prefix}latest`);
  if (!key || !key.startsWith(prefix) || key === `${prefix}latest`) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const backup = parseFarmProBackupJson(raw);
  if (backup.farm?.id !== farmId) throw new Error('退避データの農場が一致しません。');
  return backup;
}

/** Explicit receive only. Never upload a snapshot or call a record-sync API. */
export async function receiveConfirmedCloudBackup(
  backup: FarmProBackup,
  revision: number,
  confirmed: boolean,
): Promise<void> {
  requirePaidFeature('multiDeviceSync');
  if (confirmed !== true) throw new Error('受信の確認が必要です。');
  if (receiving) throw new Error('受信処理中です。');
  const user = getStoredAuthUser();
  const token = getAuthToken();
  if (!user?.id || !user.farmId || !token) throw new Error('ログインが必要です。');
  const assertSession = () => {
    const current = getStoredAuthUser();
    if (current?.id !== user.id || current.farmId !== user.farmId || getAuthToken() !== token) {
      throw new Error('ログイン状態が変わりました。受信を中止します。');
    }
  };
  const selected = parseFarmProBackupJson(JSON.stringify(backup));
  if (selected.farm?.id !== user.farmId || selected.schemaVersion !== FARM_PRO_DB_VERSION ||
      !Number.isSafeInteger(revision) || revision < 1) {
    throw new Error('農場・保存世代・データ形式が一致しません。');
  }
  let count = 0;
  for (const name of FARM_PRO_STORE_NAMES) {
    const rows = selected.stores[name];
    const keys = new Set<string>();
    for (const row of rows) {
      const key = `${typeof row.id}:${String(row.id)}`;
      if ((typeof row.id === 'number' && !Number.isFinite(row.id)) || keys.has(key)) {
        throw new Error('同じIDの重複または不正なIDがあります。');
      }
      keys.add(key);
    }
    if (name !== 'metadata') count += rows.length;
  }
  if (count === 0) throw new Error('空のクラウドデータでは置き換えません。');
  const selectedContent = exactSnapshot(selected);
  const recheckCloud = async () => {
    const current = await downloadLatestCloudSnapshot();
    assertSession();
    if (!current || current.revision !== revision ||
        exactSnapshot(parseFarmProBackupJson(JSON.stringify(current.snapshot))) !== selectedContent) {
      throw new Error('クラウドが更新されました。内容を再確認してください。');
    }
  };
  receiving = true;
  try {
    await recheckCloud();
    const before = await createFarmProBackup(__APP_VERSION__);
    assertSession();
    if (before.farm?.id !== user.farmId) throw new Error('端末の農場が一致しません。');
    const expectedBefore = exactBackupStores(before.stores);
    const expectedAfter = exactBackupStores(selected.stores);
    if (expectedBefore === expectedAfter) return;

    // Keep older generations. A storage/read-back failure must precede all ledger writes.
    const prefix = `${BACKUP_PREFIX}${encodeURIComponent(user.farmId)}.`;
    const key = `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const raw = JSON.stringify(before);
    try {
      window.localStorage.setItem(key, raw);
      if (window.localStorage.getItem(key) !== raw) throw new Error('BACKUP_READBACK_FAILED');
      window.localStorage.setItem(`${prefix}latest`, key);
      if (window.localStorage.getItem(`${prefix}latest`) !== key) throw new Error('BACKUP_INDEX_FAILED');
    } catch {
      throw new Error('受信前データを退避できないため中止しました。端末の記録は変更していません。');
    }
    await recheckCloud();
    const database = await openFarmProDatabase();
    assertSession();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(FARM_PRO_STORE_NAMES, 'readwrite');
      let failure: Error | undefined;
      const abort = (cause: unknown) => {
        failure = cause instanceof Error ? cause : new Error(String(cause));
        try { tx.abort(); } catch { reject(failure); }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('受信を中止しました。端末の記録は保持されます。'));
      tx.onerror = () => { failure ??= tx.error ?? new Error('受信に失敗しました。'); };
      const readStores = (done: (stores: FarmProBackup['stores']) => void) => {
        const stores = {} as FarmProBackup['stores'];
        let pending = FARM_PRO_STORE_NAMES.length;
        for (const name of FARM_PRO_STORE_NAMES) {
          const request = tx.objectStore(name).getAll();
          request.onsuccess = () => {
            stores[name] = request.result as StoredRecord[];
            if (--pending === 0) { try { done(stores); } catch (error) { abort(error); } }
          };
        }
      };
      readStores((current) => {
        assertSession();
        if (exactBackupStores(current) !== expectedBefore) {
          throw new Error('退避後に端末の記録が変わりました。置き換えていません。');
        }
        for (const name of FARM_PRO_STORE_NAMES) {
          const store = tx.objectStore(name);
          store.clear();
          for (const row of selected.stores[name]) store.put(row);
        }
        // Verify in the same transaction: a mismatch rolls every store back.
        readStores((received) => {
          assertSession();
          if (exactBackupStores(received) !== expectedAfter) {
            throw new Error('受信結果が一致しないため変更を取り消しました。');
          }
        });
      });
    });
  } finally { receiving = false; }
}
