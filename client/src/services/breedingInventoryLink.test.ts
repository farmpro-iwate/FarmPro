import 'fake-indexeddb/auto';
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });
import { beforeEach, describe, expect, it } from 'vitest';
import { clearStore, deleteRecord, getAllRecords, saveRecord } from '../storage/repository';
import { createSupplyMovement, getSupplyBatches, getSupplyMovements, type SupplyInput } from './supplyInventoryApi';
import { deleteBreedingWithEmbryoInventory, saveBreedingWithEmbryoInventory } from './breedingInventoryLink';
import { createBreeding, deleteBreeding } from './breedingApi';
import type { BreedingInput } from '../types/breeding';

const embryo: SupplyInput = { kind: '受精卵', action: '購入', date: '2026-10-27', itemName: 'ET卵',
  lotNumber: 'ET001', quantity: 2, unit: '個', expiryDate: '', supplier: 'JA',
  storageLocation: 'タンクA', donorCow: '母牛', sire: '父牛', grade: 'A',
  cowEarTag: '', unitPrice: 12000, amount: 24000, paymentMethod: '現金', note: '' };
const breeding: BreedingInput = {
  cowEarTag: '5953', cowName: '試験牛', heatDate: '2026-10-20',
  breedingMethod: '受精卵移植', breedingStatus: '移植実施', inseminationDate: '',
  bullName: '', inseminatorName: '', transferPlannedDate: '', transferDate: '2026-10-28',
  transferCancelReason: '', embryoNumber: 'ET001', collectionDate: '', embryoType: '凍結卵',
  donorCowName: '母牛', donorCowEarTag: '', embryoSireName: '父牛', embryoGrade: 'A',
  strawNumber: '', supplierName: '', transferTechnician: '', nextHeatExpectedDate: '',
  pregnancyCheckExpectedDate: '', pregnancyCheckDate: '', pregnancyResult: '未鑑定',
  recheckExpectedDate: '', expectedCalvingDate: '', note: '', embryoSource: 'farm_stock',
};

