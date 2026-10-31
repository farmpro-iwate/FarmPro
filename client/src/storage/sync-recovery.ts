import { getStoredAuthUser } from '../services/authClient';
import { isCloudRecoveryPaused } from '../services/syncRecoveryGuard';
import type { FarmProBackup } from './backup';
import { FARM_PRO_DB_VERSION, FARM_PRO_STORE_NAMES, openFarmProDatabase } from './db';
import type { StoredRecord, StoreName } from './types';

export type RecoveryIdentity = { farmId: string; userId: string };

export type RecoveryCheckpoint = {
  id: string;
  farmId: string;
  userId: string;
  createdAt: string;
  status: 'prepared' | 'applying' | 'applied' | 'verified' | 'failed';
  before: FarmProBackup;
  target: FarmProBackup;
  revision: number;
  savedAt: string;
  recordSyncBaseline: Record<string, unknown>;
  error?: string;
};

const CHECKPOINT_STORE = 'checkpoints';

export function assertRecoveryIdentity(identity: RecoveryIdentity): void {
  const current = getStoredAuthUser();
  if (!identity.farmId || !identity.userId || current?.farmId !== identity.farmId || current.id !== identity.userId) {
    throw new Error('ログイン中の農場または利用者が変わりました。復旧を中止しました。');
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function validJsonValue(value: unknown, allowUndefined = false, ancestors = new Set<object>()): boolean {
  if (value === undefined) return allowUndefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!value || typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  ancestors.add(value);
  const valid = Object.values(value).every(item => validJsonValue(item, allowUndefined, ancestors));
  ancestors.delete(value);
  return valid;
}

function containsUndefined(value: unknown): boolean {
  return value === undefined || Boolean(value && typeof value === 'object' && Object.values(value).some(containsUndefined));
}

function typedCanonical(value: unknown): unknown {
  if (value === undefined) return ['undefined'];
  if (value === null) return ['null'];
  if (Array.isArray(value)) return ['array', value.map(typedCanonical)];
  if (typeof value === 'object') return ['object', Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, typedCanonical(item)])];
  return [typeof value, value];
}

