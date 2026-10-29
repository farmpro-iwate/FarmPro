import { openFarmProDatabase } from '../storage/db';
import { getAllRecords } from '../storage/repository';
import { getCurrentFarmProPlanId } from '../plans/current-plan';
import { getFarmProPlan } from '../plans/policy';
import { retryPendingExpenseSync } from './expensesApi';
import { markLocalChangePending } from './deviceSync';

export type SupplyKind = '医薬品' | '受精卵';
export type SupplyAction = '購入' | '使用' | '廃棄' | '棚卸増' | '棚卸減';

export type SupplyMovement = {
  id: string;
  kind: SupplyKind;
  action: SupplyAction;
  date: string;
  itemName: string;
  lotNumber: string;
  quantity: number;
  unit: string;
  expiryDate: string;
  supplier: string;
  storageLocation: string;
  donorCow: string;
  sire: string;
  grade: string;
  cowEarTag: string;
  unitPrice: number;
  amount: number;
  paymentMethod: string;
  note: string;
  expenseRecorded: boolean;
  purchaseReference?: string;
  createdAt: string;
  updatedAt: string;
};

export type SupplyInput = Omit<SupplyMovement, 'id' | 'createdAt' | 'updatedAt' | 'expenseRecorded'>;

export type SupplyBatch = {
  key: string;
  kind: SupplyKind;
  itemName: string;
  lotNumber: string;
  unit: string;
  expiryDate: string;
  storageLocation: string;
  donorCow: string;
  sire: string;
  grade: string;
  balance: number;
};

export function isIncoming(action: SupplyAction): boolean {
  return action === '購入' || action === '棚卸増';
}

export function batchKey(row: Pick<SupplyMovement, 'kind' | 'itemName' | 'lotNumber' | 'unit' | 'storageLocation'>): string {
  return [row.kind, row.itemName.trim().toLocaleLowerCase(), row.lotNumber.trim().toLocaleLowerCase(), row.unit, row.storageLocation.trim().toLocaleLowerCase()].join('|');
}

export function getSupplyBatches(rows: SupplyMovement[], kind: SupplyKind): SupplyBatch[] {
  const batches = new Map<string, SupplyBatch>();
  for (const row of rows.filter((entry) => entry.kind === kind)) {
    const key = batchKey(row);
    const existing = batches.get(key);
    const delta = (isIncoming(row.action) ? 1 : -1) * row.quantity;
    if (existing) {
      existing.balance += delta;
      if (!existing.expiryDate && row.expiryDate) existing.expiryDate = row.expiryDate;
    } else {
      batches.set(key, {
        key,
        kind: row.kind,
        itemName: row.itemName,
        lotNumber: row.lotNumber,
        unit: row.unit,
        expiryDate: row.expiryDate,
        storageLocation: row.storageLocation,
        donorCow: row.donorCow,
        sire: row.sire,
        grade: row.grade,
        balance: delta,
      });
    }
  }
  return Array.from(batches.values()).sort((a, b) => a.itemName.localeCompare(b.itemName, 'ja'));
}

export async function getSupplyMovements(): Promise<SupplyMovement[]> {
  return getAllRecords<SupplyMovement>('supplyInventory');
}

export function validateSupplyInput(input: SupplyInput, recordExpense: boolean): string {
  if (!input.date) return '日付を入力してください。';
  if (!input.itemName.trim()) return '品名を入力してください。';
  if (!input.lotNumber.trim()) return input.kind === '医薬品' ? 'ロット番号を入力してください。' : '受精卵番号を入力してください。';
  if (!input.unit.trim()) return '単位を入力してください。';
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) return '数量は0より大きい数字で入力してください。';
  if (input.kind === '受精卵' && (!Number.isInteger(input.quantity) || input.unit !== '個')) {
    return '受精卵は「個」単位の整数で入力してください。';
  }
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0 || !Number.isFinite(input.amount) || input.amount < 0) {
    return '単価と金額は0以上の数字で入力してください。';
  }
  if (recordExpense && (input.action !== '購入' || input.amount <= 0)) {
    return '経費登録する場合は購入金額を入力してください。';
  }
  return '';
}

