import {
  deleteRecord,
  getAllRecords,
  getRecordById,
  saveRecord,
} from '../storage/repository';

export type ExpenseCategory =
  | '飼料費'
  | '敷料費'
  | '医薬品費'
  | '診療費'
  | '種付け・繁殖費'
  | '購入牛費'
  | '水道光熱費'
  | '燃料費'
  | '修繕費'
  | '機械・資材費'
  | '車両費'
  | '保険料'
  | '手数料'
  | '消耗品費'
  | 'その他';

export type PaymentMethod =
  | '現金'
  | '口座振替'
  | '銀行振込'
  | 'クレジットカード'
  | 'JA精算'
  | 'その他';

export type ExpenseRecord = {
  id: string;
  paymentDate: string;
  category: string;
  expenseCategoryMasterId?: number;
  description: string;
  vendor: string;
  vendorMasterId?: number;
  amount: string;
  paymentMethod: string;
  target: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

export type ExpenseInput = Omit<
  ExpenseRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export const expenseCategoryOptions: ExpenseCategory[] = [
  '飼料費',
  '敷料費',
  '医薬品費',
  '診療費',
  '種付け・繁殖費',
  '購入牛費',
  '水道光熱費',
  '燃料費',
  '修繕費',
  '機械・資材費',
  '車両費',
  '保険料',
  '手数料',
  '消耗品費',
  'その他',
];

export const paymentMethodOptions: PaymentMethod[] = [
  '現金',
  '口座振替',
  '銀行振込',
  'クレジットカード',
  'JA精算',
  'その他',
];

export const emptyExpenseInput: ExpenseInput = {
  paymentDate: '',
  category: '',
  expenseCategoryMasterId: undefined,
  description: '',
  vendor: '',
  vendorMasterId: undefined,
  amount: '',
  paymentMethod: '現金',
  target: '',
  memo: '',
};

export function recordToInput(record: ExpenseRecord): ExpenseInput {
  return {
    paymentDate: record.paymentDate || '',
    category: record.category || '',
    expenseCategoryMasterId: record.expenseCategoryMasterId,
    description: record.description || '',
    vendor: record.vendor || '',
    vendorMasterId: record.vendorMasterId,
    amount: record.amount || '',
    paymentMethod: record.paymentMethod || '現金',
    target: record.target || '',
    memo: record.memo || '',
  };
}

export async function getExpensesList(): Promise<ExpenseRecord[]> {
  return getAllRecords<ExpenseRecord>('expenses');
}

export async function getExpense(id: string): Promise<ExpenseRecord> {
  const record = await getRecordById<ExpenseRecord>('expenses', id);

  if (!record) {
    throw new Error('経費記録を取得できませんでした。');
  }

  return record;
}

export async function createExpense(
  input: ExpenseInput,
): Promise<ExpenseRecord> {
  const now = new Date().toISOString();

  const record: ExpenseRecord = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  };

  return saveRecord('expenses', record);
}

export async function updateExpense(
  id: string,
  input: ExpenseInput,
): Promise<ExpenseRecord> {
  const existing = await getRecordById<ExpenseRecord>('expenses', id);

  if (!existing) {
    throw new Error('経費記録を更新できませんでした。');
  }

  return saveRecord('expenses', {
    ...existing,
    ...input,
    id,
  });
}

export async function deleteExpense(id: string): Promise<void> {
  await deleteRecord('expenses', id);
}
