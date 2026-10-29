import 'fake-indexeddb/auto';
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });

import { beforeEach, describe, expect, it } from 'vitest';
import { clearStore, getAllRecords } from '../storage/repository';
import { changeManualSupplyMovement, createSupplyMovement, getSupplyMovements, type SupplyInput } from './supplyInventoryApi';

const purchase: SupplyInput = {
  kind: '医薬品', action: '購入', date: '2026-10-29', itemName: '試験薬',
  lotNumber: 'LOT-SAFE', quantity: 5, unit: '本', expiryDate: '',
  supplier: 'JA', storageLocation: '薬品庫', donorCow: '', sire: '', grade: '',
  cowEarTag: '', unitPrice: 100, amount: 500, paymentMethod: '現金',
  note: '', purchaseReference: 'SAFETY-01',
};

describe('manual inventory edit/delete safety', () => {
  beforeEach(async () => {
    for (const store of ['supplyInventory', 'expenses', 'treatments', 'breedings'] as const)
      await clearStore(store);
  });

  it('updates an unlinked purchase without creating a second record', async () => {
    const id = await createSupplyMovement(purchase, false);
    await changeManualSupplyMovement(id, { ...purchase, quantity: 7 });
    const rows = await getSupplyMovements();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].quantity).toBe(7);
  });

  it('does not permit removing a purchase after stock was used', async () => {
    const id = await createSupplyMovement(purchase, false);
    await createSupplyMovement({ ...purchase, action: '使用', quantity: 3, amount: 0 }, false);
    await expect(changeManualSupplyMovement(id)).rejects.toThrow('マイナス');
    expect(await getSupplyMovements()).toHaveLength(2);
  });

  it('rejects deleting a purchase that generated an expense', async () => {
    const id = await createSupplyMovement(purchase, true);
    await expect(changeManualSupplyMovement(id)).rejects.toThrow('連動');
    expect(await getSupplyMovements()).toHaveLength(1);
    expect(await getAllRecords('expenses')).toHaveLength(1);
  });

  it('deletes an independent manual movement', async () => {
    const id = await createSupplyMovement(purchase, false);
    await changeManualSupplyMovement(id);
    expect(await getSupplyMovements()).toHaveLength(0);
  });
});
