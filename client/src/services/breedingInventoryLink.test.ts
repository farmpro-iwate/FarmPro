import 'fake-indexeddb/auto';
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });
import { beforeEach, describe, expect, it } from 'vitest';
import { clearStore, getAllRecords, saveRecord } from '../storage/repository';
import { createSupplyMovement, getSupplyBatches, getSupplyMovements, type SupplyInput } from './supplyInventoryApi';
import { deleteBreedingWithEmbryoInventory, saveBreedingWithEmbryoInventory } from './breedingInventoryLink';
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
  it('deletion restores used stock and removes breeding', async () => {
    const key = await prepare();
    await saveBreedingWithEmbryoInventory('et-test', breeding, key);
    await deleteBreedingWithEmbryoInventory('et-test');
    expect(getSupplyBatches(await getSupplyMovements(), '受精卵')[0].balance).toBe(2);
    expect(await getAllRecords('breedings')).toHaveLength(0);
  });
  it('failed stock usage leaves existing breeding untouched', async () => {
    const key = await prepare();
    await createSupplyMovement({ ...embryo, action: '使用', quantity: 2, amount: 0 }, false);
    await expect(saveBreedingWithEmbryoInventory('et-test', breeding, key)).rejects.toThrow('在庫がありません');
    expect((await getAllRecords('breedings'))[0].embryoInventoryMovementId).toBeUndefined();
  });
});
