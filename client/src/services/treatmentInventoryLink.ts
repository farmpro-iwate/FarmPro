import { openFarmProDatabase } from '../storage/db';
import type { Treatment, TreatmentInput } from '../types/treatment';
import { batchKey, isIncoming, type SupplyMovement } from './supplyInventoryApi';

export type MedicineSource = '' | 'farm_stock' | 'veterinarian';

export type TreatmentStockChoice = {
  source: MedicineSource;
  batchKey: string;
  quantity: number;
};

/**
 * Preserve the existing treatment schema and write farm-stock usage atomically.
 * Vet-supplied medicine never changes farm stock or automatically creates an expense.
 */
export async function saveTreatmentWithMedicineSource(
  input: TreatmentInput,
  choice: TreatmentStockChoice,
  treatmentId?: number,
): Promise<Treatment> {
  const source = choice.source;
  if (input.medicine.trim() && source === '' && treatmentId === undefined) {
    throw new Error('薬剤を使用した場合は、農場在庫か獣医師処方かを選んでください。');
  }
  if (source === 'farm_stock' && (!input.medicine.trim() || !choice.batchKey ||
    !Number.isFinite(choice.quantity) || choice.quantity <= 0)) {
    throw new Error('農場在庫から使用する薬剤・ロット・使用数量を指定してください。');
  }
  const db = await openFarmProDatabase();
  const id = treatmentId ?? Date.now();
  const now = new Date().toISOString();
  const movementId = 'treatment-stock-' + id;

  return new Promise<Treatment>((resolve, reject) => {
    const transaction = db.transaction(['treatments', 'supplyInventory'], 'readwrite');
    const treatments = transaction.objectStore('treatments');
    const inventory = transaction.objectStore('supplyInventory');
    let saved: Treatment | undefined;
    let expectedError: Error | null = null;

    const fail = (message: string) => {
      expectedError = new Error(message);
      transaction.abort();
    };
    transaction.oncomplete = () => saved
      ? resolve(saved)
      : reject(new Error('治療記録を保存できませんでした。'));
    transaction.onabort = () => reject(
      expectedError || transaction.error || new Error('治療記録と在庫を保存できませんでした。'),
    );

    const oldRequest = treatments.get(id);
    oldRequest.onsuccess = () => {
      const previous = oldRequest.result as Treatment | undefined;
      if (treatmentId !== undefined && !previous) {
        fail('編集対象の治療記録が見つかりません。');
        return;
      }
      if (treatmentId === undefined && previous) {
        fail('同じIDの治療記録がすでに存在します。もう一度登録してください。');
        return;
      }
      const oldMovementId = previous?.medicineInventoryMovementId;
      const stockRequest = inventory.getAll();
      stockRequest.onsuccess = () => {
        const rows = stockRequest.result as SupplyMovement[];
        const oldMovement = oldMovementId
          ? rows.find((row) => row.id === oldMovementId)
          : undefined;
        // Exclude the previous linked usage so editing does not deduct twice.
        const otherMovements = rows.filter((row) => row.id !== oldMovementId);
        const usage = source === 'farm_stock';
        let newMovement: SupplyMovement | undefined;

        if (usage) {
          const sameBatch = otherMovements.filter((row) =>
            row.kind === '医薬品' && batchKey(row) === choice.batchKey);
          const firstPurchase = sameBatch.find((row) => isIncoming(row.action));
          if (!firstPurchase || firstPurchase.itemName.trim() !== input.medicine.trim()) {
            fail('治療の薬品名と在庫の薬品名が一致しません。');
            return;
          }
          const balance = sameBatch.reduce((sum, row) =>
            sum + (isIncoming(row.action) ? row.quantity : -row.quantity), 0);
          if (balance + 1e-8 < choice.quantity) {
            fail('使用数量が在庫を超えています。');
            return;
          }
          const expiry = sameBatch.find((row) => row.expiryDate)?.expiryDate;
          if (expiry && expiry < input.treatmentDate) {
            fail('使用期限を過ぎた医薬品は選べません。ロットを確認してください。');
            return;
          }
          newMovement = {
            ...firstPurchase,
            id: movementId,
            action: '使用',
            date: input.treatmentDate,
            quantity: choice.quantity,
            cowEarTag: input.targetNumber,
            unitPrice: 0,
            amount: 0,
            note: '治療記録 #' + id + ' と連動',
            expenseRecorded: false,
            createdAt: oldMovement?.createdAt ?? now,
            updatedAt: now,
          };
        }

        // A prior usage can only be reversed when other recorded usage stays within stock.
        if (oldMovement && (!newMovement || batchKey(newMovement) !== batchKey(oldMovement) || newMovement.quantity < oldMovement.quantity)) {
          const oldKey = batchKey(oldMovement);
          const remaining = otherMovements.filter((row) => batchKey(row) === oldKey)
            .reduce((sum, row) => sum + (isIncoming(row.action) ? row.quantity : -row.quantity), 0);
          if (remaining < -1e-8) {
            fail('後から登録した出庫があるため、治療の使用数量を減らせません。先に在庫記録を確認してください。');
            return;
          }
        }

        // Delete only the usage that this treatment created, never manual entries.
        if (oldMovementId) inventory.delete(oldMovementId);
        if (newMovement) inventory.put(newMovement);

        saved = {
          ...previous,
          ...input,
          id,
          medicineSource: source,
          medicineInventoryMovementId: newMovement ? movementId : undefined,
          medicineInventoryBatchKey: newMovement ? choice.batchKey : undefined,
          medicineInventoryQuantity: newMovement ? choice.quantity : undefined,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
        };
        treatments.put(saved);
      };
    };
  });
}

export async function deleteTreatmentWithMedicineSource(id: number): Promise<void> {
  const db = await openFarmProDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['treatments', 'supplyInventory'], 'readwrite');
    const treatmentStore = transaction.objectStore('treatments');
    const inventoryStore = transaction.objectStore('supplyInventory');
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('治療記録を削除できませんでした。'));
    const read = treatmentStore.get(id);
    read.onsuccess = () => {
      const treatment = read.result as Treatment | undefined;
      if (!treatment) return;
      if (treatment.medicineInventoryMovementId) {
        inventoryStore.delete(treatment.medicineInventoryMovementId);
      }
      treatmentStore.delete(id);
    };
  });
}
