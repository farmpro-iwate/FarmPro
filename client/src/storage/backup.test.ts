import 'fake-indexeddb/auto';

Object.defineProperty(globalThis, 'window', {
  value: globalThis,
  writable: true,
});

import { beforeEach, describe, expect, it } from 'vitest';
import { createFarmProBackup, serializeFarmProBackup } from './backup';
import { clearStore, saveRecord } from './repository';
import { FARM_PRO_STORE_NAMES } from './db';

describe('FarmPro backup export', () => {
  beforeEach(async () => {
    await clearStore('cattle');
    await clearStore('metadata');
    await clearStore('treatments');
    await clearStore('breedings');
    await clearStore('supplyInventory');
  });

  it('全ストアを含むバックアップを作成する', async () => {
    await saveRecord('cattle', {
      id: 'cow-1',
      name: '繁殖牛A',
    });

    const backup = await createFarmProBackup('1.6.0');

    expect(backup.format).toBe('farmpro-backup');
    expect(backup.schemaVersion).toBe(4);
    expect(backup.appVersion).toBe('1.6.0');
    expect(backup.exportedAt).toBeTruthy();
    expect(backup.stores.cattle).toHaveLength(1);
    expect(backup.stores.cattle[0].id).toBe('cow-1');
    expect(backup.stores.metadata).toEqual([]);
  });

  it('治療・移植と医薬品・受精卵在庫を同一バックアップに含める', async () => {
    await saveRecord('treatments', { id: 1001, targetNumber: '1234', medicineInventoryMovementId: 'treatment-stock-1001' });
    await saveRecord('breedings', { id: 'et-1', cowEarTag: '5953', embryoInventoryMovementId: 'embryo-stock-et-1' });
    await saveRecord('supplyInventory', { id: 'treatment-stock-1001', kind: '医薬品', action: '使用', quantity: 1 });
    await saveRecord('supplyInventory', { id: 'embryo-stock-et-1', kind: '受精卵', action: '使用', quantity: 1 });
    const backup = await createFarmProBackup('1.6.0');
    expect(Object.keys(backup.stores).sort()).toEqual([...FARM_PRO_STORE_NAMES].sort());
    expect(backup.stores.treatments.some((row) => row.medicineInventoryMovementId === 'treatment-stock-1001')).toBe(true);
    expect(backup.stores.breedings.some((row) => row.embryoInventoryMovementId === 'embryo-stock-et-1')).toBe(true);
    expect(backup.stores.supplyInventory.map((row) => row.id)).toContain('treatment-stock-1001');
    expect(backup.stores.supplyInventory.map((row) => row.id)).toContain('embryo-stock-et-1');
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
