import 'fake-indexeddb/auto';
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });

import { beforeEach, describe, expect, it } from 'vitest';
import { clearStore, getAllRecords, saveRecord } from '../storage/repository';
import { createSupplyMovement, getSupplyBatches, getSupplyMovements, type SupplyInput } from './supplyInventoryApi';
import { saveTreatmentWithMedicineSource } from './treatmentInventoryLink';
import { saveBreedingWithEmbryoInventory } from './breedingInventoryLink';
import { createBreeding } from './breedingApi';
import type { TreatmentInput } from '../types/treatment';
import type { BreedingInput } from '../types/breeding';

const medicine: SupplyInput = {
  kind: '医薬品', action: '購入', date: '2026-10-28', itemName: 'テスト薬',
  lotNumber: 'LOT-001', quantity: 10, unit: '本', expiryDate: '2027-10-28',
  supplier: 'JA', storageLocation: '薬品庫', donorCow: '', sire: '', grade: '',
  cowEarTag: '', unitPrice: 200, amount: 2000, paymentMethod: '現金',
  note: '', purchaseReference: 'MED-INV-001',
};

const embryo: SupplyInput = {
  kind: '受精卵', action: '購入', date: '2026-10-28', itemName: 'ET試験卵',
  lotNumber: 'ET-001', quantity: 2, unit: '個', expiryDate: '',
  supplier: 'JA', storageLocation: 'タンクA', donorCow: '母A', sire: '父A',
  grade: 'A', cowEarTag: '', unitPrice: 12000, amount: 24000,
  paymentMethod: '現金', note: '', purchaseReference: 'ET-INV-001',
};

const treatment = {
  targetNumber: '5953', targetName: 'テスト牛', recordType: '治療',
  symptom: '発熱', diagnosis: '', treatmentDate: '2026-10-29',
  medicine: 'テスト薬', dosage: '2本', withdrawalEndDate: '',
  veterinarian: '担当獣医', progress: '治療中', note: '',
} as TreatmentInput;

const transfer = {
  cowEarTag: '5953', cowName: 'テスト牛', heatDate: '2026-10-20',
  breedingMethod: '受精卵移植', breedingStatus: '移植実施',
  transferDate: '2026-10-29', embryoNumber: 'ET-001', embryoSource: 'farm_stock',
  embryoCost: '', transferProcedureCost: '1000', transferOtherCost: '',
} as BreedingInput;