function canonicalString(value: unknown): string {
  const normalized = canonical(value);
  // Local records may have explicit undefined properties. Preserve and compare
  // those without confusing them with missing properties or user-owned values.
  return containsUndefined(normalized)
    ? `farmpro-with-undefined:${JSON.stringify(typedCanonical(normalized))}`
    : JSON.stringify(normalized);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

/** Includes metadata and transport fields. Only export time and record order are ignored. */
export function recoveryBackupContent(backup: FarmProBackup): string {
  const { exportedAt: _exportedAt, ...content } = backup;
  const stores = Object.fromEntries(Object.entries(backup.stores).map(([name, records]) => [name,
    [...records].sort((left, right) => {
      const a = `${typeof left.id}:${String(left.id)}`;
      const b = `${typeof right.id}:${String(right.id)}`;
      return a < b ? -1 : a > b ? 1 : 0;
    }),
  ]));
  return canonicalString({ ...content, stores });
}

export type RecoveryValidationOptions = { allowUndefined?: boolean; allowMissingTimestamps?: boolean };

export function validateRecoveryBackup(backup: FarmProBackup, identity: RecoveryIdentity, options: RecoveryValidationOptions = {}): void {
  if (!backup || backup.format !== 'farmpro-backup' || backup.schemaVersion !== FARM_PRO_DB_VERSION ||
      typeof backup.appVersion !== 'string' || !validDate(backup.exportedAt) ||
      backup.farm?.id !== identity.farmId || typeof backup.farm.name !== 'string') {
    throw new Error('農場IDまたは復旧データの形式が一致しません。');
  }
  if (!backup.stores || Object.keys(backup.stores).length !== FARM_PRO_STORE_NAMES.length ||
      Object.keys(backup.stores).some(name => !FARM_PRO_STORE_NAMES.includes(name as StoreName))) {
    throw new Error('復旧に必要な全ストアを確認できません。');
  }
  for (const name of FARM_PRO_STORE_NAMES) {
    const rows = backup.stores[name];
    const ids = new Set<string>();
    if (!Array.isArray(rows)) throw new Error(`${name} の復旧データが正しくありません。`);
    for (const row of rows) {
      if (!row || Array.isArray(row) ||
          !(typeof row.id === 'string' ? row.id.trim().length > 0 : typeof row.id === 'number' && Number.isFinite(row.id)) ||
          (!validDate(row.createdAt) && !(options.allowMissingTimestamps && row.createdAt == null)) ||
          (!validDate(row.updatedAt) && !(options.allowMissingTimestamps && row.updatedAt == null)) ||
          !validJsonValue(row, options.allowUndefined)) {
        throw new Error(`${name} にID・保存日時・内容を確認できない記録があります。`);
      }
      // Existing record-sync code compares String(id); reject that ambiguity too.
      if (ids.has(String(row.id))) throw new Error(`${name} に重複したIDがあります。`);
      ids.add(String(row.id));
      if (row.farmId !== undefined && row.farmId !== identity.farmId) {
        throw new Error(`${name} に別の農場の記録があります。`);
      }
    }
  }
}

/** A coherent, read-only snapshot of this farm, with no cloud requests. */
export async function captureRecoveryBackup(identity: RecoveryIdentity): Promise<FarmProBackup> {
  assertRecoveryIdentity(identity);
  const database = await openFarmProDatabase(isCloudRecoveryPaused() ? identity : undefined);
  assertRecoveryIdentity(identity);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(FARM_PRO_STORE_NAMES, 'readonly');
    const stores = {} as FarmProBackup['stores'];
    for (const name of FARM_PRO_STORE_NAMES) {
      const request = transaction.objectStore(name).getAll();
      request.onsuccess = () => { stores[name] = request.result as StoredRecord[]; };
    }
    transaction.onerror = () => reject(transaction.error ?? new Error('変更前のデータを読み取れませんでした。'));
    transaction.onabort = () => reject(transaction.error ?? new Error('変更前のデータの読み取りを中止しました。'));
    transaction.oncomplete = () => {
      try {
        assertRecoveryIdentity(identity);
        const settings = stores.metadata.find(row => row.id === 'farm-settings');
        const farmName = typeof settings?.farmName === 'string' ? settings.farmName : getStoredAuthUser()?.farmName ?? '';
        resolve({
          format: 'farmpro-backup', schemaVersion: FARM_PRO_DB_VERSION, appVersion: __APP_VERSION__,
          exportedAt: new Date().toISOString(), farm: { id: identity.farmId, name: farmName }, stores,
        });
      } catch (error) { reject(error); }
    };
  });
}

async function openCheckpointDatabase(identity: RecoveryIdentity): Promise<IDBDatabase> {
  assertRecoveryIdentity(identity);
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(`farmpro-sync-recovery-${encodeURIComponent(identity.farmId)}`, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(CHECKPOINT_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('復旧前の退避先を開けませんでした。'));
    request.onblocked = () => reject(new Error('別のFarmPro画面が退避先を使用しています。'));
  });
  try { assertRecoveryIdentity(identity); } catch (error) { database.close(); throw error; }
  return database;
}

function immutableCheckpointContent(checkpoint: RecoveryCheckpoint): string {
  const { status: _status, error: _error, ...immutable } = checkpoint;
  return canonicalString(immutable);
}

