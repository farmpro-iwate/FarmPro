import { openFarmProDatabase } from '../storage/db';
import type { Breeding, BreedingInput } from '../types/breeding';
import { batchKey, isIncoming, type SupplyMovement } from './supplyInventoryApi';

export async function saveBreedingWithEmbryoInventory(
  id: string | number,
  input: BreedingInput,
  batch: string,
  options?: { create?: boolean },
): Promise<Breeding> {
  const db = await openFarmProDatabase();
  const linkedId = 'embryo-stock-' + String(id);
  const now = new Date().toISOString();
  return new Promise<Breeding>((resolve, reject) => {
    const tx = db.transaction(['breedings', 'supplyInventory'], 'readwrite');
    const breedingStore = tx.objectStore('breedings');
    const stockStore = tx.objectStore('supplyInventory');
    let output: Breeding | undefined;
    let failure: Error | null = null;
    const abort = (message: string) => { failure = new Error(message); tx.abort(); };
    tx.oncomplete = () => output ? resolve(output) : reject(new Error('移植記録を保存できませんでした。'));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('在庫と移植記録の保存に失敗しました。'));
    const old = breedingStore.get(id);
    old.onsuccess = () => {
      const previous = old.result as Breeding | undefined;
      if (options?.create ? Boolean(previous) : (!previous || (!('cowEarTag' in previous) && !('breedingMethod' in previous)))) {
        abort(options?.create ? '同じIDの繁殖記録がすでにあります。' : '繁殖記録が見つかりません。');
        return;
      }
      const oldMovementId = previous?.embryoInventoryMovementId;
      const stockRead = stockStore.getAll();
      stockRead.onsuccess = () => {
        const all = stockRead.result as SupplyMovement[];
        const previousUsage = all.find((row) => row.id === oldMovementId);
        if (oldMovementId && !previousUsage) {
          abort('移植に紐づく在庫履歴がありません。手動確認が必要です。');
          return;
        }
        if (previousUsage && (
          oldMovementId !== linkedId ||
          previousUsage.kind !== '受精卵' ||
          previousUsage.action !== '使用' ||
          previousUsage.cowEarTag !== previous?.cowEarTag ||
          batchKey(previousUsage) !== previous?.embryoInventoryBatchKey
        )) {
          abort('移植に紐づく在庫履歴の内容が一致しません。既存の記録は変更せず中止しました。');
          return;
        }
        const remaining = all.filter((row) => row.id !== oldMovementId);
        // Keep historical ET consumption after pregnancy diagnosis or calving.
        // Only an explicit cancellation, changing away from ET, or changing
        // the embryo source can reverse a previously completed transfer.
        const isCompletedTransfer = input.breedingMethod === '受精卵移植' && input.breedingStatus === '移植実施';
        if (options?.create && isCompletedTransfer && !['farm_stock', 'external'].includes(input.embryoSource || '')) {
          abort('移植する受精卵の使用元を選んでください。');
          return;
        }
        if (isCompletedTransfer && !input.transferDate) {
          abort('移植実施日を入力してください。');
          return;
        }
        const usesStock = input.breedingMethod === '受精卵移植' &&
          input.embryoSource === 'farm_stock' &&
          input.breedingStatus !== '中止' &&
          (input.breedingStatus === '移植実施' || Boolean(previousUsage));
        let movement: SupplyMovement | undefined;
        if (usesStock) {
          if (!input.transferDate || !batch) { abort('移植日と受精卵在庫を選んでください。'); return; }
          const matching = remaining.filter((row) => row.kind === '受精卵' && batchKey(row) === batch);
          const purchase = matching.find((row) => isIncoming(row.action));
          if (!purchase || purchase.lotNumber.trim() !== input.embryoNumber.trim()) {
            abort('選択した受精卵番号と移植記録が一致しません。');
            return;
          }
          const balance = matching.reduce((sum, row) => sum + (isIncoming(row.action) ? row.quantity : -row.quantity), 0);
          if (balance < 1) { abort('この受精卵の在庫がありません。'); return; }
          movement = {
            ...purchase, id: linkedId, action: '使用', date: input.transferDate,
            quantity: 1, cowEarTag: input.cowEarTag, unitPrice: 0, amount: 0,
            expenseRecorded: false, note: '受精卵移植記録 #' + String(id) + ' と連動',
            createdAt: previousUsage?.createdAt ?? now, updatedAt: now,
          };
        }
        if (previousUsage) {
          const oldKey = batchKey(previousUsage);
          const otherBalance = remaining.filter((row) => batchKey(row) === oldKey)
            .reduce((sum, row) => sum + (isIncoming(row.action) ? row.quantity : -row.quantity), 0);
          if (otherBalance < 0) {
            abort('別の出庫記録と整合しないため変更できません。在庫履歴を確認してください。');
            return;
          }
          stockStore.delete(previousUsage.id);
        }
        if (movement) stockStore.put(movement);
        output = {
          ...previous, ...input, id, recordKind: 'standard',
          embryoInventoryMovementId: movement?.id,
          embryoInventoryBatchKey: movement ? batch : undefined,
          createdAt: previous?.createdAt ?? now, updatedAt: now,
        } as Breeding;
        breedingStore.put(output);
      };
    };
  });
}

export async function deleteBreedingWithEmbryoInventory(id: string | number): Promise<void> {
  const db = await openFarmProDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['breedings', 'supplyInventory'], 'readwrite');
    const breedings = tx.objectStore('breedings');
    const inventory = tx.objectStore('supplyInventory');
    let failure: Error | undefined;
    const abort = (message: string) => {
      failure = new Error(message);
      tx.abort();
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure || tx.error || new Error('繁殖記録を削除できませんでした。'));

    const request = breedings.get(id);
    request.onsuccess = () => {
      const previous = request.result as Breeding | undefined;
      if (!previous) {
        abort('削除する繁殖記録が見つかりません。');
        return;
      }
      const movementId = previous.embryoInventoryMovementId;
      if (!movementId) {
        // Older records and externally supplied embryos have no stock movement.
        breedings.delete(id);
        return;
      }
      const movementRead = inventory.get(movementId);
      movementRead.onsuccess = () => {
        const movement = movementRead.result as SupplyMovement | undefined;
        if (!movement || movementId !== 'embryo-stock-' + String(id) ||
          movement.kind !== '受精卵' || movement.action !== '使用' ||
          movement.cowEarTag !== previous.cowEarTag ||
          batchKey(movement) !== previous.embryoInventoryBatchKey) {
          abort('移植に紐づく受精卵の在庫履歴が見つからないか不正です。繁殖記録を残したまま削除を中止しました。');
          return;
        }
        inventory.delete(movementId);
        breedings.delete(id);
      };
    };
  });
}
