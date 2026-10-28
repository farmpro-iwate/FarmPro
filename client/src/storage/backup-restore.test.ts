import 'fake-indexeddb/auto';
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });
import { beforeEach, describe, expect, it } from 'vitest';
import { FARM_PRO_STORE_NAMES } from './db';
import { createFarmProBackup, serializeFarmProBackup } from './backup';
import { parseFarmProBackupJson } from './backup-import';
import { restoreFarmProBackup } from './backup-restore';
import { clearStore, getAllRecords, saveRecord } from './repository';
import type { StoredRecord } from './types';

const stores = () => Object.fromEntries(FARM_PRO_STORE_NAMES.map((name) => [name, [] as unknown[]]));
const backup = (version: 3 | 4) => {
  const data = { format: 'farmpro-backup', schemaVersion: version, appVersion: '1.6.0', exportedAt: '2026-10-28T00:00:00Z', stores: stores() };
  if (version === 3) delete data.stores.supplyInventory;
  return parseFarmProBackupJson(JSON.stringify(data));
};

describe('atomic backup restore', () => {
  beforeEach(async () => {
    for (const name of FARM_PRO_STORE_NAMES) await clearStore(name);
  });

  it('keeps cattle, sales, expense totals and linked medical/ET stock after a complete backup roundtrip', async () => {
    // Synthetic records only: no production farm, browser profile, or server involved.
    const sample = [
      { store: 'metadata', record: { id: 'farm', farmName: '復元検証農場' } },
      { store: 'cattle', record: { id: 'cow-01', earTag: '9901', name: '検証母牛A' } },
      { store: 'cattle', record: { id: 'cow-02', earTag: '9902', name: '検証母牛B' } },
      { store: 'calves', record: { id: 'calf-01', calfNumber: '9911', name: '検証子牛' } },
      { store: 'sales', record: { id: 'sale-01', calfNumber: '9911', saleAmount: '450000' } },
      { store: 'sales', record: { id: 'sale-02', calfNumber: '9912', saleAmount: '320000' } },
      { store: 'expenses', record: { id: 'expense-01', category: '医薬品費', amount: '8000' } },
      { store: 'expenses', record: { id: 'expense-02', category: '種付け・繁殖費', amount: '24000' } },
      { store: 'expenses', record: { id: 'expense-03', category: '飼料費', amount: '40000' } },
      { store: 'treatments', record: { id: 9001, targetNumber: '9901', medicineInventoryMovementId: 'medicine-use-01', medicineInventoryQuantity: 2 } },
      { store: 'breedings', record: { id: 'breeding-01', cowEarTag: '9902', embryoInventoryMovementId: 'embryo-use-01' } },
      { store: 'supplyInventory', record: { id: 'medicine-buy-01', kind: '医薬品', action: '購入', quantity: 10, unit: '本', itemName: '検証薬剤', lotNumber: 'M-01', storageLocation: '冷蔵庫' } },
      { store: 'supplyInventory', record: { id: 'medicine-use-01', kind: '医薬品', action: '使用', quantity: 2, unit: '本', itemName: '検証薬剤', lotNumber: 'M-01', storageLocation: '冷蔵庫', cowEarTag: '9901' } },
      { store: 'supplyInventory', record: { id: 'embryo-buy-01', kind: '受精卵', action: '購入', quantity: 2, unit: '個', itemName: '検証受精卵', lotNumber: 'ET-01', storageLocation: 'タンク' } },
      { store: 'supplyInventory', record: { id: 'embryo-use-01', kind: '受精卵', action: '使用', quantity: 1, unit: '個', itemName: '検証受精卵', lotNumber: 'ET-01', storageLocation: 'タンク', cowEarTag: '9902' } },
      { store: 'feedInventory', record: { id: 'feed-01', itemName: '検証飼料', quantity: 20 } },
    ] as const;
    for (const entry of sample) {
      await saveRecord(entry.store, entry.record);
    }

    const archived = parseFarmProBackupJson(
      serializeFarmProBackup(await createFarmProBackup('1.6.0')),
    );
    expect(archived.farm?.name).toBe('復元検証農場');

    // Simulate a changed device: restoring must recover the entire snapshot.
    await clearStore('cattle');
    await clearStore('expenses');
    await clearStore('supplyInventory');
    await saveRecord('sales', { id: 'sale-01', saleAmount: '999999' });
    await restoreFarmProBackup(archived);

    for (const name of FARM_PRO_STORE_NAMES) {
      expect(await getAllRecords(name)).toEqual(archived.stores[name]);
    }

    const sum = (records: StoredRecord[], field: 'amount' | 'saleAmount') =>
      records.reduce((total, row) => total + Number(row[field] || 0), 0);
    expect((await getAllRecords('cattle')).length).toBe(2);
    expect((await getAllRecords('sales')).length).toBe(2);
    expect(sum(await getAllRecords('sales'), 'saleAmount')).toBe(770000);
    expect((await getAllRecords('expenses')).length).toBe(3);
    expect(sum(await getAllRecords('expenses'), 'amount')).toBe(72000);

    const stock = await getAllRecords('supplyInventory');
    expect(stock.filter((row) => row.kind === '医薬品')
      .reduce((n, row) => n + (row.action === '購入' ? 1 : -1) * Number(row.quantity), 0)).toBe(8);
    expect(stock.filter((row) => row.kind === '受精卵')
      .reduce((n, row) => n + (row.action === '購入' ? 1 : -1) * Number(row.quantity), 0)).toBe(1);
    expect(stock.some((row) => row.id === (archived.stores.treatments[0] as { medicineInventoryMovementId?: string }).medicineInventoryMovementId)).toBe(true);
    expect(stock.some((row) => row.id === (archived.stores.breedings[0] as { embryoInventoryMovementId?: string }).embryoInventoryMovementId)).toBe(true);
  });

  it('replaces every store from v4 backup', async () => {
    const data = backup(4);
    data.stores.cattle = [{ id: 'after', name: '新しい牛' }];
    await saveRecord('cattle', { id: 'before', name: '元の牛' });
    await restoreFarmProBackup(data);
    expect((await getAllRecords('cattle')).map((row) => row.id)).toEqual(['after']);
  });

  it('allows legacy v3 restoration without medical/embryo stock', async () => {
    const data = backup(3);
    data.stores.cattle = [{ id: 'legacy' }];
    await restoreFarmProBackup(data);
    expect((await getAllRecords('cattle')).map((row) => row.id)).toEqual(['legacy']);
    expect(await getAllRecords('supplyInventory')).toEqual([]);
  });

  it('rejects v3 restoration when newer inventory exists, preserving all data', async () => {
    await saveRecord('cattle', { id: 'current-cow' });
    await saveRecord('supplyInventory', { id: 'embryo-1', kind: '受精卵' });
    await expect(restoreFarmProBackup(backup(3))).rejects.toThrow('現在の在庫を消さないため');
    expect((await getAllRecords('cattle')).map((row) => row.id)).toEqual(['current-cow']);
    expect((await getAllRecords('supplyInventory')).map((row) => row.id)).toEqual(['embryo-1']);
  });

  it('invalid backup cannot clear even one store', async () => {
    await saveRecord('cattle', { id: 'protected' });
    const data = backup(4);
    data.stores.expenses = [{ name: 'invalid' } as any];
    await expect(restoreFarmProBackup(data)).rejects.toThrow('expenses');
    expect((await getAllRecords('cattle')).map((row) => row.id)).toEqual(['protected']);
  });
});
