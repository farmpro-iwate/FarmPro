import { FARM_PRO_DB_VERSION, FARM_PRO_STORE_NAMES } from './db';
import type { FarmProBackup } from './backup';
import type { StoreName, StoredRecord } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredRecord(value: unknown): value is StoredRecord {
  return isRecord(value) && (typeof value.id === 'string' || typeof value.id === 'number');
}

function isStoreName(value: string): value is StoreName {
  return FARM_PRO_STORE_NAMES.includes(value as StoreName);
}

export function parseFarmProBackupJson(json: string): FarmProBackup {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('バックアップJSONを読み込めませんでした。');
  }

  if (!isRecord(parsed)) {
    throw new Error('バックアップデータの形式が正しくありません。');
  }

  if (parsed.format !== 'farmpro-backup') {
    throw new Error('FarmProのバックアップファイルではありません。');
  }

  if (parsed.schemaVersion !== FARM_PRO_DB_VERSION) {
    throw new Error('バックアップのデータ形式が現在のFarmProと一致しません。');
  }

  if (typeof parsed.appVersion !== 'string') {
    throw new Error('アプリ版の情報が正しくありません。');
  }

  if (typeof parsed.exportedAt !== 'string') {
    throw new Error('バックアップ日時の情報が正しくありません。');
  }

  if (!isRecord(parsed.stores)) {
    throw new Error('ストアデータの形式が正しくありません。');
  }

  for (const storeName of FARM_PRO_STORE_NAMES) {
    const records = parsed.stores[storeName];

    if (!Array.isArray(records)) {
      throw new Error(`${storeName} のデータが正しくありません。`);
    }

    if (!records.every(isStoredRecord)) {
      throw new Error(`${storeName} に不正なレコードがあります。`);
    }
  }

  for (const storeName of Object.keys(parsed.stores)) {
    if (!isStoreName(storeName)) {
      throw new Error(`未対応のストアが含まれています: ${storeName}`);
    }
  }

  return parsed as unknown as FarmProBackup;
}

export async function readFarmProBackupFile(
  file: File,
): Promise<FarmProBackup> {
  const json = await file.text();
  return parseFarmProBackupJson(json);
}