describe('embryo transfer inventory link', () => {
  beforeEach(async () => {
    await clearStore('supplyInventory');
    await clearStore('breedings');
    await clearStore('expenses');
  });
  const prepare = async () => {
    await createSupplyMovement(embryo, false);
    await saveRecord('breedings', { id: 'et-test', ...breeding, recordKind: 'standard' });
    return getSupplyBatches(await getSupplyMovements(), '受精卵')[0].key;
  };
  it('general breeding creation atomically deducts one embryo from farm stock', async () => {
    await createSupplyMovement(embryo, false);
    const key = getSupplyBatches(await getSupplyMovements(), '受精卵')[0].key;
    const created = await createBreeding({ ...breeding, embryoInventoryBatchKey: key });
    expect(created.embryoInventoryMovementId).toBe('embryo-stock-' + created.id);
    expect(getSupplyBatches(await getSupplyMovements(), '受精卵')[0].balance).toBe(1);
  });
  it('general breeding creation does not save when farm inventory is insufficient', async () => {
    await expect(createBreeding({ ...breeding, embryoInventoryBatchKey: 'missing' })).rejects.toThrow();
    expect(await getAllRecords('breedings')).toHaveLength(0);
  });
  it('general breeding creation with external embryo does not touch farm stock', async () => {
    const created = await createBreeding({ ...breeding, embryoSource: 'external' });
    expect(created.embryoInventoryMovementId).toBeUndefined();
    expect(await getSupplyMovements()).toHaveLength(0);
  });
  it('deducts one embryo when transfer is recorded, without duplicates on resave', async () => {
    const key = await prepare();
    await saveBreedingWithEmbryoInventory('et-test', breeding, key);
    await saveBreedingWithEmbryoInventory('et-test', breeding, key);
    expect(getSupplyBatches(await getSupplyMovements(), '受精卵')[0].balance).toBe(1);
    expect((await getSupplyMovements()).filter((row) => row.action === '使用')).toHaveLength(1);
    expect(await getAllRecords('expenses')).toHaveLength(0);
  });
  it('external embryo does not deduct inventory', async () => {
    const key = await prepare();
    await saveBreedingWithEmbryoInventory('et-test', { ...breeding, embryoSource: 'external' }, '');
    expect(getSupplyBatches(await getSupplyMovements(), '受精卵')[0].balance).toBe(2);
  });
  it('cancelled transfer reverses one linked use', async () => {
    const key = await prepare();
    await saveBreedingWithEmbryoInventory('et-test', breeding, key);
    await saveBreedingWithEmbryoInventory('et-test', { ...breeding, breedingStatus: '中止', embryoSource: 'external' }, '');
    expect(getSupplyBatches(await getSupplyMovements(), '受精卵')[0].balance).toBe(2);
  });
  it('keeps the spent embryo after pregnancy confirmation and calving', async () => {
    const key = await prepare();
    await saveBreedingWithEmbryoInventory('et-test', breeding, key);
    await saveBreedingWithEmbryoInventory('et-test', {
      ...breeding, breedingStatus: '分娩済み', pregnancyResult: '受胎',
      embryoInventoryBatchKey: key,
    }, key);
    expect(getSupplyBatches(await getSupplyMovements(), '受精卵')[0].balance).toBe(1);
  });
  it('deletion restores used stock and removes breeding', async () => {
    const key = await prepare();
    await saveBreedingWithEmbryoInventory('et-test', breeding, key);
    await deleteBreedingWithEmbryoInventory('et-test');
    expect(getSupplyBatches(await getSupplyMovements(), '受精卵')[0].balance).toBe(2);
    expect(await getAllRecords('breedings')).toHaveLength(0);
  });
  it('public ET deletion restores only linked embryo and preserves purchase expense', async () => {
    await createSupplyMovement(embryo, true);
    const key = getSupplyBatches(await getSupplyMovements(), '受精卵')[0].key;
    const first = await createBreeding({ ...breeding, embryoInventoryBatchKey: key });
    const second = await createBreeding({ ...breeding, cowEarTag: '6220', cowName: '別の牛', embryoInventoryBatchKey: key });
    const expensesBefore = await getAllRecords('expenses');
    expect(expensesBefore).toHaveLength(1);
    await deleteBreeding(first.id);
    const movements = await getSupplyMovements();
    expect(getSupplyBatches(movements, '受精卵')[0].balance).toBe(1);
    expect(movements.filter((row) => row.action === '購入')).toHaveLength(1);
    expect(movements.filter((row) => row.action === '使用')).toHaveLength(1);
    expect(movements.find((row) => row.id === second.embryoInventoryMovementId)).toBeDefined();
    expect(await getAllRecords('expenses')).toEqual(expensesBefore);
    expect((await getAllRecords('breedings')).map((row) => row.id)).toEqual([second.id]);
  });

  it('preserves ET record when linked stock history is missing', async () => {
    const key = await prepare();
    await saveBreedingWithEmbryoInventory('et-test', breeding, key);
    const movement = (await getSupplyMovements()).find((row) => row.action === '使用');
    expect(movement).toBeDefined();
    await deleteRecord('supplyInventory', movement!.id);
    await expect(deleteBreedingWithEmbryoInventory('et-test')).rejects.toThrow('在庫履歴');
    expect((await getAllRecords('breedings')).some((row) => row.id === 'et-test')).toBe(true);
  });

  it('does not delete an ET record when the linked stock belongs to another cow', async () => {
    const key = await prepare();
    await saveBreedingWithEmbryoInventory('et-test', breeding, key);
    const movement = (await getSupplyMovements()).find((row) => row.action === '使用')!;
    await saveRecord('supplyInventory', { ...movement, cowEarTag: 'different-cow' });
    await expect(deleteBreedingWithEmbryoInventory('et-test')).rejects.toThrow('在庫履歴');
    expect((await getAllRecords('breedings')).some((r) => r.id === 'et-test')).toBe(true);
  });

  it('failed stock usage leaves existing breeding untouched', async () => {
    const key = await prepare();
    await createSupplyMovement({ ...embryo, action: '使用', quantity: 2, amount: 0 }, false);
    await expect(saveBreedingWithEmbryoInventory('et-test', breeding, key)).rejects.toThrow('在庫がありません');
    expect((await getAllRecords('breedings'))[0].embryoInventoryMovementId).toBeUndefined();
  });
});
