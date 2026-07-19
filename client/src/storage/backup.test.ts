import 'fake-indexeddb/auto';

Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true,
});

import { beforeEach, describe, expect, it } from 'vitest';
import { createFarmProBackup, serializeFarmProBackup } from './backup';
import { clearStore, saveRecord } from './repository';

describe('FarmPro backup export', () => {
  beforeEach(async () => {
    await clearStore('cattle');
    await clearStore('metadata');
  });

  it('全ストアを含むバックアップを作成する', async () => {
    await saveRecord('cattle', {
      id: 'cow-1',
      name: '繁殖牛A',
    });

    const backup = await createFarmProBackup('1.6.0');

    expect(backup.format).toBe('farmpro-backup');
    expect(backup.schemaVersion).toBe(1);
    expect(backup.appVersion).toBe('1.6.0');
    expect(backup.exportedAt).toBeTruthy();
    expect(backup.stores.cattle).toHaveLength(1);
    expect(backup.stores.cattle[0].id).toBe('cow-1');
    expect(backup.stores.metadata).toEqual([]);
  });

  it('バックアップをJSON文字列へ変換する', async () => {
    const backup = await createFarmProBackup('1.6.0');
    const json = serializeFarmProBackup(backup);
    const parsed = JSON.parse(json);

    expect(parsed.format).toBe('farmpro-backup');
    expect(parsed.appVersion).toBe('1.6.0');
    expect(parsed.stores).toBeTruthy();
  });
});

