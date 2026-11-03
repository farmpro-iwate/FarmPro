import { describe, expect, it } from 'vitest';
import { FARM_PRO_DB_VERSION, FARM_PRO_STORE_NAMES } from './db';
import { parseFarmProBackupJson } from './backup-import';

function createValidBackup(): Record<string, unknown> & { stores: Record<string, unknown[]> } {
  return {
    format: 'farmpro-backup',
    schemaVersion: FARM_PRO_DB_VERSION,
    appVersion: '1.0.0',
    exportedAt: '2026-07-19T08:00:00.000Z',
    stores: Object.fromEntries(
      FARM_PRO_STORE_NAMES.map((storeName) => [storeName, []]),
    ),
  };
}

describe('parseFarmProBackupJson', () => {
  it('正しいバックアップJSONを読み込める', () => {
    const backup = createValidBackup();

    expect(parseFarmProBackupJson(JSON.stringify(backup))).toEqual(backup);
  });

  it('JSONとして壊れている場合はエラーになる', () => {
    expect(() => parseFarmProBackupJson('{')).toThrow(
      'バックアップJSONを読み込めませんでした。',
    );
  });

  it('FarmPro以外の形式は拒否する', () => {
    const backup = {
      ...createValidBackup(),
      format: 'other-backup',
    };

    expect(() => parseFarmProBackupJson(JSON.stringify(backup))).toThrow(
      'FarmProのバックアップファイルではありません。',
    );
  });

  it('DBバージョンが異なる場合は拒否する', () => {
    const backup = {
      ...createValidBackup(),
      schemaVersion: FARM_PRO_DB_VERSION + 1,
    };

    expect(() => parseFarmProBackupJson(JSON.stringify(backup))).toThrow(
      'バックアップのデータ形式が現在のFarmProと一致しません。',
    );
  });

  it('必要なストアが不足している場合は拒否する', () => {
    const backup = createValidBackup();
    const missingStoreName = FARM_PRO_STORE_NAMES[0];

    delete backup.stores[missingStoreName];

    expect(() => parseFarmProBackupJson(JSON.stringify(backup))).toThrow(
      `${missingStoreName} のデータが正しくありません。`,
    );
  });

  it('IDのないレコードが含まれる場合は拒否する', () => {
    const backup = createValidBackup();
    const storeName = FARM_PRO_STORE_NAMES[0];

    backup.stores[storeName] = [{ name: '不正データ' }];

    expect(() => parseFarmProBackupJson(JSON.stringify(backup))).toThrow(
      `${storeName} に不正なレコードがあります。`,
    );
  });

  it('未対応のストアが含まれる場合は拒否する', () => {
    const backup = createValidBackup();

    Object.assign(backup.stores, {
      unknownStore: [],
    });

    expect(() => parseFarmProBackupJson(JSON.stringify(backup))).toThrow(
      '未対応のストアが含まれています: unknownStore',
    );
  });

  it.each([3, 4])('以前のv%sバックアップは活動記録の空storeを補って読める', schemaVersion => {
    const backup = { ...createValidBackup(), schemaVersion };
    delete backup.stores.activityRecords;
    if (schemaVersion === 3) delete backup.stores.supplyInventory;
    const parsed = parseFarmProBackupJson(JSON.stringify(backup));
    expect(parsed.stores.activityRecords).toEqual([]);
    expect(parsed.stores.supplyInventory).toEqual([]);
    expect(parsed.schemaVersion).toBe(schemaVersion);
  });

  it('現在のバックアップの活動記録store欠落は旧版扱いで黙認しない', () => {
    const backup = createValidBackup();
    delete backup.stores.activityRecords;
    expect(() => parseFarmProBackupJson(JSON.stringify(backup))).toThrow('activityRecords');
  });
});
