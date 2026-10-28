import 'fake-indexeddb/auto';

Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });
import { beforeEach, describe, expect, it } from 'vitest';
import { clearStore, getAllRecords, saveRecord } from '../storage/repository';
import {
  batchKey, createSupplyMovement, getSupplyBatches,
  getSupplyMovements, SupplyInput, validateSupplyInput,
} from './supplyInventoryApi';

const example: SupplyInput = {
  kind: '受精卵', action: '購入', date: '2026-10-28', itemName: '黒毛和種受精卵',
  lotNumber: 'ET-001', quantity: 2, unit: '個', expiryDate: '', supplier: 'JA',
  storageLocation: 'タンクA', donorCow: '母A', sire: '父A', grade: 'A',
  cowEarTag: '', unitPrice: 20000, amount: 40000, paymentMethod: '現金', note: '',
};

describe('medicine and embryo inventory', () => {
  beforeEach(async () => {
    await clearStore('supplyInventory');
    await clearStore('expenses');
  });

  it('records purchases and calculates stock for each batch', async () => {
    await createSupplyMovement(example, false);
    await createSupplyMovement({ ...example, action: '使用', quantity: 1, amount: 0 }, false);
    expect(getSupplyBatches(await getSupplyMovements(), '受精卵')[0].balance).toBe(1);
  });

  it('does not allow an outgoing quantity over the stock', async () => {
    await expect(createSupplyMovement({ ...example, action: '使用' }, false)).rejects.toThrow('在庫数を超える');
    expect(await getSupplyMovements()).toHaveLength(0);
  });

  it('adds exactly one matching expense in the same transaction', async () => {
    await createSupplyMovement(example, true);
    const expenses = await getAllRecords('expenses');
    expect(expenses).toHaveLength(1);
    expect(expenses[0].category).toBe('種付け・繁殖費');
    expect(expenses[0].amount).toBe('40000');
  });

  it('does not overwrite unrelated cattle or expense records', async () => {
    await saveRecord('cattle', { id: 'cow-existing', name: 'ひめこ' });
    await saveRecord('expenses', { id: 'expense-existing', amount: '1234' });
    await createSupplyMovement(example, false);
    expect((await getAllRecords('cattle')).some((r) => r.id === 'cow-existing')).toBe(true);
    expect((await getAllRecords('expenses')).map((r) => r.id)).toEqual(['expense-existing']);
  });

  it('requires a positive integer for embryos', () => {
    expect(validateSupplyInput({ ...example, quantity: 1.5 }, false)).toContain('整数');
  });

  it('separates batches by storage location and lot', () => {
    expect(batchKey(example)).not.toBe(batchKey({ ...example, storageLocation: 'タンクB' }));
  });
});