/**
 * Save the stock movement and optional expense in one atomic IndexedDB transaction.
 * Existing cattle, treatment, ET, feed and expense entries are never edited.
 */
export async function createSupplyMovement(input: SupplyInput, recordExpense: boolean): Promise<string> {
  const error = validateSupplyInput(input, recordExpense);
  if (error) throw new Error(error);

  const db = await openFarmProDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const movement: SupplyMovement = {
    ...input,
    itemName: input.itemName.trim(),
    lotNumber: input.lotNumber.trim(),
    purchaseReference: input.purchaseReference?.trim() ?? '',
    id,
    expenseRecorded: recordExpense,
    createdAt: now,
    updatedAt: now,
  };

  await new Promise<void>((resolve, reject) => {
    const storeNames = recordExpense ? ['supplyInventory', 'expenses'] : ['supplyInventory'];
    const transaction = db.transaction(storeNames, 'readwrite');
    const supplyStore = transaction.objectStore('supplyInventory');
    let validationError: Error | null = null;

    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(validationError || transaction.error || new Error('保存を完了できませんでした。'));

    const request = supplyStore.getAll();
    request.onsuccess = () => {
      const rows = request.result as SupplyMovement[];
      // A purchase invoice LINE is unique for one supplier and purchase date.
      // Reject accidental resubmission even when the expense checkbox is off.
      const reference = movement.purchaseReference?.trim().toLocaleLowerCase() ?? '';
      const samePurchase = movement.action === '購入' && Boolean(reference) && rows.some((row) =>
        row.action === '購入' &&
        row.kind === movement.kind &&
        row.date === movement.date &&
        row.supplier.trim().toLocaleLowerCase() === movement.supplier.trim().toLocaleLowerCase() &&
        row.purchaseReference?.trim().toLocaleLowerCase() === reference
      );
      if (samePurchase) {
        validationError = new Error('同じ購入伝票・明細番号の入庫がすでにあります。二重登録を防ぐため保存していません。');
        transaction.abort();
        return;
      }

      const key = batchKey(movement);
      const balance = rows
        .filter((row) => batchKey(row) === key)
        .reduce((sum, row) => sum + (isIncoming(row.action) ? row.quantity : -row.quantity), 0);

      if (!isIncoming(movement.action) && balance + 1e-8 < movement.quantity) {
        validationError = new Error('在庫数を超える出庫は登録できません。');
        transaction.abort();
        return;
      }
      supplyStore.add(movement);

      if (recordExpense) {
        const category = input.kind === '医薬品' ? '医薬品費' : '種付け・繁殖費';
        const expenseStore = transaction.objectStore('expenses');
        const existing = expenseStore.getAll();
        existing.onsuccess = () => {
          const reference = input.purchaseReference?.trim().toLocaleLowerCase() ?? '';
          const candidates = existing.result as Array<{
            category?: string; paymentDate?: string; amount?: string; vendor?: string;
            sourceSupplyPurchaseReference?: string;
          }>;
          const samePayment = candidates.some((expense) => {
            const storedReference = expense.sourceSupplyPurchaseReference?.trim().toLocaleLowerCase() ?? '';
            const sameOrigin = expense.category === category &&
              expense.paymentDate === input.date &&
              expense.vendor?.trim().toLocaleLowerCase() === input.supplier.trim().toLocaleLowerCase();
            if (!sameOrigin) return false;
            // The same explicit invoice line must not post a second expense,
            // even if the amount has been altered on a retry.
            if (reference && storedReference) return reference === storedReference;
            // Existing manual expenses have no invoice-line reference:
            // conservatively block same-day/same-vendor/same-amount posting.
            return Number(expense.amount) === input.amount;
          });
          if (samePayment) {
            validationError = new Error('同じ購入伝票、または同じ日付・支払先・金額の経費が見つかりました。二重計上を防ぐため保存を中止しました。経費登録済みならチェックを外して在庫だけ登録してください。');
            transaction.abort();
            return;
          }
          expenseStore.add({
          id: 'supply-expense-' + id,
          syncRecordId: 'expense:supply-expense-' + id,
          cloudSyncPending: getFarmProPlan(getCurrentFarmProPlanId()).multiDeviceSync,
          paymentDate: input.date,
          category,
          description: input.itemName.trim() + ' 購入（' + input.lotNumber.trim() + '）',
          vendor: input.supplier.trim(),
          amount: String(input.amount),
          paymentMethod: input.paymentMethod || '現金',
          target: '農場全体',
          memo: '在庫購入から登録（同じ支払いを再登録しないでください）',
          sourceSupplyMovementId: id,
          sourceSupplyPurchaseReference: input.purchaseReference?.trim() ?? '',
          createdAt: now,
          updatedAt: now,
          });
        };
      }
    };
  });
  // The local inventory + purchase expense commit together. Cloud sync is
  // retried after the transaction, never during it.
  markLocalChangePending();
  if (recordExpense) {
    try {
      await retryPendingExpenseSync(['supply-expense-' + id]);
    } catch (error) {
      console.warn('購入経費のクラウド同期は保留しました。ローカルの購入記録は保持します。', error);
    }
  }
  return id;
}

