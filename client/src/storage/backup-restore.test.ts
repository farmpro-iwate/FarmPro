import 'fake-indexeddb/auto';
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });
import { beforeEach, describe, expect, it } from 'vitest';
import { FARM_PRO_STORE_NAMES } from './db';
import { parseFarmProBackupJson } from './backup-import';
import { restoreFarmProBackup } from './backup-restore';
import { clearStore, getAllRecords, saveRecord } from './repository';

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
