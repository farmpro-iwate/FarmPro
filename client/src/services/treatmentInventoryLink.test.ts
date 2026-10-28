import 'fake-indexeddb/auto';
Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true });

import { beforeEach, describe, expect, it } from 'vitest';
import { clearStore, deleteRecord, getAllRecords, saveRecord } from '../storage/repository';
import { createSupplyMovement, getSupplyBatches, getSupplyMovements, type SupplyInput } from './supplyInventoryApi';
import { deleteTreatmentWithMedicineSource, saveTreatmentWithMedicineSource } from './treatmentInventoryLink';
import { deleteTreatment } from './treatmentApi';
import type { TreatmentInput } from '../types/treatment';

const medicine: SupplyInput = {
  kind: '医薬品', action: '購入', date: '2026-10-27',
  itemName: '試験用薬品', lotNumber: 'LOT001', quantity: 10, unit: '本',
  expiryDate: '2027-10-27', supplier: 'JA', storageLocation: '冷蔵庫',
  donorCow: '', sire: '', grade: '', cowEarTag: '', unitPrice: 200,
  amount: 2000, paymentMethod: '現金', note: '',
};

const treatment: TreatmentInput = {
  targetNumber: '1234', targetName: 'テスト牛', recordType: '治療',
  symptom: '発熱', diagnosis: '', treatmentProcedure: '', treatmentDate: '2026-10-28',
  medicine: '試験用薬品', dosage: '1本', withdrawalEndDate: '2026-11-10',
  veterinarian: '獣医師A', progress: '治療中', note: '',
};

describe('treatment medicine source & stock', () => {
  beforeEach(async () => {
    await clearStore('treatments');
    await clearStore('supplyInventory');
    await clearStore('expenses');
  });

  it('farm stock consumption reduces stock, editing adjusts instead of duplicating', async () => {
    await createSupplyMovement(medicine, false);
    const key = getSupplyBatches(await getSupplyMovements(), '医薬品')[0].key;
    const first = await saveTreatmentWithMedicineSource(treatment, { source: 'farm_stock', batchKey: key, quantity: 2 });
    expect(getSupplyBatches(await getSupplyMovements(), '医薬品')[0].balance).toBe(8);
    await saveTreatmentWithMedicineSource(treatment, { source: 'farm_stock', batchKey: key, quantity: 3 }, first.id);
    expect(getSupplyBatches(await getSupplyMovements(), '医薬品')[0].balance).toBe(7);
    expect((await getSupplyMovements()).filter((row) => row.action === '使用')).toHaveLength(1);
  });

  it('vet supplied medication neither reduces stock nor creates an expense', async () => {
    await createSupplyMovement(medicine, false);
    const record = await saveTreatmentWithMedicineSource(treatment, { source: 'veterinarian', batchKey: '', quantity: 0 });
    expect(record.medicineSource).toBe('veterinarian');
    expect(getSupplyBatches(await getSupplyMovements(), '医薬品')[0].balance).toBe(10);
    expect(await getAllRecords('expenses')).toHaveLength(0);
  });

  it('switching to vet source reverses previous farm stock use', async () => {
    await createSupplyMovement(medicine, false);
    const key = getSupplyBatches(await getSupplyMovements(), '医薬品')[0].key;
    const first = await saveTreatmentWithMedicineSource(treatment, { source: 'farm_stock', batchKey: key, quantity: 2 });
    await saveTreatmentWithMedicineSource(treatment, { source: 'veterinarian', batchKey: '', quantity: 0 }, first.id);
    expect(getSupplyBatches(await getSupplyMovements(), '医薬品')[0].balance).toBe(10);
  });

  it('deleting a treatment restores inventory without deleting other entries', async () => {
    await createSupplyMovement(medicine, false);
    const key = getSupplyBatches(await getSupplyMovements(), '医薬品')[0].key;
    const first = await saveTreatmentWithMedicineSource(treatment, { source: 'farm_stock', batchKey: key, quantity: 2 });
    await deleteTreatmentWithMedicineSource(first.id);
    expect(getSupplyBatches(await getSupplyMovements(), '医薬品')[0].balance).toBe(10);
    expect(await getAllRecords('treatments')).toHaveLength(0);
  });

  it('public treatment deletion restores only linked usage and preserves purchase expense', async () => {
    await createSupplyMovement(medicine, true);
    const key = getSupplyBatches(await getSupplyMovements(), '医薬品')[0].key;
    const first = await saveTreatmentWithMedicineSource(treatment, { source: 'farm_stock', batchKey: key, quantity: 2 });
    const second = await saveTreatmentWithMedicineSource({ ...treatment, targetNumber: '5678' }, { source: 'farm_stock', batchKey: key, quantity: 1 });
    const expensesBefore = await getAllRecords('expenses');
    expect(expensesBefore).toHaveLength(1);
    await deleteTreatment(first.id);
    const movements = await getSupplyMovements();
    expect(getSupplyBatches(movements, '医薬品')[0].balance).toBe(9);
    expect(movements.filter((row) => row.action === '購入')).toHaveLength(1);
    expect(movements.filter((row) => row.action === '使用')).toHaveLength(1);
    expect(movements.find((row) => row.id === second.medicineInventoryMovementId)).toBeDefined();
    expect(await getAllRecords('expenses')).toEqual(expensesBefore);
    expect((await getAllRecords('treatments')).map((row) => row.id)).toEqual([second.id]);
  });

  it('preserves treatment when linked stock history is missing', async () => {
    await createSupplyMovement(medicine, false);
    const key = getSupplyBatches(await getSupplyMovements(), '医薬品')[0].key;
    const saved = await saveTreatmentWithMedicineSource(treatment, { source: 'farm_stock', batchKey: key, quantity: 2 });
    const movement = (await getSupplyMovements()).find((row) => row.action === '使用');
    expect(movement).toBeDefined();
    await deleteRecord('supplyInventory', movement!.id);
    await expect(deleteTreatmentWithMedicineSource(saved.id)).rejects.toThrow('在庫履歴');
    expect((await getAllRecords('treatments')).some((row) => row.id === saved.id)).toBe(true);
  });

  it('does not delete a treatment when its linked usage belongs to a different cow', async () => {
    await createSupplyMovement(medicine, false);
    const key = getSupplyBatches(await getSupplyMovements(), '医薬品')[0].key;
    const saved = await saveTreatmentWithMedicineSource(treatment, { source: 'farm_stock', batchKey: key, quantity: 2 });
    const movement = (await getSupplyMovements()).find((row) => row.action === '使用')!;
    await saveRecord('supplyInventory', { ...movement, cowEarTag: 'different-cow' });
    await expect(deleteTreatmentWithMedicineSource(saved.id)).rejects.toThrow('在庫履歴');
    expect((await getAllRecords('treatments')).some((r) => r.id === saved.id)).toBe(true);
  });

  it('does not save treatment or consumption if stock is insufficient', async () => {
    await createSupplyMovement(medicine, false);
    const key = getSupplyBatches(await getSupplyMovements(), '医薬品')[0].key;
    await expect(saveTreatmentWithMedicineSource(treatment, { source: 'farm_stock', batchKey: key, quantity: 11 })).rejects.toThrow('在庫を超えています');
    expect(await getAllRecords('treatments')).toHaveLength(0);
    expect(getSupplyBatches(await getSupplyMovements(), '医薬品')[0].balance).toBe(10);
  });
});