/** Edit/delete only independent manual entries. Linked expense, treatment and ET records are protected. */
export async function changeManualSupplyMovement(id: string, replacement?: SupplyInput): Promise<void> {
  if (replacement) {
    const error = validateSupplyInput(replacement, false);
    if (error) throw new Error(error);
  }
  const db = await openFarmProDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['supplyInventory', 'expenses', 'treatments', 'breedings'], 'readwrite');
    let failure: Error | undefined;
    const fail = (message: string) => { failure = new Error(message); tx.abort(); };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure ?? tx.error ?? new Error('変更を保存できませんでした。'));
    const inventory = tx.objectStore('supplyInventory');
    const allInventory = inventory.getAll();
    const allExpenses = tx.objectStore('expenses').getAll();
    const allTreatments = tx.objectStore('treatments').getAll();
    const allBreedings = tx.objectStore('breedings').getAll();
    let ready = 0;
    const check = () => {
      if (++ready !== 4) return;
      const rows = allInventory.result as SupplyMovement[];
      const old = rows.find(row => row.id === id);
      if (!old) { fail('対象の在庫履歴が見つかりません。'); return; }
      const expenses = allExpenses.result as Array<{ sourceSupplyMovementId?: string }>;
      const treatments = allTreatments.result as Array<{ medicineInventoryMovementId?: string }>;
      const breedings = allBreedings.result as Array<{ embryoInventoryMovementId?: string }>;
      if (old.expenseRecorded || expenses.some(row => row.sourceSupplyMovementId === id) ||
          treatments.some(row => row.medicineInventoryMovementId === id) ||
          breedings.some(row => row.embryoInventoryMovementId === id) ||
          id.startsWith('treatment-stock-') || id.startsWith('embryo-stock-')) {
        fail('経費・治療・移植に連動する記録は、ここでは編集・削除できません。元の記録を確認してください。');
        return;
      }
      const next = replacement ? {
        ...old, ...replacement, id: old.id, expenseRecorded: false,
        createdAt: old.createdAt, updatedAt: new Date().toISOString(),
      } as SupplyMovement : undefined;
      const others = rows.filter(row => row.id !== id);
      if (next && batchKey(next) !== batchKey(old) &&
          others.some(row => batchKey(row) === batchKey(old))) {
        fail('他の入出庫と同じロットに紐づくため、品名・番号・単位・保管場所は変更できません。');
        return;
      }
      // Never leave a negative balance in either the old or new batch.
      const candidates = next ? [...others, next] : others;
      for (const key of new Set([batchKey(old), ...(next ? [batchKey(next)] : [])])) {
        const sum = candidates.filter(row => batchKey(row) === key)
          .reduce((total, row) => total + (isIncoming(row.action) ? row.quantity : -row.quantity), 0);
        if (sum < -1e-8) {
          fail('変更すると在庫がマイナスになるため処理を中止しました。');
          return;
        }
      }
      if (next) inventory.put(next);
      else inventory.delete(id);
    };
    allInventory.onsuccess = check;
    allExpenses.onsuccess = check;
    allTreatments.onsuccess = check;
    allBreedings.onsuccess = check;
  });
  markLocalChangePending();
}