function validateCheckpoint(checkpoint: RecoveryCheckpoint): void {
  validateRecoveryBackup(checkpoint.before, checkpoint, { allowUndefined: true, allowMissingTimestamps: true });
  validateRecoveryBackup(checkpoint.target, checkpoint);
  if (!checkpoint.id || !validDate(checkpoint.createdAt) || !validDate(checkpoint.savedAt) ||
      !Number.isSafeInteger(checkpoint.revision) || checkpoint.revision < 1 ||
      !['prepared', 'applying', 'applied', 'verified', 'failed'].includes(checkpoint.status) ||
      !checkpoint.recordSyncBaseline || Array.isArray(checkpoint.recordSyncBaseline) ||
      typeof checkpoint.recordSyncBaseline !== 'object' || !validJsonValue(checkpoint.recordSyncBaseline, true) ||
      (checkpoint.error !== undefined && typeof checkpoint.error !== 'string')) {
    throw new Error('復旧の退避情報が正しくありません。');
  }
}

/** Commit the checkpoint before any replacement; original payloads cannot be overwritten. */
export async function saveRecoveryCheckpoint(checkpoint: RecoveryCheckpoint): Promise<void> {
  assertRecoveryIdentity(checkpoint);
  validateCheckpoint(checkpoint);
  // A caller may hold a recovery lease with credentials/methods. Persist only
  // the checkpoint fields, and freeze this save's payload before awaiting IDB.
  checkpoint = structuredClone({
    id: checkpoint.id, farmId: checkpoint.farmId, userId: checkpoint.userId,
    createdAt: checkpoint.createdAt, status: checkpoint.status,
    before: checkpoint.before, target: checkpoint.target, revision: checkpoint.revision,
    savedAt: checkpoint.savedAt, recordSyncBaseline: checkpoint.recordSyncBaseline,
    ...(checkpoint.error === undefined ? {} : { error: checkpoint.error }),
  });
  const database = await openCheckpointDatabase(checkpoint);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(CHECKPOINT_STORE, 'readwrite');
      const store = transaction.objectStore(CHECKPOINT_STORE);
      let failure: unknown;
      const request = store.get(checkpoint.id);
      request.onsuccess = () => {
        try {
          assertRecoveryIdentity(checkpoint);
          const existing = request.result as RecoveryCheckpoint | undefined;
          if (existing && immutableCheckpointContent(existing) !== immutableCheckpointContent(checkpoint)) {
            throw new Error('保存済みの退避内容は変更できません。');
          }
          store.put(checkpoint);
        } catch (error) { failure = error; transaction.abort(); }
      };
      transaction.oncomplete = () => {
        try { assertRecoveryIdentity(checkpoint); resolve(); } catch (error) { reject(error); }
      };
      transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('変更前のデータを退避できませんでした。'));
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('退避保存を中止しました。'));
    });
  } finally { database.close(); }
}

async function readCheckpoints(identity: RecoveryIdentity, id?: string): Promise<RecoveryCheckpoint[]> {
  const database = await openCheckpointDatabase(identity);
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(CHECKPOINT_STORE, 'readonly');
      const store = transaction.objectStore(CHECKPOINT_STORE);
      const request = id === undefined ? store.getAll() : store.get(id);
      let rows: RecoveryCheckpoint[] = [];
      request.onsuccess = () => {
        rows = (id === undefined ? request.result : request.result ? [request.result] : []) as RecoveryCheckpoint[];
      };
      transaction.oncomplete = () => {
        try {
          assertRecoveryIdentity(identity);
          const owned = rows.filter(row => row.farmId === identity.farmId && row.userId === identity.userId);
          for (const row of owned) validateCheckpoint(row);
          resolve(owned);
        } catch (error) { reject(error); }
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('退避情報を確認できませんでした。'));
      transaction.onabort = () => reject(transaction.error ?? new Error('退避情報の確認を中止しました。'));
    });
  } finally { database.close(); }
}

export async function getRecoveryCheckpoint(identity: RecoveryIdentity, id: string): Promise<RecoveryCheckpoint | null> {
  return (await readCheckpoints(identity, id))[0] ?? null;
}

export async function getLatestRecoveryCheckpoint(identity: RecoveryIdentity): Promise<RecoveryCheckpoint | null> {
  const rows = await readCheckpoints(identity);
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return rows[0] ?? null;
}
