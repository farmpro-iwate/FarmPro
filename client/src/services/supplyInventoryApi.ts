import { openFarmProDatabase } from '../storage/db';
import { getAllRecords } from '../storage/repository';

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
    id,
    expenseRecorded: recordExpense,
    createdAt: now,
    updatedAt: now,
  };

  return new Promise<string>((resolve, reject) => {
    const storeNames = recordExpense ? ['supplyInventory', 'expenses'] : ['supplyInventory'];
    const transaction = db.transaction(storeNames, 'readwrite');
    const supplyStore = transaction.objectStore('supplyInventory');
    let validationError: Error | null = null;

    transaction.oncomplete = () => resolve(id);
    transaction.onabort = () => reject(validationError || transaction.error || new Error('保存を完了できませんでした。'));

    const request = supplyStore.getAll();
    request.onsuccess = () => {
      const rows = request.result as SupplyMovement[];
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
        transaction.objectStore('expenses').add({
          id: 'supply-expense-' + id,
          paymentDate: input.date,
          category,
          description: input.itemName.trim() + ' 購入（' + input.lotNumber.trim() + '）',
          vendor: input.supplier.trim(),
          amount: String(input.amount),
          paymentMethod: input.paymentMethod || '現金',
          target: '農場全体',
          memo: '在庫購入から登録（同じ支払いを再登録しないでください）',
          sourceSupplyMovementId: id,
          createdAt: now,
          updatedAt: now,
        });
      }
    };
  });
}