describe('paid FarmPro inventory + linked activity end-to-end', () => {
  beforeEach(async () => {
    for (const name of ['supplyInventory', 'expenses', 'treatments', 'breedings'] as const) {
      await clearStore(name);
    }
  });

  it.each([
    { lotNumber: medicine.lotNumber, unit: '本' },
    { lotNumber: '', unit: '分包' },
  ])('purchase $unit with lot "$lotNumber" is expensed once and treatment uses only farm stock', async ({ lotNumber, unit }) => {
    await createSupplyMovement({ ...medicine, lotNumber, unit }, true);
    const key = getSupplyBatches(await getSupplyMovements(), '医薬品')[0].key;

    const saved = await saveTreatmentWithMedicineSource(
      { ...treatment, dosage: `2${unit}`, medicineSource: 'farm_stock' },
      { source: 'farm_stock', batchKey: key, quantity: 2 },
    );
    expect(saved.medicineInventoryMovementId).toBeTruthy();
    expect(getSupplyBatches(await getSupplyMovements(), '医薬品')[0].balance).toBe(8);

    await saveTreatmentWithMedicineSource(
      { ...treatment, medicineSource: 'veterinarian' },
      { source: 'veterinarian', batchKey: '', quantity: 0 },
    );
    expect(getSupplyBatches(await getSupplyMovements(), '医薬品')[0].balance).toBe(8);
    const expenses = await getAllRecords('expenses');
    expect(expenses).toHaveLength(1);
    expect(expenses[0].description).toBe('テスト薬 購入' + (lotNumber ? `（${lotNumber}）` : ''));
  });

  it('keeps unnumbered medicine separate from numbered lots and other units when checking stock', async () => {
    const unnumbered = { ...medicine, lotNumber: '  ', unit: '分包', purchaseReference: 'NO-LOT' };
    await createSupplyMovement(unnumbered, false);
    await createSupplyMovement({ ...medicine, unit: '分包' }, false);
    await createSupplyMovement({ ...medicine, lotNumber: '', purchaseReference: 'OTHER-UNIT' }, false);
    await createSupplyMovement({ ...unnumbered, action: '使用', quantity: 8, amount: 0 }, false);

    await expect(createSupplyMovement({ ...unnumbered, action: '使用', quantity: 3, amount: 0 }, false))
      .rejects.toThrow('在庫数を超える');

    const batches = getSupplyBatches(await getSupplyMovements(), '医薬品');
    expect(batches).toHaveLength(3);
    expect(batches.find(batch => batch.lotNumber === '' && batch.unit === '分包')?.balance).toBe(2);
    expect(batches.find(batch => batch.lotNumber === medicine.lotNumber)?.balance).toBe(10);
    expect(batches.find(batch => batch.unit === '本')?.balance).toBe(10);
  });

  it('still requires an embryo number before saving stock or its expense', async () => {
    await expect(createSupplyMovement({ ...embryo, lotNumber: '' }, true)).rejects.toThrow('受精卵番号');
    expect(await getSupplyMovements()).toHaveLength(0);
    expect(await getAllRecords('expenses')).toHaveLength(0);
  });

  it('ET uses exactly one purchased embryo, and resaving does not double-consume or expense', async () => {
    await createSupplyMovement(embryo, true);
    const key = getSupplyBatches(await getSupplyMovements(), '受精卵')[0].key;
    await saveRecord('breedings', {
      ...transfer, id: 'et-safe-1', breedingStatus: '移植予定', embryoSource: '',
    });

    await saveBreedingWithEmbryoInventory('et-safe-1', transfer, key);
    await saveBreedingWithEmbryoInventory('et-safe-1', transfer, key);

    expect(getSupplyBatches(await getSupplyMovements(), '受精卵')[0].balance).toBe(1);
    expect((await getSupplyMovements()).filter(row => row.action === '使用')).toHaveLength(1);
    expect(await getAllRecords('expenses')).toHaveLength(1);
  });

  it('directly creating completed ET consumes exactly one embryo and keeps one purchase expense', async () => {
    await createSupplyMovement(embryo, true);
    const key = getSupplyBatches(await getSupplyMovements(), '受精卵')[0].key;
    const saved = await createBreeding({ ...transfer, embryoInventoryBatchKey: key });
    expect(saved.embryoInventoryMovementId).toBeTruthy();
    expect(getSupplyBatches(await getSupplyMovements(), '受精卵')[0].balance).toBe(1);
    // The purchase expense and the separate transfer procedure fee are both
    // legitimate. Only another embryo purchase expense would be a duplicate.
    const expenses = await getAllRecords('expenses') as Array<{ category?: string; amount?: string }>;
    expect(expenses).toHaveLength(2);
    expect(expenses.filter(row => row.amount === '24000')).toHaveLength(1);
    expect(expenses.filter(row => row.amount === '1000')).toHaveLength(1);
  });

  it('direct completed ET with insufficient stock cannot leave an orphan breeding', async () => {
    await createSupplyMovement(embryo, false);
    const key = getSupplyBatches(await getSupplyMovements(), '受精卵')[0].key;
    await createSupplyMovement({ ...embryo, action: '使用', quantity: 2, amount: 0 }, false);
    await expect(createBreeding({ ...transfer, embryoInventoryBatchKey: key })).rejects.toThrow('在庫がありません');
    expect(await getAllRecords('breedings')).toHaveLength(0);
  });

  it('edits a cloud-imported treatment using its original movement ID after local ID remapping', async () => {
    await createSupplyMovement(medicine, false);
    const key = getSupplyBatches(await getSupplyMovements(), '医薬品')[0].key;
    const original = await saveTreatmentWithMedicineSource(
      { ...treatment, medicineSource: 'farm_stock' },
      { source: 'farm_stock', batchKey: key, quantity: 2 },
    );
    const localCopyId = original.id + 101;
    await saveRecord('treatments', {
      ...original, id: localCopyId, syncRecordId: 'treatment:' + original.id,
    });
    await saveTreatmentWithMedicineSource(
      { ...treatment, medicineSource: 'farm_stock' },
      { source: 'farm_stock', batchKey: key, quantity: 3 },
      localCopyId,
    );
    expect(getSupplyBatches(await getSupplyMovements(), '医薬品')[0].balance).toBe(7);
    expect((await getSupplyMovements()).filter(row => row.action === '使用')).toHaveLength(1);
  });

  it('edits a cloud-imported ET with a different local ID without a second embryo usage', async () => {
    await createSupplyMovement(embryo, false);
    const key = getSupplyBatches(await getSupplyMovements(), '受精卵')[0].key;
    await saveRecord('breedings', { ...transfer, id: 'original-et', breedingStatus: '移植予定' });
    const original = await saveBreedingWithEmbryoInventory('original-et', transfer, key);
    await saveRecord('breedings', { ...original, id: 'other-local-et' });
    await saveBreedingWithEmbryoInventory('other-local-et', transfer, key);
    expect(getSupplyBatches(await getSupplyMovements(), '受精卵')[0].balance).toBe(1);
    expect((await getSupplyMovements()).filter(row => row.action === '使用')).toHaveLength(1);
  });

  it('insufficient stock rolls back the attempted treatment without modifying a previous cow record', async () => {
    await createSupplyMovement(medicine, false);
    const key = getSupplyBatches(await getSupplyMovements(), '医薬品')[0].key;
    await saveRecord('treatments', { id: 101, ...treatment });
    await expect(saveTreatmentWithMedicineSource(
      { ...treatment, medicineSource: 'farm_stock' },
      { source: 'farm_stock', batchKey: key, quantity: 11 }, 101,
    )).rejects.toThrow('在庫を超えています');
    const records = await getAllRecords('treatments');
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(101);
    expect(getSupplyBatches(await getSupplyMovements(), '医薬品')[0].balance).toBe(10);
  });
});
